import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { createHash } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { ClerkService } from '../auth/clerk.service'
import { SqlRunnerService, type SchemaTable } from '../sql-runner/sql-runner.service'

export interface DatasetInput {
  slug: string
  name: string
  description?: string | null
  setupSql: string
  /** Owner. Only read on create; null = platform-wide. */
  institutionId?: string | null
}

/** Prisma `where` narrowing content to what an admin may see (undefined = everything). */
export type ContentWhere = { OR: [{ institutionId: null }, { institutionId: { in: string[] } }] } | undefined

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Datasets for the SQL sandbox (#25).
 *
 * Saving a dataset runs its setup script through PGlite first — a script
 * that doesn't execute cleanly is rejected, and the resulting schema is
 * stored as `schemaSummary` so the sandbox's schema browser doesn't have to
 * rebuild the database just to list tables.
 */
@Injectable()
export class DatasetsService {
  constructor(
    private prisma: PrismaService,
    private clerk: ClerkService,
    private runner: SqlRunnerService,
  ) {}

  // ── Admin ────────────────────────────────────────────────────────────────

  async list(where: ContentWhere) {
    const rows = await this.prisma.dataset.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { cohorts: true } }, institution: { select: { name: true } } },
    })
    return rows.map((d) => ({
      id: d.id,
      slug: d.slug,
      name: d.name,
      description: d.description,
      dialect: d.dialect,
      schemaSummary: d.schemaSummary as unknown as SchemaTable[],
      institutionId: d.institutionId,
      institutionName: d.institution?.name ?? null,
      cohortCount: d._count.cohorts,
      updatedAt: d.updatedAt,
    }))
  }

  async get(id: string) {
    const d = await this.prisma.dataset.findUnique({
      where: { id },
      include: { cohorts: { select: { cohortId: true } }, institution: { select: { name: true } } },
    })
    if (!d) throw new NotFoundException(`Dataset ${id} not found`)
    return {
      ...d,
      institutionName: d.institution?.name ?? null,
      cohortIds: d.cohorts.map((c) => c.cohortId),
      cohorts: undefined,
      institution: undefined,
    }
  }

  /** Runs the script and returns the schema — used by the admin "Validate" button. Throws 400 on SQL error. */
  async validate(setupSql: string): Promise<SchemaTable[]> {
    if (!setupSql?.trim()) throw new BadRequestException('setupSql is required')
    try {
      return await this.runner.introspect(setupSql)
    } catch (err) {
      throw new BadRequestException(`Setup SQL failed: ${(err as Error).message}`)
    }
  }

  async create(input: DatasetInput, institutionId: string | null) {
    const data = await this.prepare(input)
    try {
      return await this.prisma.dataset.create({ data: { ...data, institutionId } })
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException(`Slug "${data.slug}" is already in use`)
      }
      throw err
    }
  }

  async update(id: string, input: DatasetInput) {
    const data = await this.prepare(input)
    try {
      return await this.prisma.dataset.update({ where: { id }, data })
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'P2025') throw new NotFoundException(`Dataset ${id} not found`)
      if (code === 'P2002') throw new ConflictException(`Slug "${data.slug}" is already in use`)
      throw err
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.dataset.delete({ where: { id } })
    } catch (err) {
      if ((err as { code?: string }).code === 'P2025') throw new NotFoundException(`Dataset ${id} not found`)
      throw err
    }
  }

  /**
   * Replaces the set of cohorts that can open this dataset. With
   * `withinInstitutions`, only assignments in those institutions are
   * touched — an institution-admin assigning a platform dataset must not
   * disturb another institution's cohorts.
   */
  async setCohorts(id: string, cohortIds: string[], withinInstitutions: string[] | null): Promise<void> {
    await this.get(id)
    if (withinInstitutions) {
      const allowed = await this.prisma.cohort.count({
        where: { id: { in: cohortIds }, institutionId: { in: withinInstitutions } },
      })
      if (allowed !== new Set(cohortIds).size) throw new ForbiddenException('Cohort outside your institutions')
    }
    await this.prisma.$transaction([
      this.prisma.cohortDataset.deleteMany({
        where: { datasetId: id, ...(withinInstitutions ? { cohort: { institutionId: { in: withinInstitutions } } } : {}) },
      }),
      this.prisma.cohortDataset.createMany({
        data: cohortIds.map((cohortId) => ({ cohortId, datasetId: id })),
        skipDuplicates: true,
      }),
    ])
  }

  /** Cohorts for the assignment picker — every institution, or just the admin's. */
  async cohortOptions(onlyInstitutions: string[] | null) {
    const rows = await this.prisma.cohort.findMany({
      where: onlyInstitutions ? { institutionId: { in: onlyInstitutions } } : undefined,
      orderBy: [{ institution: { name: 'asc' } }, { name: 'asc' }],
      include: { institution: { select: { name: true } } },
    })
    return rows.map((c) => ({ id: c.id, name: c.name, institutionName: c.institution.name }))
  }

  private async prepare(input: DatasetInput) {
    const slug = input.slug?.trim()
    const name = input.name?.trim()
    if (!slug || !SLUG_RE.test(slug)) throw new BadRequestException('slug must be lowercase letters, digits and hyphens')
    if (!name) throw new BadRequestException('name is required')
    const schemaSummary = await this.validate(input.setupSql)
    return {
      slug,
      name,
      description: input.description?.trim() || null,
      setupSql: input.setupSql,
      setupHash: createHash('sha256').update(input.setupSql).digest('hex'),
      schemaSummary: schemaSummary as unknown as object[],
    }
  }

  // ── Student ──────────────────────────────────────────────────────────────

  /**
   * Datasets visible to a user: all of them for admins, platform + own
   * institutions' for institution-admins, otherwise those assigned to one
   * of their cohorts that also has the sandbox tool enabled.
   */
  async listForUser(userId: string) {
    const role = await this.clerk.getRole(userId)
    const rows = await this.prisma.dataset.findMany({
      where:
        role === 'admin'
          ? {}
          : role === 'institution-admin'
            ? { OR: [{ institutionId: null }, { institution: { memberships: { some: { userId } } } }] }
            : { cohorts: { some: { cohort: this.sandboxCohortFor(userId) } } },
      orderBy: { name: 'asc' },
      select: { id: true, slug: true, name: true, description: true, dialect: true, schemaSummary: true },
    })
    return rows
  }

  /**
   * Full dataset for a signed-in user. Allowed when the user is an admin, a
   * member of a cohort with the sandbox on and this dataset assigned, or the
   * dataset is referenced by an `sql` node in a published scenario — a
   * simulation player needs the script regardless of cohort tooling.
   */
  async getForUser(userId: string, slug: string) {
    const d = await this.prisma.dataset.findUnique({ where: { slug } })
    if (!d) throw new NotFoundException(`Dataset ${slug} not found`)
    const role = await this.clerk.getRole(userId)
    if (role === 'admin') return d
    if (role === 'institution-admin') {
      if (d.institutionId === null) return d
      const member = await this.prisma.membership.count({ where: { userId, institutionId: d.institutionId } })
      if (member > 0) return d
    }
    const viaCohort = await this.prisma.cohortDataset.count({
      where: { datasetId: d.id, cohort: this.sandboxCohortFor(userId) },
    })
    if (viaCohort > 0) return d
    if (await this.referencedByPublishedScenario(slug)) return d
    throw new NotFoundException(`Dataset ${slug} not found`)
  }

  private async referencedByPublishedScenario(slug: string): Promise<boolean> {
    const rows = await this.prisma.scenario.findMany({ where: { status: 'published' }, select: { data: true } })
    return rows.some((r) => {
      const nodes = (r.data as { nodes?: { type?: string; sql?: { datasetSlug?: string } }[] }).nodes ?? []
      return nodes.some((n) => n.type === 'sql' && n.sql?.datasetSlug === slug)
    })
  }

  /** Prisma filter: a cohort the user belongs to with 'sql-sandbox' switched on. */
  private sandboxCohortFor(userId: string) {
    return {
      memberships: { some: { userId } },
      tools: { some: { toolKey: 'sql-sandbox', enabled: true } },
    }
  }
}
