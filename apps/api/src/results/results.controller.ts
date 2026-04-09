import { Controller, Post, Get, Body, Param, HttpCode } from '@nestjs/common'
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
}
