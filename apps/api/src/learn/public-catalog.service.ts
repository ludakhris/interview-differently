import { Injectable, NotFoundException } from '@nestjs/common'
import type { CatalogCourse, CatalogOffering } from './learn-types'
import { PrismaService } from '../prisma/prisma.service'
import { runAsSystem } from '../core/tenant-context'
import { cohortStatus } from './cohort-config'

/** What an agency's public catalog shows: published courses of the providers it lists. No sign-in needed. */
@Injectable()
export class PublicCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private async agencyId(subdomain: string): Promise<string> {
    const agency = await this.prisma.institution.findFirst({
      where: { subdomain, kind: 'agency' },
      select: { id: true },
    })
    if (!agency) throw new NotFoundException('Catalog not found')
    return agency.id
  }

  private card(c: {
    id: string
    title: string
    summary: string | null
    sector: string | null
    credential: string | null
    lengthWeeks: number | null
    outcomes: string[]
    targetRoles: string[]
    tuitionDollars: number | null
    contactHours: number | null
    format: string | null
    prerequisite: string | null
    provider: { name: string }
    cohorts: {
      startsAt: Date | null
      endsAt: Date | null
      requiresApproval: boolean
      acceptsRequests: boolean
    }[]
  }): CatalogCourse {
    const open = c.cohorts.filter((k) => cohortStatus(k.startsAt, k.endsAt) !== 'completed')
    const upcoming = c.cohorts
      .filter((k) => cohortStatus(k.startsAt, k.endsAt) === 'upcoming' && k.startsAt)
      .map((k) => (k.startsAt as Date).getTime())
      .sort((a, b) => a - b)[0]
    return {
      id: c.id,
      title: c.title,
      summary: c.summary,
      sector: c.sector,
      credential: c.credential,
      lengthWeeks: c.lengthWeeks,
      provider: c.provider.name,
      outcomes: c.outcomes,
      targetRoles: c.targetRoles,
      nextStart: upcoming ? new Date(upcoming).toISOString() : null,
      openCohorts: open.length,
      tuitionDollars: c.tuitionDollars,
      contactHours: c.contactHours,
      format: c.format,
      prerequisite: c.prerequisite,
      acceptsRequests: open.some((k) => k.acceptsRequests && k.requiresApproval),
    }
  }

  async catalog(subdomain: string, q?: string): Promise<CatalogCourse[]> {
    const agencyId = await this.agencyId(subdomain)
    const term = q?.trim()
    // Public by design: published course cards only. Read as the system, since no one is signed in.
    const rows = await runAsSystem(() =>
      this.prisma.course.findMany({
        where: {
          status: 'published',
          provider: { parentId: agencyId },
          ...(term
            ? {
                OR: [
                  { title: { contains: term, mode: 'insensitive' } },
                  { sector: { contains: term, mode: 'insensitive' } },
                  { credential: { contains: term, mode: 'insensitive' } },
                  { provider: { name: { contains: term, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
        include: {
          provider: { select: { name: true } },
          cohorts: {
            where: { agencyId },
            select: { startsAt: true, endsAt: true, requiresApproval: true, acceptsRequests: true },
          },
        },
        orderBy: [{ sector: 'asc' }, { title: 'asc' }],
      })
    )
    return rows.map((c) => this.card(c))
  }

  async offering(subdomain: string, courseId: string): Promise<CatalogOffering> {
    const agencyId = await this.agencyId(subdomain)
    const c = await runAsSystem(() =>
      this.prisma.course.findFirst({
        where: { id: courseId, status: 'published', provider: { parentId: agencyId } },
        include: {
          provider: { select: { name: true } },
          // Only this agency's own cohorts: a course another agency runs is not this catalog's to show.
          cohorts: {
            where: { agencyId },
            select: {
              name: true,
              startsAt: true,
              endsAt: true,
              requiresApproval: true,
              acceptsRequests: true,
              maxLearners: true,
              _count: { select: { enrollments: { where: { status: { not: 'withdrawn' } } } } },
            },
            orderBy: { startsAt: 'asc' },
          },
          modules: {
            orderBy: { position: 'asc' },
            select: { title: true, _count: { select: { items: true } } },
          },
        },
      })
    )
    if (!c) throw new NotFoundException('Offering not found')
    return {
      ...this.card(c),
      modules: c.modules.map((m) => ({ title: m.title, items: m._count.items })),
      cohorts: c.cohorts
        .map((k) => ({
          name: k.name,
          startsAt: k.startsAt?.toISOString() ?? null,
          endsAt: k.endsAt?.toISOString() ?? null,
          status: cohortStatus(k.startsAt, k.endsAt),
          seatsLeft:
            k.maxLearners === null ? null : Math.max(0, k.maxLearners - k._count.enrollments),
        }))
        .filter((k) => k.status !== 'completed'),
    }
  }
}
