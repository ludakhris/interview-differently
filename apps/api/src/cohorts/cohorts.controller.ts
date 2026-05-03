import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common'
import { AdminGuard } from '../auth/admin.guard'
import { CohortsService, type AddMemberInput, type CohortInput } from './cohorts.service'

/**
 * Cohort CRUD + member management.
 *
 * Routes are nested under institutions for list/create (so we can scope to
 * the parent institution). Per-cohort and per-membership routes use the
 * cohort id directly since it's globally unique.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class CohortsController {
  constructor(private readonly service: CohortsService) {}

  @Get('institutions/:institutionId/cohorts')
  list(@Param('institutionId') institutionId: string) {
    return this.service.listForInstitution(institutionId)
  }

  @Post('institutions/:institutionId/cohorts')
  create(@Param('institutionId') institutionId: string, @Body() body: CohortInput) {
    return this.service.create(institutionId, body)
  }

  @Put('cohorts/:cohortId')
  update(@Param('cohortId') cohortId: string, @Body() body: Partial<CohortInput>) {
    return this.service.update(cohortId, body)
  }

  @Delete('cohorts/:cohortId')
  @HttpCode(204)
  async remove(@Param('cohortId') cohortId: string): Promise<void> {
    await this.service.remove(cohortId)
  }

  @Get('cohorts/:cohortId/members')
  listMembers(@Param('cohortId') cohortId: string) {
    return this.service.listMembers(cohortId)
  }

  @Post('cohorts/:cohortId/members')
  addMember(@Param('cohortId') cohortId: string, @Body() body: AddMemberInput) {
    return this.service.addMember(cohortId, body)
  }

  @Delete('cohorts/:cohortId/members/:membershipId')
  @HttpCode(204)
  async removeMember(
    @Param('cohortId') cohortId: string,
    @Param('membershipId') membershipId: string,
  ): Promise<void> {
    await this.service.removeMember(cohortId, membershipId)
  }
}
