import { Controller, Get, Post, Put, Delete, Patch, Param, Body, HttpCode, Headers, Req, UseGuards } from '@nestjs/common'
import { ScenariosService, type Viewer } from './scenarios.service'
import { ClerkService } from '../auth/clerk.service'
import { AdminGuard, InstitutionAdminAllowed } from '../auth/admin.guard'
import { InstitutionScope, type AdminRequest } from '../auth/scope'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Scenario = any

/**
 * Reads use optional auth (anonymous gets public summaries). Mutations
 * require an admin: full admins own everything, institution-admins only
 * their institutions' scenarios (#15, closes #26).
 */
@Controller('scenarios')
export class ScenariosController {
  constructor(
    private readonly scenariosService: ScenariosService,
    private readonly clerk: ClerkService,
    private readonly scope: InstitutionScope,
  ) {}

  /**
   * Always returns the stripped summary form. Auth widens *which*
   * scenarios appear (institution-private ones for members), not the
   * shape. Full scenario payloads come from GET /:id.
   */
  @Get()
  async findAll(@Headers('authorization') auth?: string) {
    return this.scenariosService.findAll(await viewerFrom(this.clerk, auth))
  }

  /**
   * Optional auth — with a valid Clerk Bearer token we return the full
   * scenario (nodes, exhibits, quant model answers, phases, rubric).
   * Without one we return only the summary so the briefing page can
   * still render situation + role for marketing visitors. The
   * simulation UI is also hard-gated client-side, but emitting the
   * summary keeps the public surface usable while protecting the case
   * body from a curl-and-scrape attack.
   */
  @Get(':id')
  async findOne(@Param('id') id: string, @Headers('authorization') auth?: string) {
    const viewer = await viewerFrom(this.clerk, auth)
    if (viewer) return this.scenariosService.findOne(id, viewer)
    return this.scenariosService.findSummary(id)
  }

  @Post()
  @UseGuards(AdminGuard)
  @InstitutionAdminAllowed()
  create(@Req() req: AdminRequest, @Body() scenario: Scenario) {
    return this.scenariosService.create(scenario, this.scope.ownerFor(req, scenario.institutionId))
  }

  @Put(':id')
  @UseGuards(AdminGuard)
  @InstitutionAdminAllowed()
  async update(@Req() req: AdminRequest, @Param('id') id: string, @Body() scenario: Scenario) {
    this.scope.assertOwns(req, await this.scenariosService.ownerOf(id))
    return this.scenariosService.update(id, scenario)
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @InstitutionAdminAllowed()
  async remove(@Req() req: AdminRequest, @Param('id') id: string) {
    this.scope.assertOwns(req, await this.scenariosService.ownerOf(id))
    return this.scenariosService.remove(id)
  }

  @Patch(':id/publish')
  @UseGuards(AdminGuard)
  @InstitutionAdminAllowed()
  async publish(@Req() req: AdminRequest, @Param('id') id: string) {
    this.scope.assertOwns(req, await this.scenariosService.ownerOf(id))
    return this.scenariosService.publish(id)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolves the caller from an optional Bearer header. Returns null for
 * missing/invalid tokens — the caller decides what anonymous gets.
 */
async function viewerFrom(clerk: ClerkService, authHeader?: string): Promise<Viewer | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) return null
  const userId = await clerk.verifyBearerToken(token)
  if (!userId) return null
  return { userId, role: await clerk.getRole(userId) }
}
