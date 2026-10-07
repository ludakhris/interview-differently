import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ResultsService } from './results.service'
import type { CreateResultDto } from './results.types'
import { ClerkService } from '../auth/clerk.service'
import { assertOwnerOrAdmin, type AuthedRequest } from '../auth/owner'
import { LTI_STORE, type LtiStore } from '../lti/lti-store'
import { AuthenticatedOrLtiGuard, type LtiRequest } from '../lti/tool/lti-session.guard'

type Req = AuthedRequest & Pick<LtiRequest, 'lti'>

const LTI_WRITES_PER_MINUTE = 20

/**
 * Simulation results. Every route needs a signed-in user; writes are
 * stamped with the caller's userId (the body's is ignored) and reads are
 * own-or-admin (#27). An LTI session (#63) is limited by the guard to its own scenario and, here,
 * to its own results.
 */
@Controller('results')
@UseGuards(AuthenticatedOrLtiGuard)
export class ResultsController {
  constructor(
    private readonly resultsService: ResultsService,
    private readonly clerk: ClerkService,
    @Inject(LTI_STORE) private readonly store: LtiStore
  ) {}

  /** An LTI session may post at most 20 a minute per route; 429 over that. */
  private async limit(req: Req, scope: string) {
    if (!req.lti) return
    if ((await this.store.count(`rl:${scope}`, req.userId, 60)) > LTI_WRITES_PER_MINUTE)
      throw new HttpException('Too many requests. Wait a minute and try again.', 429)
  }

  @Post()
  @HttpCode(201)
  async create(@Req() req: Req, @Body() dto: CreateResultDto) {
    return this.resultsService.create({ ...dto, userId: req.userId })
  }

  /**
   * Records the start of a traditional simulation play. Analytics counts
   * these as the denominator for completion rate.
   */
  @Post('attempts')
  @HttpCode(201)
  async createAttempt(@Req() req: Req, @Body() body: { scenarioId: string; track: string }) {
    await this.limit(req, 'results-attempt')
    return this.resultsService.createAttempt({
      userId: req.userId,
      scenarioId: body.scenarioId,
      track: body.track,
    })
  }

  @Get('profile/:userId')
  async getProfile(@Req() req: AuthedRequest, @Param('userId') userId: string) {
    await assertOwnerOrAdmin(this.clerk, req, userId)
    return this.resultsService.getProfile(userId)
  }

  @Get(':id')
  async getById(@Req() req: Req, @Param('id') id: string) {
    try {
      const result = await this.resultsService.getById(id)
      if (req.lti) {
        if (result.userId !== req.userId || result.scenarioId !== req.lti.ref)
          throw new ForbiddenException('Not authorised to access this record')
      } else await assertOwnerOrAdmin(this.clerk, req, result.userId)
      return result
    } catch (err) {
      if (err instanceof HttpException) throw err
      throw new HttpException('Failed to fetch result', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  @Get(':id/ai-feedback')
  async getAiFeedback(@Req() req: AuthedRequest, @Param('id') id: string) {
    const result = await this.resultsService.getById(id)
    await assertOwnerOrAdmin(this.clerk, req, result.userId)
    try {
      return await this.resultsService.getOrGenerateAiFeedback(id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('not found')) {
        throw new HttpException(message, HttpStatus.NOT_FOUND)
      }
      throw new HttpException('AI feedback unavailable', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }
}
