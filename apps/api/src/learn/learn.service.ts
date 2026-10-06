import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { AgencyOutcomes, Gradebook, LearnWorkspace } from './learn-types'
import { PrismaService } from '../prisma/prisma.service'
import { agencyOutcomes, gradebook, type EnrollmentRow } from './outcomes'
import { exitFileCsv } from './exit-file'

/** Roles on the LearnDifferently Clerk instance (publicMetadata.role). */
export const LEARN_ROLES = {
  agencyAdmin: 'agency-admin',
  caseManager: 'case-manager',
  providerAdmin: 'provider-admin',
} as const

@Injectable()
export class LearnService {
  constructor(private readonly prisma: PrismaService) {}

  /** Throws unless the caller's LearnDifferently role is one of `allowed`. */
  assertRole(role: string | undefined, allowed: string[]): void {
    if (!role || !allowed.includes(role)) throw new ForbiddenException('Insufficient role')
  }

  /**
   * Workspaces the caller may open. Agency admins see every agency and the
   * providers and organizations that report to one; anyone else sees the
   * institutions they hold a membership in.
   */
  async workspaces(userId: string, role: string | undefined): Promise<LearnWorkspace[]> {
    const rows = await this.prisma.institution.findMany({
      where:
        role === LEARN_ROLES.agencyAdmin
          ? { subdomain: { not: null }, OR: [{ kind: 'agency' }, { parent: { kind: 'agency' } }] }
          : { subdomain: { not: null }, memberships: { some: { userId, cohortId: null } } },
      select: { id: true, name: true, kind: true, subdomain: true, parentId: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    })
    return rows.map((r) => ({ ...r, subdomain: r.subdomain as string }))
  }

  /** Throws unless the caller may open this workspace. */
  async assertWorkspace(
    userId: string,
    role: string | undefined,
    subdomain: string
  ): Promise<void> {
    const list = await this.workspaces(userId, role)
    if (!list.some((w) => w.subdomain === subdomain)) {
      throw new ForbiddenException('No access to this workspace')
    }
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
        MAX(ip."score") FILTER (WHERE it."type" = 'interview' AND ip."status" = 'completed')::int AS "interviewBest",
        COALESCE(MAX(ip."attempts") FILTER (WHERE it."type" = 'interview'), 0)::int AS "interviewAttempts",
        (COUNT(ip."id") FILTER (WHERE ip."status" = 'completed'))::int AS "itemsDone",
        (SELECT COUNT(*) FROM "CourseItem" ci JOIN "CourseModule" cm ON cm."id" = ci."moduleId"
           WHERE cm."courseId" = co."id")::int AS "itemsTotal",
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

  async outcomes(subdomain: string): Promise<AgencyOutcomes> {
    const scope = await this.reportScope(subdomain)
    return agencyOutcomes(
      { id: scope.id, name: scope.name },
      await this.enrollmentRows(scope),
      new Date()
    )
  }

  async gradebook(subdomain: string, cohortId: string): Promise<Gradebook> {
    const scope = await this.reportScope(subdomain)
    const book = gradebook(cohortId, await this.enrollmentRows(scope), new Date())
    if (!book) throw new NotFoundException(`Cohort ${cohortId} not found for this agency`)
    return book
  }

  async exitFile(subdomain: string): Promise<string> {
    const scope = await this.reportScope(subdomain)
    return exitFileCsv(await this.enrollmentRows(scope))
  }
}
