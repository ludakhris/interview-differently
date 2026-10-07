import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { DataAccessLogService } from '../data-access-log.service'
import { ProviderAccessService } from '../provider-access.service'

/**
 * #69: every method must start with the matching check on `access` (assertProviderStaff,
 * assertCohortStaff, or a learner's own enrollment), and staff reads of notes, support items,
 * compensation and resumes must `await audit.record(...)` before returning.
 */
@Injectable()
export class OutcomesService {
  constructor(
    readonly prisma: PrismaService,
    readonly access: ProviderAccessService,
    readonly audit: DataAccessLogService
  ) {}
}
