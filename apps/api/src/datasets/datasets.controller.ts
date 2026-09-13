import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common'
import { AdminGuard } from '../auth/admin.guard'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import { DatasetsService, type DatasetInput } from './datasets.service'

interface AuthedRequest {
  userId: string
}

@Controller('admin/datasets')
@UseGuards(AdminGuard)
export class DatasetsAdminController {
  constructor(private readonly service: DatasetsService) {}

  @Get()
  list() {
    return this.service.list()
  }

  // Declared before `:id` so the literal path wins.
  @Get('cohort-options')
  cohortOptions() {
    return this.service.cohortOptions()
  }

  @Post('validate')
  validate(@Body() body: { setupSql: string }) {
    return this.service.validate(body.setupSql)
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id)
  }

  @Post()
  create(@Body() body: DatasetInput) {
    return this.service.create(body)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: DatasetInput) {
    return this.service.update(id, body)
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.service.remove(id)
  }

  @Put(':id/cohorts')
  @HttpCode(204)
  async setCohorts(@Param('id') id: string, @Body() body: { cohortIds: string[] }): Promise<void> {
    await this.service.setCohorts(id, body.cohortIds ?? [])
  }
}

@Controller('me/datasets')
@UseGuards(AuthenticatedGuard)
export class DatasetsMeController {
  constructor(private readonly service: DatasetsService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.service.listForUser(req.userId)
  }

  @Get(':slug')
  get(@Req() req: AuthedRequest, @Param('slug') slug: string) {
    return this.service.getForUser(req.userId, slug)
  }
}
