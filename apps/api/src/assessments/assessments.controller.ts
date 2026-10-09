import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AdminGuard, InstitutionAdminAllowed } from '../auth/admin.guard'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import { AuthenticatedOrLtiGuard, type LtiRequest } from '../lti/tool/lti-session.guard'
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
    private readonly scope: InstitutionScope
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
  import(
    @Req() req: AdminRequest,
    @Body() body: { markdown: string; institutionId?: string | null }
  ) {
    const owner = this.scope.ownerFor(req, body.institutionId)
    return this.service.import(
      body.markdown,
      this.scope.contentWhere(req),
      owner,
      (existingOwner) => {
        if (this.scope.isFullAdmin(req)) return true
        return existingOwner !== null && (req.institutionIds ?? []).includes(existingOwner)
      }
    )
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
  async createDelivery(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Body() body: DeliveryInput
  ) {
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

  @Get('deliveries/:id/attempts/:attemptId/review')
  @InstitutionAdminAllowed()
  async attemptReview(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Param('attemptId') attemptId: string
  ) {
    await this.scope.assertDelivery(req, id)
    return this.service.attemptReview(id, attemptId)
  }

  @Get('institutions/:institutionId/assessments')
  @InstitutionAdminAllowed()
  prePost(
    @Req() req: AdminRequest,
    @Param('institutionId') institutionId: string,
    @Query('cohortId') cohortId?: string
  ) {
    this.scope.assertInstitution(req, institutionId)
    return this.service.institutionPrePost(institutionId, cohortId || undefined)
  }

  @Get('institutions/:institutionId/assessment-activity')
  @InstitutionAdminAllowed()
  activity(
    @Req() req: AdminRequest,
    @Param('institutionId') institutionId: string,
    @Query('cohortId') cohortId?: string
  ) {
    this.scope.assertInstitution(req, institutionId)
    if (!cohortId) throw new BadRequestException('cohortId is required')
    return this.service.cohortActivity(institutionId, cohortId)
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

type MeRequest = AuthedRequest & Pick<LtiRequest, 'lti'>

const MAX_ANSWER_KEYS = 200
const MAX_ANSWER_KEY_CHARS = 64
const MAX_ANSWER_CHARS = 20_000

/** Answers from an LTI session: a plain object of short ids to strings of bounded size. */
function ltiAnswers(input: unknown): Record<string, string> {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new BadRequestException('answers must be an object')
  const entries = Object.entries(input)
  if (entries.length > MAX_ANSWER_KEYS) throw new BadRequestException('Too many answers')
  for (const [k, v] of entries) {
    if (k.length > MAX_ANSWER_KEY_CHARS || typeof v !== 'string' || v.length > MAX_ANSWER_CHARS)
      throw new BadRequestException('Invalid answer')
  }
  return Object.fromEntries(entries) as Record<string, string>
}

/**
 * A signed-in Clerk user, or an LTI session (#63) which the guard limits to the five attempt
 * routes of its one launched delivery; `deliveryId` below then pins the attempt to that delivery.
 */
@Controller('me')
@UseGuards(AuthenticatedOrLtiGuard)
export class AssessmentsMeController {
  constructor(private readonly service: AssessmentsService) {}

  @Get('assessments')
  list(@Req() req: MeRequest) {
    return this.service.listForUser(req.userId)
  }

  @Post('deliveries/:id/attempts')
  start(@Req() req: MeRequest, @Param('id') id: string) {
    if (!req.lti) return this.service.startAttempt(req.userId, id)
    if (!req.lti.deliveryId || req.lti.deliveryId !== id) throw new ForbiddenException()
    // a review session finds the submitted attempt; it can never start one
    if (req.lti.review) return this.service.findSubmittedAttemptForLti(req.userId, id)
    return this.service.startAttemptForLti(req.userId, id)
  }

  @Get('attempts/:id')
  attempt(@Req() req: MeRequest, @Param('id') id: string) {
    return this.service.getAttempt(req.userId, id, this.pinned(req))
  }

  @Put('attempts/:id/answers')
  save(
    @Req() req: MeRequest,
    @Param('id') id: string,
    @Body() body: { answers: Record<string, string> }
  ) {
    const answers = req.lti ? ltiAnswers(body?.answers ?? {}) : (body.answers ?? {})
    return this.service.saveAnswers(req.userId, id, answers, this.pinned(req))
  }

  @Post('attempts/:id/submit')
  submit(
    @Req() req: MeRequest,
    @Param('id') id: string,
    @Body() body: { answers?: Record<string, string> }
  ) {
    const answers =
      req.lti && body?.answers !== undefined ? ltiAnswers(body.answers) : body?.answers
    return this.service.submit(req.userId, id, answers, this.pinned(req))
  }

  @Get('attempts/:id/result')
  result(@Req() req: MeRequest, @Param('id') id: string) {
    return this.service.getResult(req.userId, id, this.pinned(req), req.lti?.review === true)
  }

  /** The session's delivery for an LTI caller (never undefined, which would mean unpinned); undefined for Clerk. */
  private pinned(req: MeRequest): string | undefined {
    if (!req.lti) return undefined
    if (!req.lti.deliveryId) throw new ForbiddenException()
    return req.lti.deliveryId
  }
}
