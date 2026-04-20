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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ImmersiveSessionsService } from './immersive-sessions.service'
import { TranscriptionService } from '../transcription/transcription.service'

interface CreateSessionDto {
  scenarioId: string
  userId: string
}

@Controller('immersive-sessions')
export class ImmersiveSessionsController {
  constructor(
    private readonly service: ImmersiveSessionsService,
    private readonly transcription: TranscriptionService,
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

      // Transcribe in the background — never blocks the HTTP response
      if (file?.buffer) {
        void this.transcription
          .transcribe(file.buffer, file.originalname)
          .then(transcript => transcript ? this.service.updateTranscript(response.id, transcript) : null)
          .catch(() => {/* best effort */})
      }

      return response
    } catch (err) {
      if (err instanceof NotFoundException) throw err
      throw new HttpException('Failed to save response', HttpStatus.INTERNAL_SERVER_ERROR)
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
