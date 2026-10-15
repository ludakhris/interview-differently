import { Injectable } from '@nestjs/common'
import { ServiceFailureLog } from '../core/service-failure-log'
import type { LessonFailureKind } from '../core/status-port'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Lessons made for a learner that Spark could not write (GitHub issue #92), kept as the 'lessons' rows of the
 * ServiceFailure table: 'not-configured' when the AI service is not configured, 'no-lesson' when two tries gave no
 * usable lesson.
 */
@Injectable()
export class LessonFailureLog extends ServiceFailureLog<LessonFailureKind> {
  constructor(prisma: PrismaService) {
    super(prisma, 'lessons', ['not-configured', 'no-lesson'])
  }
}
