import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TRACK_META } from './track-meta'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Scenario = any

/**
 * Who is asking. `null` = anonymous. Institution-private scenarios (#15)
 * are visible to full admins and to members of that institution; public
 * scenarios (institutionId null) to everyone.
 */
export interface Viewer {
  userId: string
  role: string | null
}

@Injectable()
export class ScenariosService {
  constructor(private prisma: PrismaService) {}

  /**
   * Listing endpoint. Always returns the stripped summary form —
   * even signed-in users only need title + track + estimated duration to
   * render the dashboard cards. The full scenario body (nodes, exhibits,
   * quant model answers, phases, rubric) is only emitted by `findOne`
   * for authenticated callers.
   *
   * Anonymous callers see public scenarios; signed-in users also see their
   * institutions' private ones; full admins see everything.
   *
   * Track-meta is marketing copy and stays public regardless.
   */
  async findAll(viewer: Viewer | null) {
    const rows = await this.prisma.scenario.findMany({
      where: this.visibleWhere(viewer),
      orderBy: { createdAt: 'asc' },
      include: { institution: { select: { name: true } } },
    })
    const scenarios = rows.map((r) => toSummary(this.withOwner(r)))
    return { scenarios, trackMeta: TRACK_META }
  }

  /**
   * Single scenario lookup.
   *
   * Authenticated callers receive the full payload (everything we store
   * in the JSON blob). Unauthenticated callers get a 401 — the briefing
   * page can render from the summary it already has on the dashboard, and
   * the simulation UI is gated client-side, so anonymous reads have no
   * legitimate use case. Private scenarios 404 for non-members.
   */
  async findOne(id: string, viewer: Viewer | null): Promise<Scenario> {
    if (!viewer) {
      throw new UnauthorizedException('Authentication required to fetch full scenario data')
    }
    const row = await this.prisma.scenario.findFirst({
      where: { scenarioId: id, ...this.visibleWhere(viewer) },
      include: { institution: { select: { name: true } } },
    })
    if (!row) throw new NotFoundException(`Scenario ${id} not found`)
    return this.withOwner(row)
  }

  /**
   * Public summary lookup — returns the stripped form (title, track,
   * briefing, etc.) for a single scenario. Used by the briefing page so
   * marketing visitors can read the role + situation before signing up.
   */
  async findSummary(id: string): Promise<Scenario> {
    const row = await this.prisma.scenario.findFirst({
      where: { scenarioId: id, institutionId: null },
      include: { institution: { select: { name: true } } },
    })
    if (!row) throw new NotFoundException(`Scenario ${id} not found`)
    return toSummary(this.withOwner(row))
  }

  /** Owner of a scenario, for mutation checks. null = public. */
  async ownerOf(id: string): Promise<string | null> {
    const row = await this.prisma.scenario.findUnique({ where: { scenarioId: id }, select: { institutionId: true } })
    if (!row) throw new NotFoundException(`Scenario ${id} not found`)
    return row.institutionId
  }

  async create(scenario: Scenario, institutionId: string | null): Promise<Scenario> {
    const row = await this.prisma.scenario.create({
      data: {
        scenarioId: scenario.scenarioId,
        status: scenario.builderMeta?.status ?? 'draft',
        data: stripOwner(scenario) as object,
        institutionId,
      },
      include: { institution: { select: { name: true } } },
    })
    return this.withOwner(row)
  }

  async update(id: string, scenario: Scenario): Promise<Scenario> {
    const updated = {
      ...stripOwner(scenario),
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
      include: { institution: { select: { name: true } } },
    })
    return this.withOwner(row)
  }

  async remove(id: string): Promise<void> {
    await this.prisma.scenario.delete({ where: { scenarioId: id } })
  }

  async publish(id: string): Promise<Scenario> {
    const row = await this.prisma.scenario.findUnique({ where: { scenarioId: id } })
    if (!row) throw new NotFoundException(`Scenario ${id} not found`)
    const scenario = row.data as unknown as Scenario
    const published = {
      ...scenario,
      builderMeta: {
        ...scenario.builderMeta,
        status: 'published' as const,
        lastEditedAt: new Date().toISOString(),
      },
    }
    const updated = await this.prisma.scenario.update({
      where: { scenarioId: id },
      data: { status: 'published', data: published as object },
      include: { institution: { select: { name: true } } },
    })
    return this.withOwner(updated)
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private visibleWhere(viewer: Viewer | null) {
    if (!viewer) return { institutionId: null }
    if (viewer.role === 'admin') return {}
    return { OR: [{ institutionId: null }, { institution: { memberships: { some: { userId: viewer.userId } } } }] }
  }

  /** Column-backed ownership merged onto the JSON blob for clients. */
  private withOwner(row: { data: unknown; institutionId: string | null; institution: { name: string } | null }): Scenario {
    return {
      ...(row.data as object),
      institutionId: row.institutionId,
      institutionName: row.institution?.name ?? null,
    }
  }
}

/** The column is authoritative — never let a client PUT change ownership via the blob. */
function stripOwner(scenario: Scenario): Scenario {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { institutionId: _i, institutionName: _n, ...rest } = scenario
  return rest
}

/**
 * Strip a stored scenario down to its public-safe surface. Includes only
 * the fields the dashboard cards and briefing page actually render:
 *   - identifiers + display metadata (id, title, track, subcategory)
 *   - estimated duration, mode flag
 *   - briefing (situation/role) — the no-spoiler preview
 *   - top-level `display` (sidebar role labels, accent colours)
 *   - ownership (institutionId / institutionName) for grouping
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
    institutionId: full.institutionId ?? null,
    institutionName: full.institutionName ?? null,
    // Rubric is dimension names + descriptions — marketing-safe (the
    // briefing page renders "What you'll be evaluated on"). It does NOT
    // contain user scores or model-answer derivations.
    ...(full.rubric ? { rubric: full.rubric } : {}),
    // Publish state + last-edit stamp for the builder list. Canvas
    // positions stay private — they're builder-only geometry.
    ...(full.builderMeta
      ? { builderMeta: { status: full.builderMeta.status, lastEditedAt: full.builderMeta.lastEditedAt, positions: {} } }
      : {}),
  }
}
