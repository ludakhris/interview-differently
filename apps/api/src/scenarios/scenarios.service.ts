import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TRACK_META } from './track-meta'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Scenario = any

@Injectable()
export class ScenariosService {
  constructor(private prisma: PrismaService) {}

  /**
   * Public listing endpoint. Always returns the stripped summary form —
   * even signed-in users only need title + track + estimated duration to
   * render the dashboard cards. The full scenario body (nodes, exhibits,
   * quant model answers, phases, rubric) is only emitted by `findOne`
   * for authenticated callers.
   *
   * Track-meta is marketing copy and stays public regardless.
   */
  async findAll() {
    const rows = await this.prisma.scenario.findMany({
      orderBy: { createdAt: 'asc' },
    })
    const scenarios = rows.map((r) => toSummary(r.data as unknown as Scenario))
    return { scenarios, trackMeta: TRACK_META }
  }

  /**
   * Single scenario lookup.
   *
   * Authenticated callers receive the full payload (everything we store
   * in the JSON blob). Unauthenticated callers get a 401 — the briefing
   * page can render from the summary it already has on the dashboard, and
   * the simulation UI is gated client-side, so anonymous reads have no
   * legitimate use case.
   *
   * Keeping the auth check in the service means whether the controller,
   * a future GraphQL resolver, or a CLI tool calls in, the same rule
   * applies.
   */
  async findOne(id: string, options: { authed: boolean } = { authed: false }): Promise<Scenario> {
    if (!options.authed) {
      throw new UnauthorizedException('Authentication required to fetch full scenario data')
    }
    const row = await this.prisma.scenario.findUnique({ where: { scenarioId: id } })
    if (!row) throw new NotFoundException(`Scenario ${id} not found`)
    return row.data as unknown as Scenario
  }

  /**
   * Public summary lookup — returns the stripped form (title, track,
   * briefing, etc.) for a single scenario. Used by the briefing page so
   * marketing visitors can read the role + situation before signing up.
   */
  async findSummary(id: string): Promise<Scenario> {
    const row = await this.prisma.scenario.findUnique({ where: { scenarioId: id } })
    if (!row) throw new NotFoundException(`Scenario ${id} not found`)
    return toSummary(row.data as unknown as Scenario)
  }

  async create(scenario: Scenario): Promise<Scenario> {
    const row = await this.prisma.scenario.create({
      data: {
        scenarioId: scenario.scenarioId,
        status: scenario.builderMeta?.status ?? 'draft',
        data: scenario as object,
      },
    })
    return row.data as unknown as Scenario
  }

  async update(id: string, scenario: Scenario): Promise<Scenario> {
    await this.findOne(id) // throws if not found
    const updated = {
      ...scenario,
      builderMeta: {
        ...scenario.builderMeta,
        lastEditedAt: new Date().toISOString(),
      },
    }
    const row = await this.prisma.scenario.update({
      where: { scenarioId: id },
      data: {
        status: updated.builderMeta?.status ?? 'draft',
        data: updated as object,
      },
    })
    return row.data as unknown as Scenario
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id) // throws if not found
    await this.prisma.scenario.delete({ where: { scenarioId: id } })
  }

  async publish(id: string): Promise<Scenario> {
    const scenario = await this.findOne(id)
    const published = {
      ...scenario,
      builderMeta: {
        ...scenario.builderMeta,
        status: 'published' as const,
        lastEditedAt: new Date().toISOString(),
      },
    }
    const row = await this.prisma.scenario.update({
      where: { scenarioId: id },
      data: { status: 'published', data: published as object },
    })
    return row.data as unknown as Scenario
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip a stored scenario down to its public-safe surface. Includes only
 * the fields the dashboard cards and briefing page actually render:
 *   - identifiers + display metadata (id, title, track, subcategory)
 *   - estimated duration, mode flag
 *   - briefing (situation/role) — the no-spoiler preview
 *   - top-level `display` (sidebar role labels, accent colours)
 *
 * Excludes everything that is the case product itself: nodes, exhibits,
 * phases, rubric, interviewer config, builderMeta, etc.
 */
function toSummary(full: Scenario): Scenario {
  if (!full || typeof full !== 'object') return full
  return {
    scenarioId: full.scenarioId,
    title: full.title,
    track: full.track,
    ...(full.subcategory ? { subcategory: full.subcategory } : {}),
    ...(full.icon ? { icon: full.icon } : {}),
    estimatedMinutes: full.estimatedMinutes,
    ...(full.mode ? { mode: full.mode } : {}),
    ...(full.briefing ? { briefing: full.briefing } : {}),
    ...(full.display ? { display: full.display } : {}),
    // Rubric is dimension names + descriptions — marketing-safe (the
    // briefing page renders "What you'll be evaluated on"). It does NOT
    // contain user scores or model-answer derivations.
    ...(full.rubric ? { rubric: full.rubric } : {}),
  }
}
