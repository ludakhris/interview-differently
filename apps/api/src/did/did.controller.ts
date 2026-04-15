import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { DidService } from './did.service'

interface CreateStreamDto {
  sourceUrl: string
}

interface SendAnswerDto {
  answer: RTCSessionDescriptionInit
  sessionId: string
}

interface SendIceDto {
  candidate: string
  sdpMid: string
  sdpMLineIndex: number
  sessionId: string
}

interface SendTalkDto {
  text: string
  voiceId: string
  sessionId: string
}

interface CloseStreamDto {
  sessionId: string
}

@Controller('did')
export class DidController {
  constructor(private readonly service: DidService) {}

  @Get('presenters')
  async getPresenters() {
    try {
      return await this.service.getPresenters()
    } catch {
      throw new HttpException('Failed to fetch presenters', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  @Post('streams')
  @HttpCode(201)
  async createStream(@Body() dto: CreateStreamDto) {
    try {
      return await this.service.createStream(dto.sourceUrl)
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      const msg = raw.includes('Max user sessions reached')
        ? 'Avatar is temporarily busy — please wait a few seconds and try again'
        : raw || 'Failed to create D-ID stream'
      throw new HttpException(msg, HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  @Post('streams/:streamId/sdp')
  @HttpCode(200)
  async sendAnswer(@Param('streamId') streamId: string, @Body() dto: SendAnswerDto) {
    try {
      return await this.service.sendAnswer(streamId, dto.answer, dto.sessionId)
    } catch {
      throw new HttpException('Failed to send SDP answer', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  @Post('streams/:streamId/ice')
  @HttpCode(200)
  async sendIce(@Param('streamId') streamId: string, @Body() dto: SendIceDto) {
    try {
      return await this.service.sendIceCandidate(
        streamId,
        dto.candidate,
        dto.sdpMid,
        dto.sdpMLineIndex,
        dto.sessionId,
      )
    } catch {
      throw new HttpException('Failed to send ICE candidate', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  @Post('streams/:streamId/talk')
  @HttpCode(200)
  async sendTalk(@Param('streamId') streamId: string, @Body() dto: SendTalkDto) {
    try {
      return await this.service.sendTalk(streamId, dto.text, dto.voiceId, dto.sessionId)
    } catch {
      throw new HttpException('Failed to send talk request', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  @Delete('streams/:streamId')
  @HttpCode(200)
  async closeStream(@Param('streamId') streamId: string, @Body() dto: CloseStreamDto) {
    try {
      return await this.service.closeStream(streamId, dto.sessionId)
    } catch {
      throw new HttpException('Failed to close stream', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }
}
