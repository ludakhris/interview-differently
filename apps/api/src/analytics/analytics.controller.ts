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

  /**
   * Per-scenario engagement: starts, completions, drops, retried users, avg
   * score. Combines traditional (SimulationAttempt + SimulationResult) and
   * immersive (ImmersiveSession) data per scenarioId. Same scope filter as
   * the overview endpoint.
   */
  @Get('institutions/:institutionId/engagement')
  @InstitutionAdminAllowed()
  getScenarioEngagement(
    @Param('institutionId') institutionId: string,
    @Query('cohortId') cohortId?: string,
  ) {
    return this.service.getScenarioEngagement(institutionId, cohortId || undefined)
  }

  /**
   * Per-student detail view: profile, all completions, dimension trend series.
   * Verifies the student is actually a member of the institution before returning.
   */
  @Get('institutions/:institutionId/students/:userId')
  @InstitutionAdminAllowed()
  getStudentDetail(
    @Param('institutionId') institutionId: string,
    @Param('userId') userId: string,
  ) {
    return this.service.getStudentDetail(institutionId, userId)
  }

  /**
   * Competency heatmap data — students × dimensions grid with per-cell
   * averages. Anonymisation is a frontend toggle; the API always returns
   * both the anonymous label (Student NN) and the real name/email so the
   * UI can swap without a refetch.
   */
  @Get('institutions/:institutionId/heatmap')
  @InstitutionAdminAllowed()
  getCompetencyHeatmap(
    @Param('institutionId') institutionId: string,
    @Query('cohortId') cohortId?: string,
  ) {
    return this.service.getCompetencyHeatmap(institutionId, cohortId || undefined)
  }
}
