import { Injectable } from '@nestjs/common'
import { ServiceFailureLog } from '../../core/service-failure-log'
import type { GradingFailureKind } from '../../core/status-port'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * Learner grading that failed through no fault of their query (GitHub issue #92), kept as the 'grading' rows of the
 * ServiceFailure table: 'infra' when the grading process would not run, 'busy' when every grading slot stayed busy.
 */
@Injectable()
export class GradingFailureLog extends ServiceFailureLog<GradingFailureKind> {
  constructor(prisma: PrismaService) {
    super(prisma, 'grading', ['infra', 'busy'])
  }
}
