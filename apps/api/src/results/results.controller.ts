import { Controller, Post, Get, Body, Param, HttpCode, HttpException, HttpStatus, Req, UseGuards } from '@nestjs/common'
import { ResultsService } from './results.service'
import type { CreateResultDto } from './results.types'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import { ClerkService } from '../auth/clerk.service'
import { assertOwnerOrAdmin, type AuthedRequest } from '../auth/owner'

/**
 * Simulation results. Every route needs a signed-in user; writes are
 * stamped with the caller's userId (the body's is ignored) and reads are
 * own-or-admin (#27).
 */
@Controller('results')
@UseGuards(AuthenticatedGuard)
export class ResultsController {
  constructor(
    private readonly resultsService: ResultsService,
    private readonly clerk: ClerkService,
  ) {}

  @Post()
  @HttpCode(201)
  create(@Req() req: AuthedRequest, @Body() dto: CreateResultDto) {
    return this.resultsService.create({ ...dto, userId: req.userId })
  }

  /**
   * Records the start of a traditional simulation play. Analytics counts
   * these as the denominator for completion rate.
   */
  @Post('attempts')
  @HttpCode(201)
  createAttempt(@Req() req: AuthedRequest, @Body() body: { scenarioId: string; track: string }) {
    return this.resultsService.createAttempt({ userId: req.userId, scenarioId: body.scenarioId, track: body.track })
  }

  @Get('profile/:userId')
  async getProfile(@Req() req: AuthedRequest, @Param('userId') userId: string) {
    await assertOwnerOrAdmin(this.clerk, req, userId)
    return this.resultsService.getProfile(userId)
  }

  @Get(':id')
  async getById(@Req() req: AuthedRequest, @Param('id') id: string) {
    try {
      const result = await this.resultsService.getById(id)
      await assertOwnerOrAdmin(this.clerk, req, result.userId)
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
