import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common'
import { AdminGuard, InstitutionAdminAllowed } from '../auth/admin.guard'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import { InstitutionScope, type AdminRequest } from '../auth/scope'
import { DatasetsService, type DatasetInput } from './datasets.service'

interface AuthedRequest {
  userId: string
}

/**
 * Institution-admins see platform datasets (read-only) plus their own
 * institutions' (full CRUD); full admins see and edit everything.
 */
@Controller('admin/datasets')
@UseGuards(AdminGuard)
export class DatasetsAdminController {
  constructor(
    private readonly service: DatasetsService,
    private readonly scope: InstitutionScope,
  ) {}

  @Get()
  @InstitutionAdminAllowed()
  list(@Req() req: AdminRequest) {
    return this.service.list(this.scope.contentWhere(req))
  }

  // Declared before `:id` so the literal path wins.
  @Get('cohort-options')
  @InstitutionAdminAllowed()
  cohortOptions(@Req() req: AdminRequest) {
    return this.service.cohortOptions(this.scope.visible(req))
  }

  @Post('validate')
  @InstitutionAdminAllowed()
  // eslint-disable-next-line local/institution-scope -- runs the script in a throwaway PGlite; reads no institution data
  validate(@Body() body: { setupSql: string }) {
    return this.service.validate(body.setupSql)
  }

  @Get(':id')
  @InstitutionAdminAllowed()
  async get(@Req() req: AdminRequest, @Param('id') id: string) {
    const d = await this.service.get(id)
    this.scope.assertReadable(req, d.institutionId)
    return d
  }

  @Post()
  @InstitutionAdminAllowed()
  create(@Req() req: AdminRequest, @Body() body: DatasetInput) {
    return this.service.create(body, this.scope.ownerFor(req, body.institutionId))
  }

  @Put(':id')
  @InstitutionAdminAllowed()
  async update(@Req() req: AdminRequest, @Param('id') id: string, @Body() body: DatasetInput) {
    this.scope.assertOwns(req, (await this.service.get(id)).institutionId)
    return this.service.update(id, body)
  }

  @Delete(':id')
  @HttpCode(204)
  @InstitutionAdminAllowed()
  async remove(@Req() req: AdminRequest, @Param('id') id: string): Promise<void> {
    this.scope.assertOwns(req, (await this.service.get(id)).institutionId)
    await this.service.remove(id)
  }

  /** Assigning is allowed on any readable dataset — platform ones included. */
  @Put(':id/cohorts')
  @HttpCode(204)
  @InstitutionAdminAllowed()
  async setCohorts(@Req() req: AdminRequest, @Param('id') id: string, @Body() body: { cohortIds: string[] }): Promise<void> {
    this.scope.assertReadable(req, (await this.service.get(id)).institutionId)
    await this.service.setCohorts(id, body.cohortIds ?? [], this.scope.visible(req))
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
