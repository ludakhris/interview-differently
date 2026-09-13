import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common'
import { AdminGuard, InstitutionAdminAllowed } from '../auth/admin.guard'
import { InstitutionScope, type AdminRequest } from '../auth/scope'
import { CohortsService, type AddMemberInput, type CohortInput } from './cohorts.service'

/**
 * Cohort CRUD + member management.
 *
 * Routes are nested under institutions for list/create (so we can scope to
 * the parent institution). Per-cohort and per-membership routes use the
 * cohort id directly since it's globally unique.
 *
 * Institution-admins may do everything here within their own institutions
 * except change roles (full-admin only).
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class CohortsController {
  constructor(
    private readonly service: CohortsService,
    private readonly scope: InstitutionScope,
  ) {}

  @Get('institutions/:institutionId/cohorts')
  @InstitutionAdminAllowed()
  list(@Req() req: AdminRequest, @Param('institutionId') institutionId: string) {
    this.scope.assertInstitution(req, institutionId)
    return this.service.listForInstitution(institutionId)
  }

  @Post('institutions/:institutionId/cohorts')
  @InstitutionAdminAllowed()
  create(@Req() req: AdminRequest, @Param('institutionId') institutionId: string, @Body() body: CohortInput) {
    this.scope.assertInstitution(req, institutionId)
    return this.service.create(institutionId, body)
  }

  @Put('cohorts/:cohortId')
  @InstitutionAdminAllowed()
  async update(@Req() req: AdminRequest, @Param('cohortId') cohortId: string, @Body() body: Partial<CohortInput>) {
    await this.scope.assertCohort(req, cohortId)
    return this.service.update(cohortId, body)
  }

  @Delete('cohorts/:cohortId')
  @HttpCode(204)
  @InstitutionAdminAllowed()
  async remove(@Req() req: AdminRequest, @Param('cohortId') cohortId: string): Promise<void> {
    await this.scope.assertCohort(req, cohortId)
    await this.service.remove(cohortId)
  }

  @Get('cohorts/:cohortId/members')
  @InstitutionAdminAllowed()
  async listMembers(@Req() req: AdminRequest, @Param('cohortId') cohortId: string) {
    await this.scope.assertCohort(req, cohortId)
    return this.service.listMembers(cohortId)
  }

  @Post('cohorts/:cohortId/members')
  @InstitutionAdminAllowed()
  async addMember(@Req() req: AdminRequest, @Param('cohortId') cohortId: string, @Body() body: AddMemberInput) {
    await this.scope.assertCohort(req, cohortId)
    return this.service.addMember(cohortId, body)
  }

  @Delete('cohorts/:cohortId/members/:membershipId')
  @HttpCode(204)
  @InstitutionAdminAllowed()
  async removeMember(
    @Req() req: AdminRequest,
    @Param('cohortId') cohortId: string,
    @Param('membershipId') membershipId: string,
  ): Promise<void> {
    await this.scope.assertCohort(req, cohortId)
    await this.service.removeMember(cohortId, membershipId)
  }

  /** Full-admin only: promote/demote a member to institution-admin. */
  @Put('users/:userId/role')
  @HttpCode(204)
  async setRole(@Param('userId') userId: string, @Body() body: { role: 'institution-admin' | null }): Promise<void> {
    await this.service.setMemberRole(userId, body.role ?? null)
  }
}
