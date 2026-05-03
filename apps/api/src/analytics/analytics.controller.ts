import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { AdminGuard, InstitutionAdminAllowed } from '../auth/admin.guard'
import { AnalyticsService } from './analytics.service'

@Controller('admin')
@UseGuards(AdminGuard)
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  /**
   * Institution + cohort overview metrics. When `cohortId` is omitted,
   * returns institution-wide aggregates plus a per-cohort breakdown table.
   * When `cohortId` is set, scope is filtered to that cohort (no breakdown).
   */
  @Get('institutions/:institutionId/analytics')
  @InstitutionAdminAllowed()
  getInstitutionAnalytics(
    @Param('institutionId') institutionId: string,
    @Query('cohortId') cohortId?: string,
  ) {
    return this.service.getInstitutionAnalytics(institutionId, cohortId || undefined)
  }
}
