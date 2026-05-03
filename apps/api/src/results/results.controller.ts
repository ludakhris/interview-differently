import { Controller, Post, Get, Body, Param, HttpCode, HttpException, HttpStatus, NotFoundException } from '@nestjs/common'
import { ResultsService } from './results.service'
import type { CreateResultDto } from './results.types'

@Controller('results')
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateResultDto) {
    return this.resultsService.create(dto)
  }

  /**
   * Records the start of a traditional simulation play. Analytics counts
   * these as the denominator for completion rate. No auth — keeps parity
   * with `POST /results` which is also unauthenticated; tightening both
   * is on the auth-retrofit list.
   */
  @Post('attempts')
  @HttpCode(201)
  createAttempt(@Body() body: { userId: string; scenarioId: string; track: string }) {
    return this.resultsService.createAttempt(body)
  }

  @Get('profile/:userId')
  getProfile(@Param('userId') userId: string) {
    return this.resultsService.getProfile(userId)
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    try {
      return await this.resultsService.getById(id)
    } catch (err) {
      if (err instanceof NotFoundException) throw err
      throw new HttpException('Failed to fetch result', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  @Get(':id/ai-feedback')
  async getAiFeedback(@Param('id') id: string) {
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
