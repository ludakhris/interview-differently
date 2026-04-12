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

interface CreateSessionDto {
  scenarioId: string
  userId: string
}

interface CreateResponseDto {
  nodeId: string
  questionText: string
  transcript?: string
  durationSeconds?: number
}

@Controller('immersive-sessions')
export class ImmersiveSessionsController {
  constructor(private readonly service: ImmersiveSessionsService) {}

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
  @UseInterceptors(FileInterceptor('file'))
  async createResponse(
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateResponseDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    // mediaUrl is set to null here — storage upload is handled client-side via
    // signed URL or can be wired to a storage service later. The file field is
    // accepted to support future direct upload without a breaking API change.
    const mediaUrl = file ? null : null
    try {
      return await this.service.createResponse(
        sessionId,
        dto.nodeId,
        dto.questionText,
        mediaUrl,
        dto.transcript ?? null,
        dto.durationSeconds ?? null,
      )
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
