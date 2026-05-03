import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ImmersiveSessionsService } from './immersive-sessions.service'
import { TranscriptionService } from '../transcription/transcription.service'
import { ClerkService } from '../auth/clerk.service'

interface CreateSessionDto {
  scenarioId: string
  userId: string
}

@Controller('immersive-sessions')
export class ImmersiveSessionsController {
  constructor(
    private readonly service: ImmersiveSessionsService,
    private readonly transcription: TranscriptionService,
    private readonly clerk: ClerkService,
  ) {}

  @Post()
  @HttpCode(201)
  createSession(@Body() dto: CreateSessionDto) {
    return this.service.createSession(dto.scenarioId, dto.userId)
  }

  @Get('user/:userId')
  getSessionsForUser(@Param('userId') userId: string) {
    return this.service.getSessionsForUser(userId)
  }

  @Get(':sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
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
    @Param('sessionId') sessionId: string,
    @Body() body: Record<string, string>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
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

  /**
   * Time-limited signed URL for playing back a candidate's recorded response.
   * Auth: requires a valid Clerk Bearer JWT, and the requesting user must
   * either own the session OR have publicMetadata.role === 'admin'.
   */
  @Get(':sessionId/responses/:responseId/media-url')
  async getResponseMediaUrl(
    @Param('sessionId') sessionId: string,
    @Param('responseId') responseId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const token = authHeader?.replace(/^Bearer\s+/i, '')
    if (!token) throw new UnauthorizedException('Missing bearer token')
    const requestingUserId = await this.clerk.verifyBearerToken(token)
    if (!requestingUserId) throw new UnauthorizedException('Invalid token')

    const ownerUserId = await this.service.getSessionOwner(sessionId)
    if (!ownerUserId) throw new NotFoundException(`Session ${sessionId} not found`)

    if (ownerUserId !== requestingUserId) {
      const isAdmin = await this.clerk.isAdmin(requestingUserId)
      if (!isAdmin) throw new ForbiddenException('Not authorised to view this response')
    }

    try {
      return await this.service.getResponseSignedUrl(sessionId, responseId)
    } catch (err) {
      if (err instanceof NotFoundException) throw err
      throw new HttpException('Failed to generate signed URL', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  @Get(':sessionId/responses/:responseId')
  async getResponse(
    @Param('sessionId') sessionId: string,
    @Param('responseId') responseId: string,
  ) {
    try {
      return await this.service.getResponse(sessionId, responseId)
    } catch (err) {
      if (err instanceof NotFoundException) throw err
      throw new HttpException('AI feedback unavailable', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  @Get(':sessionId/summary')
  async getSessionSummary(@Param('sessionId') sessionId: string) {
    try {
      return await this.service.getSessionSummary(sessionId)
    } catch (err) {
      if (err instanceof NotFoundException) throw err
      throw new HttpException('Summary generation failed', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }
}
