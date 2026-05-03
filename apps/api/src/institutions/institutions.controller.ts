import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common'
import { AdminGuard } from '../auth/admin.guard'
import { InstitutionsService, type InstitutionInput } from './institutions.service'

@Controller('admin/institutions')
@UseGuards(AdminGuard)
export class InstitutionsController {
  constructor(private readonly service: InstitutionsService) {}

  @Get()
  list() {
    return this.service.list()
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id)
  }

  @Post()
  create(@Body() body: InstitutionInput) {
    return this.service.create(body)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<InstitutionInput>) {
    return this.service.update(id, body)
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.service.remove(id)
  }
}
