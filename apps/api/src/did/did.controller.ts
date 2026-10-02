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
  BadRequestException,
  ForbiddenException,
  Req,
  UseGuards,
} from '@nestjs/common'
import { IsInt, IsNotEmpty, IsObject, IsString, Matches, MaxLength } from 'class-validator'
import { DidService } from './did.service'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import type { AuthedRequest } from '../auth/owner'
import { UserQuota } from '../common/user-quota'

class CreateStreamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  sourceUrl!: string
}

class SendAnswerDto {
  @IsObject()
  answer!: RTCSessionDescriptionInit

  @IsString()
  @MaxLength(200)
  sessionId!: string
}

class SendIceDto {
  @IsString()
  @MaxLength(2000)
  candidate!: string

  @IsString()
  @MaxLength(200)
  sdpMid!: string

  @IsInt()
  sdpMLineIndex!: number

  @IsString()
  @MaxLength(200)
  sessionId!: string
}

class SendTalkDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1500) // one interviewer turn; scripts elsewhere top out ~1200 chars
  text!: string

  @IsString()
  @Matches(/^[\w.-]{1,100}$/)
  voiceId!: string

  @IsString()
  @MaxLength(200)
  sessionId!: string
}

class CloseStreamDto {
  @IsString()
  @MaxLength(200)
  sessionId!: string
}

// Every stream and every spoken line costs D-ID credits, so cap per user.
const STREAMS = new UserQuota(20, 60 * 60 * 1000, 'Avatar session limit reached')
const TALKS = new UserQuota(120, 60 * 60 * 1000, 'Avatar speech limit reached')
const STREAM_TTL_MS = 2 * 60 * 60 * 1000

/** Signed-in only — every stream costs D-ID credits (#27). */
@Controller('did')
@UseGuards(AuthenticatedGuard)
export class DidController {
  /**
   * streamId → owner. D-ID stream ids are not secret to the browser that
   * opened them, so bind each to the creating user; otherwise any signed-in
   * user could talk over or close someone else's stream. Per instance (a
   * restart mid-session forces the avatar to reconnect).
   */
  private readonly owners = new Map<string, { userId: string; at: number }>()

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
  async createStream(@Req() req: AuthedRequest, @Body() dto: CreateStreamDto) {
    STREAMS.assert(req.userId)
    let allowed = false
    try {
      allowed = await this.service.isCuratedSourceUrl(dto.sourceUrl)
    } catch {
      throw new HttpException('Failed to fetch presenters', HttpStatus.SERVICE_UNAVAILABLE)
    }
    if (!allowed) throw new BadRequestException('Unknown presenter image')
    try {
      const stream = await this.service.createStream(dto.sourceUrl)
      this.remember(stream.id, req.userId)
      return stream
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      // Never echo upstream error bodies to the client.
      const msg = raw.includes('Max user sessions reached')
        ? 'Avatar is temporarily busy — please wait a few seconds and try again'
        : 'Failed to create avatar stream'
      throw new HttpException(msg, HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  @Post('streams/:streamId/sdp')
  @HttpCode(200)
  async sendAnswer(
    @Req() req: AuthedRequest,
    @Param('streamId') streamId: string,
    @Body() dto: SendAnswerDto
  ) {
    this.assertOwner(req, streamId)
    try {
      return await this.service.sendAnswer(streamId, dto.answer, dto.sessionId)
    } catch {
      throw new HttpException('Failed to send SDP answer', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  @Post('streams/:streamId/ice')
  @HttpCode(200)
  async sendIce(
    @Req() req: AuthedRequest,
    @Param('streamId') streamId: string,
    @Body() dto: SendIceDto
  ) {
    this.assertOwner(req, streamId)
    try {
      return await this.service.sendIceCandidate(
        streamId,
        dto.candidate,
        dto.sdpMid,
        dto.sdpMLineIndex,
        dto.sessionId
      )
    } catch {
      throw new HttpException('Failed to send ICE candidate', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  @Post('streams/:streamId/talk')
  @HttpCode(200)
  async sendTalk(
    @Req() req: AuthedRequest,
    @Param('streamId') streamId: string,
    @Body() dto: SendTalkDto
  ) {
    this.assertOwner(req, streamId)
    TALKS.assert(req.userId)
    try {
      return await this.service.sendTalk(streamId, dto.text, dto.voiceId, dto.sessionId)
    } catch {
      throw new HttpException('Failed to send talk request', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  @Delete('streams/:streamId')
  @HttpCode(200)
  async closeStream(
    @Req() req: AuthedRequest,
    @Param('streamId') streamId: string,
    @Body() dto: CloseStreamDto
  ) {
    this.assertOwner(req, streamId)
    try {
      const out = await this.service.closeStream(streamId, dto.sessionId)
      this.owners.delete(streamId)
      return out
    } catch {
      throw new HttpException('Failed to close stream', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  private remember(streamId: string, userId: string): void {
    const now = Date.now()
    this.owners.set(streamId, { userId, at: now })
    if (this.owners.size > 1000) {
      for (const [id, o] of this.owners) if (now - o.at > STREAM_TTL_MS) this.owners.delete(id)
    }
  }

  private assertOwner(req: AuthedRequest, streamId: string): void {
    const o = this.owners.get(streamId)
    if (!o || o.userId !== req.userId || Date.now() - o.at > STREAM_TTL_MS) {
      throw new ForbiddenException('Not your avatar stream')
    }
  }
}
