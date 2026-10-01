import {
  BadRequestException,
  ForbiddenException,
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator'
import { ImmersiveSessionsService } from './immersive-sessions.service'
import { TranscriptionService } from '../transcription/transcription.service'
import { ClerkService } from '../auth/clerk.service'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import { assertOwnerOrAdmin, type AuthedRequest } from '../auth/owner'
import { UserQuota } from '../common/user-quota'
import { ConsentService } from '../consent/consent.service'

class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  scenarioId!: string
}

// Multipart fields arrive as strings.
class CreateResponseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nodeId!: string

  @IsString()
  @MaxLength(4000)
  questionText!: string

  @IsOptional()
  @IsNumberString()
  @MaxLength(6)
  durationSeconds?: string
}

// Each response is a Whisper call plus a stored recording; each summary is a Claude call.
const SESSIONS = new UserQuota(30, 60 * 60 * 1000, 'Session limit reached')
const RESPONSES = new UserQuota(60, 60 * 60 * 1000, 'Response upload limit reached')
const SUMMARIES = new UserQuota(30, 60 * 60 * 1000, 'Summary limit reached')

const ALLOWED_MEDIA = /^(audio|video)\/(webm|mp4|ogg|wav|x-wav|mpeg|x-m4a)(;|$)/

/**
 * Immersive (avatar) sessions. Signed-in only; sessions are created for
 * the caller and every read/write on a session is own-or-admin (#27).
 */
@Controller('immersive-sessions')
@UseGuards(AuthenticatedGuard)
export class ImmersiveSessionsController {
  constructor(
    private readonly service: ImmersiveSessionsService,
    private readonly transcription: TranscriptionService,
    private readonly clerk: ClerkService,
    private readonly consent: ConsentService
  ) {}

  @Post()
  @HttpCode(201)
  createSession(@Req() req: AuthedRequest, @Body() dto: CreateSessionDto) {
    SESSIONS.assert(req.userId)
    return this.service.createSession(dto.scenarioId, req.userId)
  }

  @Get('user/:userId')
  async getSessionsForUser(@Req() req: AuthedRequest, @Param('userId') userId: string) {
    await assertOwnerOrAdmin(this.clerk, req, userId)
    return this.service.getSessionsForUser(userId)
  }

  @Get(':sessionId')
  async getSession(@Req() req: AuthedRequest, @Param('sessionId') sessionId: string) {
    await this.assertSession(req, sessionId)
    try {
      return await this.service.getSession(sessionId)
    } catch (err) {
      if (err instanceof NotFoundException) throw err
      throw new HttpException('Failed to fetch session', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  @Post(':sessionId/responses')
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async createResponse(
    @Req() req: AuthedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: CreateResponseDto,
    @UploadedFile() file?: Express.Multer.File
  ) {
    await this.assertSession(req, sessionId)
    RESPONSES.assert(req.userId)
    // Server-side backstop for the web consent gate: no recordings without recorded consent.
    if (file && !(await this.consent.hasAccepted(req.userId, 'recording'))) {
      throw new ForbiddenException('Recording consent required')
    }
    if (file && !ALLOWED_MEDIA.test(file.mimetype ?? '')) {
      throw new BadRequestException('Unsupported recording type')
    }
    try {
      // Save immediately so the frontend can navigate without waiting for Whisper
      const response = await this.service.createResponse(
        sessionId,
        body.nodeId,
        body.questionText,
        null,
        null,
        body.durationSeconds != null ? Math.min(Number(body.durationSeconds), 3600) : null
      )

      // Transcribe AND upload to private storage in parallel — both are
      // best-effort background tasks that never block the HTTP response.
      if (file?.buffer) {
        void this.transcription
          .transcribe(file.buffer, file.originalname)
          .then((transcript) =>
            transcript ? this.service.updateTranscript(response.id, transcript) : null
          )
          .catch(() => {
            /* best effort */
          })

        // Preserve the recorder's content-type so playback works for both
        // audio-only and audio+video webm.
        const contentType = file.mimetype || 'audio/webm'
        const ext = contentType.startsWith('video/') ? 'webm' : 'webm'
        void this.service
          .storeResponseMedia(sessionId, response.id, file.buffer, contentType, ext)
          .catch(() => {
            /* best effort */
          })
      }

      return response
    } catch (err) {
      if (err instanceof NotFoundException) throw err
      throw new HttpException('Failed to save response', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  /** Time-limited signed URL for playing back a candidate's recorded response. */
  @Get(':sessionId/responses/:responseId/media-url')
  async getResponseMediaUrl(
    @Req() req: AuthedRequest,
    @Param('sessionId') sessionId: string,
    @Param('responseId') responseId: string
  ) {
    await this.assertSession(req, sessionId)
    try {
      return await this.service.getResponseSignedUrl(sessionId, responseId)
    } catch (err) {
      if (err instanceof NotFoundException) throw err
      throw new HttpException('Failed to generate signed URL', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  @Get(':sessionId/responses/:responseId')
  async getResponse(
    @Req() req: AuthedRequest,
    @Param('sessionId') sessionId: string,
    @Param('responseId') responseId: string
  ) {
    await this.assertSession(req, sessionId)
    try {
      return await this.service.getResponse(sessionId, responseId)
    } catch (err) {
      if (err instanceof NotFoundException) throw err
      throw new HttpException('AI feedback unavailable', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  @Get(':sessionId/summary')
  async getSessionSummary(@Req() req: AuthedRequest, @Param('sessionId') sessionId: string) {
    await this.assertSession(req, sessionId)
    SUMMARIES.assert(req.userId)
    try {
      return await this.service.getSessionSummary(sessionId)
    } catch (err) {
      if (err instanceof NotFoundException) throw err
      throw new HttpException('Summary generation failed', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  /** 404 for unknown sessions, 403 unless the caller owns it or is a full admin. */
  private async assertSession(req: AuthedRequest, sessionId: string): Promise<void> {
    const ownerUserId = await this.service.getSessionOwner(sessionId)
    if (!ownerUserId) throw new NotFoundException(`Session ${sessionId} not found`)
    await assertOwnerOrAdmin(this.clerk, req, ownerUserId)
  }
}
