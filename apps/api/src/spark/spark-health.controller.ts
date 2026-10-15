import { Controller, Get, Res } from '@nestjs/common'
import type { Response } from 'express'
import { SparkHealthService, type VideosHealth } from './spark-health.service'

/** What GET /health/videos/recent-failures says: whether learners could not get lessons, and how many. */
export interface PublicVideoFailures {
  status: 'ok' | 'failing'
  failures: number
  windowMinutes: number
}

/**
 * Two checks of Spark's lessons (which play like videos) for an uptime monitor to alert on (GitHub issue #92), like
 * grading's. They say only a status and a time (or a count): the reasons stay on the admin System status page. Railway's
 * deploy healthcheck stays on /health.
 *
 * GET /health/videos/setup: 200 when lessons are set up (the AI service is configured and, in production, the link
 * secret and the player's address are set) and the player's page answers; 503 otherwise. The player check is reused
 * for five minutes. It answers "can a learner get a video?".
 *
 * GET /health/videos/recent-failures: lessons made for a learner that could not be written in the last 15 minutes.
 * 503 when there was any. It answers "are videos working for learners?". Read from the ServiceFailure table, so a
 * deploy does not reset it.
 */
@Controller('health')
export class SparkHealthController {
  constructor(private readonly health: SparkHealthService) {}

  @Get('videos/setup')
  async setup(@Res({ passthrough: true }) res: Response): Promise<VideosHealth> {
    const { status, checkedAt } = await this.health.videos()
    if (status === 'failing') res.status(503)
    return { status, checkedAt }
  }

  @Get('videos/recent-failures')
  async recentFailures(@Res({ passthrough: true }) res: Response): Promise<PublicVideoFailures> {
    const { status, failures, windowMinutes } = await this.health.recentFailures()
    if (status === 'failing') res.status(503)
    return { status, failures, windowMinutes }
  }
}
