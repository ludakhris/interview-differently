import { Controller, Get, Post, Put, Delete, Patch, Param, Body, HttpCode, Headers } from '@nestjs/common'
import { ScenariosService } from './scenarios.service'
import { ClerkService } from '../auth/clerk.service'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Scenario = any

@Controller('scenarios')
export class ScenariosController {
  constructor(
    private readonly scenariosService: ScenariosService,
    private readonly clerk: ClerkService,
  ) {}

  /**
   * Always returns the stripped summary form. Auth doesn't change the
   * shape here — the dashboard only needs title + track + estimated
   * duration. Full scenario payloads come from GET /:id which requires
   * a Bearer token.
   */
  @Get()
  findAll() {
    return this.scenariosService.findAll()
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
    const authed = await isAuthed(this.clerk, auth)
    if (authed) return this.scenariosService.findOne(id, { authed: true })
    return this.scenariosService.findSummary(id)
  }

  @Post()
  create(@Body() scenario: Scenario) {
    return this.scenariosService.create(scenario)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() scenario: Scenario) {
    return this.scenariosService.update(id, scenario)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.scenariosService.remove(id)
  }

  @Patch(':id/publish')
  publish(@Param('id') id: string) {
    return this.scenariosService.publish(id)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true when the request carries a valid Clerk Bearer token. The
 * caller decides what to do with the result — full payload vs summary —
 * so we don't throw here on a missing/invalid token.
 */
async function isAuthed(clerk: ClerkService, authHeader?: string): Promise<boolean> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) return false
  const userId = await clerk.verifyBearerToken(token)
  return userId !== null
}
