import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { AdminGuard, InstitutionAdminAllowed } from '../auth/admin.guard'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import { InstitutionScope, type AdminRequest } from '../auth/scope'
import { AssessmentsService, type DeliveryInput } from './assessments.service'

interface AuthedRequest {
  userId: string
}

@Controller('admin')
@UseGuards(AdminGuard)
export class AssessmentsAdminController {
  constructor(
    private readonly service: AssessmentsService,
    private readonly scope: InstitutionScope,
  ) {}

  @Get('assessments')
  @InstitutionAdminAllowed()
  list(@Req() req: AdminRequest) {
    return this.service.list(this.scope.contentWhere(req))
  }

  @Post('assessments/preview')
  @InstitutionAdminAllowed()
  preview(@Req() req: AdminRequest, @Body() body: { markdown: string }) {
    return this.service.preview(body.markdown, this.scope.contentWhere(req))
  }

  @Post('assessments/import')
  @InstitutionAdminAllowed()
  import(@Req() req: AdminRequest, @Body() body: { markdown: string; institutionId?: string | null }) {
    const owner = this.scope.ownerFor(req, body.institutionId)
    return this.service.import(body.markdown, this.scope.contentWhere(req), owner, (existingOwner) => {
      if (this.scope.isFullAdmin(req)) return true
      return existingOwner !== null && (req.institutionIds ?? []).includes(existingOwner)
    })
  }

  @Get('assessments/:id')
  @InstitutionAdminAllowed()
  async get(@Req() req: AdminRequest, @Param('id') id: string) {
    const a = await this.service.get(id)
    this.scope.assertReadable(req, a.institutionId)
    return a
  }

  @Delete('assessments/:id')
  @HttpCode(204)
  @InstitutionAdminAllowed()
  async remove(@Req() req: AdminRequest, @Param('id') id: string): Promise<void> {
    this.scope.assertOwns(req, (await this.service.get(id)).institutionId)
    await this.service.remove(id)
  }

  @Post('assessments/:id/deliveries')
  @InstitutionAdminAllowed()
  async createDelivery(@Req() req: AdminRequest, @Param('id') id: string, @Body() body: DeliveryInput) {
    this.scope.assertReadable(req, (await this.service.get(id)).institutionId)
    await this.scope.assertCohort(req, body.cohortId)
    return this.service.createDelivery(id, body)
  }

  @Delete('deliveries/:id')
  @HttpCode(204)
  @InstitutionAdminAllowed()
  async removeDelivery(@Req() req: AdminRequest, @Param('id') id: string): Promise<void> {
    await this.scope.assertDelivery(req, id)
    await this.service.removeDelivery(id)
  }

  @Get('deliveries/:id/results')
  @InstitutionAdminAllowed()
  async results(@Req() req: AdminRequest, @Param('id') id: string) {
    await this.scope.assertDelivery(req, id)
    return this.service.deliveryResults(id)
  }

  @Get('institutions/:institutionId/assessments')
  @InstitutionAdminAllowed()
  prePost(@Req() req: AdminRequest, @Param('institutionId') institutionId: string, @Query('cohortId') cohortId?: string) {
    this.scope.assertInstitution(req, institutionId)
    return this.service.institutionPrePost(institutionId, cohortId || undefined)
  }

  @Post('deliveries/:id/invite')
  @InstitutionAdminAllowed()
  async createInvite(@Req() req: AdminRequest, @Param('id') id: string) {
    await this.scope.assertDelivery(req, id)
    return this.service.createInvite(id)
  }

  @Delete('deliveries/:id/invite')
  @HttpCode(204)
  @InstitutionAdminAllowed()
  async revokeInvite(@Req() req: AdminRequest, @Param('id') id: string): Promise<void> {
    await this.scope.assertDelivery(req, id)
    await this.service.revokeInvite(id)
  }
}

/** Public landing info for /a/<code>. No guard — the code is the secret. */
@Controller('invites')
export class InvitesPublicController {
  constructor(private readonly service: AssessmentsService) {}

  @Get(':code')
  info(@Param('code') code: string) {
    return this.service.inviteInfo(code)
  }
}

@Controller('invites')
@UseGuards(AuthenticatedGuard)
export class InvitesMeController {
  constructor(private readonly service: AssessmentsService) {}

  @Post(':code/accept')
  accept(@Req() req: AuthedRequest, @Param('code') code: string) {
    return this.service.acceptInvite(req.userId, code)
  }
}

@Controller('me')
@UseGuards(AuthenticatedGuard)
export class AssessmentsMeController {
  constructor(private readonly service: AssessmentsService) {}

  @Get('assessments')
  list(@Req() req: AuthedRequest) {
    return this.service.listForUser(req.userId)
  }

  @Post('deliveries/:id/attempts')
  start(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.service.startAttempt(req.userId, id)
  }

  @Get('attempts/:id')
  attempt(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.service.getAttempt(req.userId, id)
  }

  @Put('attempts/:id/answers')
  save(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: { answers: Record<string, string> }) {
    return this.service.saveAnswers(req.userId, id, body.answers ?? {})
  }

  @Post('attempts/:id/submit')
  submit(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: { answers?: Record<string, string> }) {
    return this.service.submit(req.userId, id, body?.answers)
  }

  @Get('attempts/:id/result')
  result(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.service.getResult(req.userId, id)
  }
}
