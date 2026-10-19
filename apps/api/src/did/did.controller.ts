import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common'
import { DidService } from './did.service'
import { AuthenticatedGuard } from '../auth/authenticated.guard'

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

const MAX_ID = 2000
const MAX_TALK = 20_000
const MAX_SDP = 100_000
// The stream id goes into D-ID's URL path: refuse anything that could reach another path ("/", "..", "?", "%").
const STREAM_ID = /^(?!\.{1,2}$)[^/\\?#%\s]{1,200}$/

/** A text field of a request body: a string of `min` to `max` characters, or a 400. */
function text(v: unknown, field: string, max: number, min = 1): string {
  if (typeof v !== 'string' || v.length < min || v.length > max)
    throw new BadRequestException(`${field} must be text of at most ${max} characters`)
  return v
}

function streamIdOf(v: string): string {
  if (!STREAM_ID.test(v)) throw new BadRequestException('streamId is not valid')
  return v
}

function answerOf(v: unknown): RTCSessionDescriptionInit {
  const a = v as { type?: unknown; sdp?: unknown } | null
  if (typeof a !== 'object' || a === null || Array.isArray(a))
    throw new BadRequestException('answer must be an object')
  text(a.type, 'answer.type', 20)
  text(a.sdp, 'answer.sdp', MAX_SDP)
  return a as RTCSessionDescriptionInit
}

/** Signed-in only — every stream costs D-ID credits (#27). */
@Controller('did')
@UseGuards(AuthenticatedGuard)
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
    const sourceUrl = text(dto?.sourceUrl, 'sourceUrl', MAX_ID)
    if (!sourceUrl.startsWith('https://')) throw new BadRequestException('sourceUrl must be https')
    try {
      return await this.service.createStream(sourceUrl)
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
    const id = streamIdOf(streamId)
    const answer = answerOf(dto?.answer)
    const sessionId = text(dto?.sessionId, 'sessionId', MAX_ID)
    try {
      return await this.service.sendAnswer(id, answer, sessionId)
    } catch {
      throw new HttpException('Failed to send SDP answer', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  @Post('streams/:streamId/ice')
  @HttpCode(200)
  async sendIce(@Param('streamId') streamId: string, @Body() dto: SendIceDto) {
    const id = streamIdOf(streamId)
    // An end-of-candidates signal has an empty candidate.
    const candidate = text(dto?.candidate, 'candidate', MAX_ID, 0)
    const sdpMid = text(dto?.sdpMid, 'sdpMid', 100, 0)
    const sdpMLineIndex = dto?.sdpMLineIndex
    if (!Number.isInteger(sdpMLineIndex) || sdpMLineIndex < 0 || sdpMLineIndex > 1000)
      throw new BadRequestException('sdpMLineIndex must be a whole number')
    const sessionId = text(dto?.sessionId, 'sessionId', MAX_ID)
    try {
      return await this.service.sendIceCandidate(id, candidate, sdpMid, sdpMLineIndex, sessionId)
    } catch {
      throw new HttpException('Failed to send ICE candidate', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  @Post('streams/:streamId/talk')
  @HttpCode(200)
  async sendTalk(@Param('streamId') streamId: string, @Body() dto: SendTalkDto) {
    const id = streamIdOf(streamId)
    const talk = text(dto?.text, 'text', MAX_TALK)
    const voiceId = text(dto?.voiceId, 'voiceId', 100)
    const sessionId = text(dto?.sessionId, 'sessionId', MAX_ID)
    try {
      return await this.service.sendTalk(id, talk, voiceId, sessionId)
    } catch {
      throw new HttpException('Failed to send talk request', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  @Delete('streams/:streamId')
  @HttpCode(200)
  async closeStream(@Param('streamId') streamId: string, @Body() dto: CloseStreamDto) {
    const id = streamIdOf(streamId)
    const sessionId = text(dto?.sessionId, 'sessionId', MAX_ID)
    try {
      return await this.service.closeStream(id, sessionId)
    } catch {
      throw new HttpException('Failed to close stream', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }
}
