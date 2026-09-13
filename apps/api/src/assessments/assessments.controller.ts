import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { AdminGuard } from '../auth/admin.guard'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import { AssessmentsService, type DeliveryInput } from './assessments.service'

interface AuthedRequest {
  userId: string
}

@Controller('admin')
@UseGuards(AdminGuard)
export class AssessmentsAdminController {
  constructor(private readonly service: AssessmentsService) {}

  @Get('assessments')
  list() {
    return this.service.list()
  }

  @Post('assessments/preview')
  preview(@Body() body: { markdown: string }) {
    return this.service.preview(body.markdown)
  }

  @Post('assessments/import')
  import(@Body() body: { markdown: string }) {
    return this.service.import(body.markdown)
  }

  @Get('assessments/:id')
  get(@Param('id') id: string) {
    return this.service.get(id)
  }

  @Delete('assessments/:id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.service.remove(id)
  }

  @Post('assessments/:id/deliveries')
  createDelivery(@Param('id') id: string, @Body() body: DeliveryInput) {
    return this.service.createDelivery(id, body)
  }

  @Delete('deliveries/:id')
  @HttpCode(204)
  async removeDelivery(@Param('id') id: string): Promise<void> {
    await this.service.removeDelivery(id)
  }

  @Get('deliveries/:id/results')
  results(@Param('id') id: string) {
    return this.service.deliveryResults(id)
  }

  @Get('institutions/:institutionId/assessments')
  prePost(@Param('institutionId') institutionId: string, @Query('cohortId') cohortId?: string) {
    return this.service.institutionPrePost(institutionId, cohortId || undefined)
  }

  @Post('deliveries/:id/invite')
  createInvite(@Param('id') id: string) {
    return this.service.createInvite(id)
  }

  @Delete('deliveries/:id/invite')
  @HttpCode(204)
  async revokeInvite(@Param('id') id: string): Promise<void> {
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
