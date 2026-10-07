import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpException,
  HttpStatus,
  ForbiddenException,
  Inject,
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
import { LTI_STORE, type LtiStore } from '../lti/lti-store'
import { AuthenticatedOrLtiGuard, type LtiRequest } from '../lti/tool/lti-session.guard'
import { assertOwnerOrAdmin, type AuthedRequest } from '../auth/owner'

type Req = AuthedRequest & Pick<LtiRequest, 'lti'>

const LTI_WRITES_PER_MINUTE = 20

/**
 * Stored when transcription ran but heard nothing, so the answer counts as given (and scores low)
 * and the player is not left waiting for a transcript that will never come.
 */
export const NO_SPEECH_TRANSCRIPT = '[No speech was detected in this answer.]'

/**
 * Stored when the transcription service failed outright, so the player can ask for the answer
 * again at once instead of waiting for a transcript that will never come.
 */
export const TRANSCRIPTION_FAILED = '[This answer could not be transcribed.]'

/** Whisper turns silence and room noise into stray words ("Bye."), so a few words is not an answer. */
const MIN_ANSWER_WORDS = 3

/** The transcript to store: what was heard, or the no-speech marker when it is not an answer. */
export function transcriptOrNoSpeech(heard: string): string {
  return heard.trim().split(/\s+/).filter(Boolean).length >= MIN_ANSWER_WORDS
    ? heard.trim()
    : NO_SPEECH_TRANSCRIPT
}

interface CreateSessionDto {
  scenarioId: string
}

/**
 * Immersive (avatar) sessions. Signed-in only; sessions are created for
 * the caller and every read/write on a session is own-or-admin (#27). An LTI session (#63) is
 * limited by the guard to the routes the player needs and, here, to its own sessions of its ref.
 */
@Controller('immersive-sessions')
@UseGuards(AuthenticatedOrLtiGuard)
export class ImmersiveSessionsController {
  constructor(
    private readonly service: ImmersiveSessionsService,
    private readonly transcription: TranscriptionService,
    private readonly clerk: ClerkService,
    @Inject(LTI_STORE) private readonly store: LtiStore
  ) {}

  /** An LTI session may write at most 20 a minute per route; 429 over that. */
  private async limit(req: Req, scope: string) {
    if (!req.lti) return
    if ((await this.store.count(`rl:${scope}`, req.userId, 60)) > LTI_WRITES_PER_MINUTE)
      throw new HttpException('Too many requests. Wait a minute and try again.', 429)
  }

  @Post()
  @HttpCode(201)
  async createSession(@Req() req: Req, @Body() dto: CreateSessionDto) {
    await this.limit(req, 'immersive-create')
    return this.service.createSession(dto.scenarioId, req.userId)
  }

  @Get('user/:userId')
  async getSessionsForUser(@Req() req: AuthedRequest, @Param('userId') userId: string) {
    await assertOwnerOrAdmin(this.clerk, req, userId)
    return this.service.getSessionsForUser(userId)
  }

  @Get(':sessionId')
  async getSession(@Req() req: Req, @Param('sessionId') sessionId: string) {
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
    @Req() req: Req,
    @Param('sessionId') sessionId: string,
    @Body() body: Record<string, string>,
    @UploadedFile() file?: Express.Multer.File
  ) {
    await this.assertSession(req, sessionId)
    await this.limit(req, 'immersive-response')
    try {
      // Save immediately so the frontend can navigate without waiting for Whisper
      const response = await this.service.createResponse(
        sessionId,
        body.nodeId,
        body.questionText,
        null,
        null,
        body.durationSeconds != null ? Number(body.durationSeconds) : null
      )

      // Transcribe AND upload to private storage in parallel — both are
      // best-effort background tasks that never block the HTTP response.
      if (file?.buffer) {
        void this.transcription
          .transcribe(file.buffer, file.originalname)
          .then((transcript) =>
            // null means the transcription itself failed; '' or a few stray words mean no speech.
            this.service.updateTranscript(
              response.id,
              transcript === null ? TRANSCRIPTION_FAILED : transcriptOrNoSpeech(transcript)
            )
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
    @Req() req: Req,
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
    @Req() req: Req,
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
  async getSessionSummary(@Req() req: Req, @Param('sessionId') sessionId: string) {
    await this.assertSession(req, sessionId)
    try {
      return await this.service.getSessionSummary(sessionId)
    } catch (err) {
      if (err instanceof NotFoundException) throw err
      throw new HttpException('Summary generation failed', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  /**
   * 404 for unknown sessions, 403 unless the caller owns it or is a full admin. An LTI session
   * has no admin override: it must own the session and the session must be for its ref.
   */
  private async assertSession(req: Req, sessionId: string): Promise<void> {
    if (req.lti) {
      const found = await this.service.getSessionRef(sessionId)
      if (!found) throw new NotFoundException(`Session ${sessionId} not found`)
      if (found.userId !== req.userId || found.scenarioId !== req.lti.ref)
        throw new ForbiddenException('Not authorised to access this record')
      return
    }
    const ownerUserId = await this.service.getSessionOwner(sessionId)
    if (!ownerUserId) throw new NotFoundException(`Session ${sessionId} not found`)
    await assertOwnerOrAdmin(this.clerk, req, ownerUserId)
  }
}
