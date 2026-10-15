import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { Response } from 'express'
import type { LessonPlayerView } from '../core/lesson-types'
import { isPreview, type SparkLink } from './player-token'
import { SparkPlayerGuard, type SparkPlayerRequest } from './spark-player.guard'
import { SparkService } from './spark.service'

const tokenOf = (req: SparkPlayerRequest): SparkLink => req.sparkPlayer as SparkLink

/**
 * Spark's lesson player (apps/spark): the lesson a signed link opens, its narration, and how it was watched. A
 * reviewer's preview link plays the same lesson and records nothing.
 */
@Controller('spark/lesson')
@UseGuards(SparkPlayerGuard)
export class SparkPlayerController {
  constructor(private readonly spark: SparkService) {}

  @Get()
  view(@Req() req: SparkPlayerRequest): Promise<LessonPlayerView> {
    return this.spark.playerView(tokenOf(req))
  }

  @Get('audio/:scene')
  async audio(
    @Req() req: SparkPlayerRequest,
    @Param('scene') scene: string,
    @Res() res: Response
  ): Promise<void> {
    const wav = await this.spark.sceneAudio(tokenOf(req), /^\d+$/.test(scene) ? Number(scene) : -1)
    if (!wav) throw new NotFoundException('This server has no voice; use the browser voice')
    res.setHeader('Content-Type', 'audio/wav')
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.send(wav)
  }

  @Post('event')
  @HttpCode(204)
  async event(@Req() req: SparkPlayerRequest, @Body() body: unknown): Promise<void> {
    const token = tokenOf(req)
    // A preview is watched by a reviewer, not a learner: nothing is recorded.
    if (isPreview(token)) return
    if (!(await this.spark.recordEvent(token, body)))
      throw new BadRequestException('Unknown lesson event')
  }
}
