import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type {
  AgencyOutcomes,
  Gradebook,
  LearnWorkspace,
  LearnWorkspaceSummary,
} from './learn-types'
import { PrismaService } from '../prisma/prisma.service'
import { AccessService, type Actor } from './access/access.service'
import { ROLES, SYSTEM_ADMIN } from './access/permissions'
import { agencyOutcomes, gradebook, type EnrollmentRow } from './outcomes'
import { exitFileCsv } from './exit-file'

@Injectable()
export class LearnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService
  ) {}

  /**
   * Workspaces the caller may open, each with their highest role in it (AccessService.workspaceRoles): a
   * system admin opens every agency and what reports to one, an agency admin their agencies and what
   * reports to them, everyone else the institutions where they hold a role.
   */
  async workspaces(userId: string, role: string | undefined): Promise<LearnWorkspace[]> {
    const actor = { userId, role }
    const system = this.access.isSystemAdmin(actor)
    const roles = system ? [] : await this.access.workspaceRoles(actor)
    if (!system && roles.length === 0) return []
    const rows = await this.prisma.institution.findMany({
      where: system
        ? { subdomain: { not: null }, OR: [{ kind: 'agency' }, { parent: { kind: 'agency' } }] }
        : { subdomain: { not: null }, id: { in: roles.map((r) => r.institutionId) } },
      select: {
        id: true,
        name: true,
        kind: true,
        subdomain: true,
        parentId: true,
        featuredDemo: true,
      },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    })
    const roleOf = new Map(roles.map((r) => [r.institutionId, r.role]))
    return rows.map((r) => ({
      ...r,
      subdomain: r.subdomain as string,
      role: system ? SYSTEM_ADMIN : (roleOf.get(r.id) as LearnWorkspace['role']),
    }))
  }

  /** The workspaces the caller may open, each with what is in it, for the chooser. */
  async workspaceSummaries(
    userId: string,
    role: string | undefined
  ): Promise<LearnWorkspaceSummary[]> {
    const list = await this.workspaces(userId, role)
    if (list.length === 0) return []
    const parentIds = [...new Set(list.map((w) => w.parentId).filter((id): id is string => !!id))]
    const [parents, children, cohorts, courseCounts] = await Promise.all([
      this.prisma.institution.findMany({
        where: { id: { in: parentIds } },
        select: { id: true, name: true },
      }),
      this.prisma.institution.findMany({
        where: { parentId: { in: list.map((w) => w.id) } },
        select: { id: true, parentId: true, kind: true },
      }),
      this.prisma.cohort.findMany({
        select: {
          id: true,
          institutionId: true,
          institution: { select: { parentId: true } },
          course: { select: { providerId: true, provider: { select: { parentId: true } } } },
          _count: { select: { enrollments: { where: { status: { not: 'withdrawn' } } } } },
        },
      }),
      this.prisma.course.groupBy({ by: ['providerId'], _count: { _all: true } }),
    ])
    const parentName = new Map(parents.map((p) => [p.id, p.name]))
    const courses = new Map(courseCounts.map((c) => [c.providerId, c._count._all]))
    // An instructor sees only what is theirs: their cohorts and their learners, not the workspace's totals.
    const taught = new Map<string, string[] | null>()
    for (const w of list.filter((w) => w.role === ROLES.instructor))
      taught.set(w.id, await this.access.instructorCohortsIn({ userId, role }, w.id))
    return list.map((w) => {
      const own = (c: (typeof cohorts)[number]): boolean =>
        w.kind === 'agency'
          ? c.institution.parentId === w.id || c.course?.provider.parentId === w.id
          : w.kind === 'provider'
            ? c.course?.providerId === w.id
            : c.institutionId === w.id
      const narrowed = taught.get(w.id)
      const mine = cohorts.filter(own).filter((c) => !narrowed || narrowed.includes(c.id))
      const partners = narrowed ? [] : children.filter((c) => c.parentId === w.id)
      return {
        ...w,
        parentName: (w.parentId && parentName.get(w.parentId)) || null,
        courses: narrowed
          ? 0
          : w.kind === 'agency'
            ? partners.reduce((n, p) => n + (courses.get(p.id) ?? 0), 0)
            : (courses.get(w.id) ?? 0),
        cohorts: mine.length,
        learners: mine.reduce((n, c) => n + c._count.enrollments, 0),
        providers: partners.filter((p) => p.kind === 'provider').length,
        organizations: partners.filter((p) => p.kind !== 'provider').length,
      }
    })
  }

  /** Throws unless the caller may open this workspace. */
  async assertWorkspace(
    userId: string,
    role: string | undefined,
    subdomain: string
  ): Promise<void> {
    await this.access.authorize({ userId, role }, 'workspace.open', { workspace: subdomain })
  }

  /**
   * The workspace whose results to report on: an agency (everything under it),
   * a provider (its courses and the cohorts run for it) or an organization
   * (the cohorts it runs).
   */
  async reportScope(subdomain: string): Promise<{ id: string; name: string; kind: string }> {
    const ws = await this.prisma.institution.findFirst({
      where: { subdomain },
      select: { id: true, name: true, kind: true },
    })
    if (!ws) throw new NotFoundException(`No workspace "${subdomain}"`)
    return ws
  }

  /**
   * Every enrollment in a workspace's scope (see reportScope).
   * Results are rolled up from item progress in one pass.
   */
  async enrollmentRows(scope: { id: string; kind: string }): Promise<EnrollmentRow[]> {
    const inScope =
      scope.kind === 'agency'
        ? Prisma.sql`host."id" = ${scope.id} OR host."parentId" = ${scope.id} OR prov."parentId" = ${scope.id}`
        : scope.kind === 'provider'
          ? Prisma.sql`prov."id" = ${scope.id} OR host."id" = ${scope.id}`
          : Prisma.sql`host."id" = ${scope.id}`
    return this.prisma.$queryRaw<EnrollmentRow[]>(Prisma.sql`
      SELECT
        e."id"                         AS "enrollmentId",
        e."userId"                     AS "userId",
        u."displayName"                AS "name",
        e."status"                     AS "status",
        e."completedAt"                AS "completedAt",
        c."id"                         AS "cohortId",
        c."name"                       AS "cohortName",
        c."startsAt"                   AS "startsAt",
        c."endsAt"                     AS "endsAt",
        host."id"                      AS "hostId",
        host."name"                    AS "hostName",
        co."id"                        AS "courseId",
        co."title"                     AS "program",
        co."credential"                AS "credential",
        co."readinessThreshold"        AS "readinessThreshold",
        co."targetScore"               AS "targetScore",
        prov."id"                      AS "providerId",
        prov."name"                    AS "providerName",
        MAX(ip."score") FILTER (WHERE it."label" = 'pre'  AND ip."status" = 'completed')::int AS "pre",
        MAX(ip."score") FILTER (WHERE it."label" = 'post' AND ip."status" = 'completed')::int AS "post",
        MAX(ip."score") FILTER (WHERE (it."type" = 'interview' OR (it."type" = 'tool' AND it."label" IS NULL AND it."config"->>'countsAsInterview' = 'true')) AND ip."status" = 'completed')::int AS "interviewBest",
        COALESCE(MAX(ip."attempts") FILTER (WHERE (it."type" = 'interview' OR (it."type" = 'tool' AND it."label" IS NULL AND it."config"->>'countsAsInterview' = 'true'))), 0)::int AS "interviewAttempts",
        -- Completed items, plus plan slots for course content sent back for review that were redone
        -- since they were added (the item's own completion already counts once).
        ((COUNT(ip."id") FILTER (WHERE ip."status" = 'completed'))
         + (SELECT COUNT(*) FROM "PlanItem" pi
              JOIN "CourseItem" pci ON pci."id" = pi."itemId"
              JOIN "ItemProgress" pip ON pip."itemId" = pi."itemId" AND pip."enrollmentId" = pi."enrollmentId"
            WHERE pi."enrollmentId" = e."id"
              AND pci."config"->>'remediationFor' IS NULL
              AND pip."status" = 'completed'
              AND pip."completedAt" >= pi."createdAt"))::int AS "itemsDone",
        -- The outline (remediation items are not part of it) plus what this learner's plan added.
        ((SELECT COUNT(*) FROM "CourseItem" ci JOIN "CourseModule" cm ON cm."id" = ci."moduleId"
           WHERE cm."courseId" = co."id" AND ci."config"->>'remediationFor' IS NULL)
         + (SELECT COUNT(*) FROM "PlanItem" pi WHERE pi."enrollmentId" = e."id"))::int AS "itemsTotal",
        MAX(ip."completedAt")          AS "lastActivity"
      FROM "Enrollment" e
      JOIN "User" u            ON u."id" = e."userId"
      JOIN "Cohort" c          ON c."id" = e."cohortId"
      JOIN "Institution" host  ON host."id" = c."institutionId"
      JOIN "Course" co         ON co."id" = c."courseId"
      JOIN "Institution" prov  ON prov."id" = co."providerId"
      LEFT JOIN "ItemProgress" ip ON ip."enrollmentId" = e."id"
      LEFT JOIN "CourseItem" it   ON it."id" = ip."itemId"
      WHERE ${inScope}
      GROUP BY e."id", u."displayName", c."id", host."id", co."id", prov."id"
    `)
  }

  async outcomes(actor: Actor, subdomain: string): Promise<AgencyOutcomes> {
    await this.access.authorize(actor, 'outcomes.read', { workspace: subdomain })
    const scope = await this.reportScope(subdomain)
    return agencyOutcomes(
      { id: scope.id, name: scope.name },
      await this.enrollmentRows(scope),
      new Date()
    )
  }

  async gradebook(actor: Actor, subdomain: string, cohortId: string): Promise<Gradebook> {
    await this.access.authorize(actor, 'gradebook.read', { workspace: subdomain })
    const scope = await this.reportScope(subdomain)
    // The workspace check covers every cohort in it; an instructor reads only the cohorts they teach.
    const taught = await this.access.instructorCohortsIn(actor, scope.id)
    if (taught && !taught.includes(cohortId)) throw new ForbiddenException('Insufficient role')
    const book = gradebook(cohortId, await this.enrollmentRows(scope), new Date())
    if (!book) throw new NotFoundException(`Cohort ${cohortId} not found for this agency`)
    return book
  }

  async exitFile(actor: Actor, subdomain: string): Promise<string> {
    await this.access.authorize(actor, 'exit-file.read', { workspace: subdomain })
    const scope = await this.reportScope(subdomain)
    return exitFileCsv(await this.enrollmentRows(scope))
  }
}
