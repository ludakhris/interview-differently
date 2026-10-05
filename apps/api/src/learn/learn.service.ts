import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { AgencyOutcomes, Gradebook, LearnWorkspace } from '@id/types'
import { PrismaService } from '../prisma/prisma.service'
import { agencyOutcomes, gradebook, type EnrollmentRow } from './outcomes'
import { exitFileCsv } from './exit-file'

/** Roles on the LearnDifferently Clerk instance (publicMetadata.role). */
export const LEARN_ROLES = { agencyAdmin: 'agency-admin', caseManager: 'case-manager' } as const

@Injectable()
export class LearnService {
  constructor(private readonly prisma: PrismaService) {}

  /** Throws unless the caller's LearnDifferently role is one of `allowed`. */
  assertRole(role: string | undefined, allowed: string[]): void {
    if (!role || !allowed.includes(role)) throw new ForbiddenException('Insufficient role')
  }

  /**
   * Agencies the caller may open. Agency admins see every agency; anyone else
   * sees the agencies they hold a membership in (case managers, for example).
   */
  async workspaces(userId: string, role: string | undefined): Promise<LearnWorkspace[]> {
    const rows = await this.prisma.institution.findMany({
      where: {
        kind: 'agency',
        subdomain: { not: null },
        ...(role === LEARN_ROLES.agencyAdmin ? {} : { memberships: { some: { userId } } }),
      },
      select: { id: true, name: true, kind: true, subdomain: true },
      orderBy: { name: 'asc' },
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

  async agencyBySubdomain(subdomain: string): Promise<{ id: string; name: string }> {
    const agency = await this.prisma.institution.findFirst({
      where: { subdomain, kind: 'agency' },
      select: { id: true, name: true },
    })
    if (!agency) throw new NotFoundException(`No agency tenant "${subdomain}"`)
    return agency
  }

  /**
   * Every enrollment under an agency: cohorts run by the agency, by
   * institutions that report to it, or of courses authored by those.
   * Results are rolled up from item progress in one pass.
   */
  async enrollmentRows(agencyId: string): Promise<EnrollmentRow[]> {
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
      WHERE host."id" = ${agencyId} OR host."parentId" = ${agencyId} OR prov."parentId" = ${agencyId}
      GROUP BY e."id", u."displayName", c."id", host."id", co."id", prov."id"
    `)
  }

  async outcomes(subdomain: string): Promise<AgencyOutcomes> {
    const agency = await this.agencyBySubdomain(subdomain)
    return agencyOutcomes(agency, await this.enrollmentRows(agency.id), new Date())
  }

  async gradebook(subdomain: string, cohortId: string): Promise<Gradebook> {
    const agency = await this.agencyBySubdomain(subdomain)
    const book = gradebook(cohortId, await this.enrollmentRows(agency.id), new Date())
    if (!book) throw new NotFoundException(`Cohort ${cohortId} not found for this agency`)
    return book
  }

  async exitFile(subdomain: string): Promise<string> {
    const agency = await this.agencyBySubdomain(subdomain)
    return exitFileCsv(await this.enrollmentRows(agency.id))
  }
}
