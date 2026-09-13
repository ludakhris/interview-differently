import {
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
import { ImmersiveSessionsService } from './immersive-sessions.service'
import { TranscriptionService } from '../transcription/transcription.service'
import { ClerkService } from '../auth/clerk.service'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import { assertOwnerOrAdmin, type AuthedRequest } from '../auth/owner'

interface CreateSessionDto {
  scenarioId: string
}

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
  ) {}

  @Post()
  @HttpCode(201)
  createSession(@Req() req: AuthedRequest, @Body() dto: CreateSessionDto) {
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
    @Body() body: Record<string, string>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    await this.assertSession(req, sessionId)
    try {
      // Save immediately so the frontend can navigate without waiting for Whisper
      const response = await this.service.createResponse(
        sessionId,
        body.nodeId,
        body.questionText,
        null,
        null,
        body.durationSeconds != null ? Number(body.durationSeconds) : null,
      )

      // Transcribe AND upload to private storage in parallel — both are
      // best-effort background tasks that never block the HTTP response.
      if (file?.buffer) {
        void this.transcription
          .transcribe(file.buffer, file.originalname)
          .then(transcript => transcript ? this.service.updateTranscript(response.id, transcript) : null)
          .catch(() => {/* best effort */})

        // Preserve the recorder's content-type so playback works for both
        // audio-only and audio+video webm.
        const contentType = file.mimetype || 'audio/webm'
        const ext = contentType.startsWith('video/') ? 'webm' : 'webm'
        void this.service
          .storeResponseMedia(sessionId, response.id, file.buffer, contentType, ext)
          .catch(() => {/* best effort */})
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
    @Param('responseId') responseId: string,
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
    @Param('responseId') responseId: string,
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
