import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ClerkService } from '../auth/clerk.service'
import { TOOL_KEYS, isToolKey, type ToolKey } from './tool-keys'

@Injectable()
export class ToolsService {
  constructor(
    private prisma: PrismaService,
    private clerk: ClerkService
  ) {}

  /** Every known tool with its enabled state for one cohort (missing row = disabled). */
  async listForCohort(cohortId: string): Promise<{ toolKey: ToolKey; enabled: boolean }[]> {
    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      include: { tools: true },
    })
    if (!cohort) throw new NotFoundException(`Cohort ${cohortId} not found`)
    return TOOL_KEYS.map((toolKey) => ({
      toolKey,
      enabled: cohort.tools.find((t) => t.toolKey === toolKey)?.enabled ?? false,
    }))
  }

  async setForCohort(cohortId: string, toolKey: string, enabled: boolean): Promise<void> {
    if (!isToolKey(toolKey)) throw new BadRequestException(`Unknown tool "${toolKey}"`)
    if (typeof enabled !== 'boolean') throw new BadRequestException('enabled must be a boolean')
    const cohort = await this.prisma.cohort.findUnique({ where: { id: cohortId } })
    if (!cohort) throw new NotFoundException(`Cohort ${cohortId} not found`)
    await this.prisma.cohortToolConfig.upsert({
      where: { cohortId_toolKey: { cohortId, toolKey } },
      update: { enabled },
      create: { cohortId, toolKey, enabled },
    })
  }

  /** Tools the user can open: all of them for admins, else the union across their cohorts. */
  async listForUser(userId: string): Promise<ToolKey[]> {
    if (await this.clerk.isAdmin(userId)) return [...TOOL_KEYS]
    const rows = await this.prisma.cohortToolConfig.findMany({
      where: { enabled: true, cohort: { memberships: { some: { userId } } } },
      select: { toolKey: true },
      distinct: ['toolKey'],
    })
    return rows.map((r) => r.toolKey).filter(isToolKey)
  }

  // ── SQL sandbox query log ────────────────────────────────────────────────

  /** Record one sandbox query. Cohort is resolved server-side, never trusted from the client. */
  async logSandboxQuery(userId: string, input: SandboxQueryInput): Promise<void> {
    if (
      !input ||
      typeof input.datasetSlug !== 'string' ||
      typeof input.queryText !== 'string' ||
      typeof input.ok !== 'boolean'
    ) {
      throw new BadRequestException('datasetSlug, queryText and ok are required')
    }
    const memberships = await this.prisma.membership.findMany({
      where: { userId, cohortId: { not: null } },
      select: {
        cohortId: true,
        cohort: {
          select: {
            datasets: {
              where: { dataset: { slug: input.datasetSlug } },
              select: { datasetId: true },
            },
          },
        },
      },
    })
    // Prefer the cohort that actually has this dataset assigned; else any cohort.
    const match = memberships.find((m) => (m.cohort?.datasets.length ?? 0) > 0) ?? memberships[0]
    await this.prisma.sqlQueryLog.create({
      data: {
        userId,
        cohortId: match?.cohortId ?? null,
        datasetSlug: input.datasetSlug.slice(0, 200),
        queryText: input.queryText.slice(0, MAX_QUERY_CHARS),
        ok: input.ok,
        errorMessage: input.errorMessage?.slice(0, 1000) ?? null,
        rowCount: Number.isInteger(input.rowCount) ? input.rowCount! : null,
        durationMs: Number.isInteger(input.durationMs) ? input.durationMs! : null,
      },
    })
    // Retention: opportunistic purge so no cron is needed.
    if (Math.random() < 0.02) {
      await this.prisma.sqlQueryLog.deleteMany({ where: { createdAt: { lt: retentionCutoff() } } })
    }
  }

  /** Every student in a cohort with their recent sandbox queries (newest first). */
  async sandboxActivity(cohortId: string, perStudentLimit = 100): Promise<SandboxActivity> {
    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      select: {
        id: true,
        name: true,
        memberships: { select: { user: { select: { id: true, email: true, displayName: true } } } },
      },
    })
    if (!cohort) throw new NotFoundException(`Cohort ${cohortId} not found`)

    const since = retentionCutoff()
    const logs = await this.prisma.sqlQueryLog.findMany({
      where: { cohortId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    })
    const byUser = new Map<string, typeof logs>()
    for (const l of logs) byUser.set(l.userId, [...(byUser.get(l.userId) ?? []), l])

    const seen = new Set<string>()
    const students = cohort.memberships
      .map((m) => m.user)
      .filter((u) => !seen.has(u.id) && !!seen.add(u.id))
      .map((u) => {
        const rows = byUser.get(u.id) ?? []
        return {
          userId: u.id,
          name: u.displayName ?? u.email ?? u.id,
          email: u.email,
          queryCount: rows.length,
          errorCount: rows.filter((r) => !r.ok).length,
          lastQueryAt: rows[0]?.createdAt.toISOString() ?? null,
          queries: rows.slice(0, perStudentLimit).map((r) => ({
            id: r.id,
            datasetSlug: r.datasetSlug,
            queryText: r.queryText,
            ok: r.ok,
            errorMessage: r.errorMessage,
            rowCount: r.rowCount,
            durationMs: r.durationMs,
            createdAt: r.createdAt.toISOString(),
          })),
        }
      })
      // Most recently active first; silent students at the bottom.
      .sort((a, b) => (b.lastQueryAt ?? '').localeCompare(a.lastQueryAt ?? ''))

    return {
      cohort: { id: cohort.id, name: cohort.name },
      retentionDays: RETENTION_DAYS,
      generatedAt: new Date().toISOString(),
      students,
    }
  }
}

const RETENTION_DAYS = 90
const MAX_QUERY_CHARS = 5000
const retentionCutoff = () => new Date(Date.now() - RETENTION_DAYS * 86_400_000)

export interface SandboxQueryInput {
  datasetSlug: string
  queryText: string
  ok: boolean
  errorMessage?: string
  rowCount?: number
  durationMs?: number
}

export interface SandboxActivity {
  cohort: { id: string; name: string }
  retentionDays: number
  generatedAt: string
  students: Array<{
    userId: string
    name: string
    email: string | null
    queryCount: number
    errorCount: number
    lastQueryAt: string | null
    queries: Array<{
      id: string
      datasetSlug: string
      queryText: string
      ok: boolean
      errorMessage: string | null
      rowCount: number | null
      durationMs: number | null
      createdAt: string
    }>
  }>
}
