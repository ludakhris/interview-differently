import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common'
import { AdminGuard, InstitutionAdminAllowed } from '../auth/admin.guard'
import { InstitutionScope, type AdminRequest } from '../auth/scope'
import { InstitutionsService, type InstitutionInput } from './institutions.service'

/** Reads are open to institution-admins (own institutions only); mutations are full-admin. */
@Controller('admin/institutions')
@UseGuards(AdminGuard)
export class InstitutionsController {
  constructor(
    private readonly service: InstitutionsService,
    private readonly scope: InstitutionScope,
  ) {}

  @Get()
  @InstitutionAdminAllowed()
  list(@Req() req: AdminRequest) {
    return this.service.list(this.scope.visible(req))
  }

  @Get(':id')
  @InstitutionAdminAllowed()
  get(@Req() req: AdminRequest, @Param('id') id: string) {
    this.scope.assertInstitution(req, id)
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
