import { Controller, Get, Res } from '@nestjs/common'
import type { Response } from 'express'
import { GradingHealthService } from './grading-health.service'

/**
 * What the public endpoints say: whether grading is working, and when that was known. The reasons and memory figures
 * stay on the admin System status page, so an outsider learns nothing about the system from them; a monitor needs only
 * the status code.
 */
export interface PublicSelfTest {
  status: 'ok' | 'failing' | 'busy'
  checkedAt: string
}
export interface PublicRecentFailures {
  status: 'ok' | 'failing'
  failures: number
  windowMinutes: number
}

/**
 * Two checks of grading for an uptime monitor to alert on (GitHub issue #92); Railway's deploy healthcheck stays on
 * /health, so neither blocks an unrelated deploy.
 *
 * GET /health/grading/self-test: loads the practice dataset in a grading process and runs a query, through the same runner and
 * limits as a learner's answer (GitHub issue #92). 200 when it works; 503 with the reason when it does not, or when the
 * process leaves less than HEADROOM_MB of its memory limit (an early warning, before answers start failing), for an
 * uptime monitor to alert on. Busy (every grading slot taken by learners) is not a failure: 200, not reused. It
 * answers "can grading run?", even when no learner is grading.
 *
 * GET /health/grading/recent-failures: learner grading that failed in the last 15 minutes through no fault of their
 * query (it would not run, or every slot was busy), from every product that grades. 503 when there was any. It answers
 * "is grading working for learners?". Read from the ServiceFailure table, so a deploy does not reset it.
 */
@Controller('health')
export class GradingHealthController {
  constructor(private readonly health: GradingHealthService) {}

  @Get('grading/recent-failures')
  async recentFailures(@Res({ passthrough: true }) res: Response): Promise<PublicRecentFailures> {
    const { status, failures, windowMinutes } = await this.health.recentFailures()
    if (status === 'failing') res.status(503)
    return { status, failures, windowMinutes }
  }

  @Get('grading/self-test')
  async selfTest(@Res({ passthrough: true }) res: Response): Promise<PublicSelfTest> {
    const { status, checkedAt } = await this.health.check()
    if (status === 'failing') res.status(503)
    return { status, checkedAt }
  }
}
