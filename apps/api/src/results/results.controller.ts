import { Controller, Post, Get, Body, Param, HttpCode, HttpException, HttpStatus } from '@nestjs/common'
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

  @Get('profile/:userId')
  getProfile(@Param('userId') userId: string) {
    return this.resultsService.getProfile(userId)
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
