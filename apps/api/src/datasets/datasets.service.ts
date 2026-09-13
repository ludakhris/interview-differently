import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { createHash } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { ClerkService } from '../auth/clerk.service'
import { SqlRunnerService, type SchemaTable } from '../sql-runner/sql-runner.service'

export interface DatasetInput {
  slug: string
  name: string
  description?: string | null
  setupSql: string
}

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

  async list() {
    const rows = await this.prisma.dataset.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { cohorts: true } } },
    })
    return rows.map((d) => ({
      id: d.id,
      slug: d.slug,
      name: d.name,
      description: d.description,
      dialect: d.dialect,
      schemaSummary: d.schemaSummary as unknown as SchemaTable[],
      cohortCount: d._count.cohorts,
      updatedAt: d.updatedAt,
    }))
  }

  async get(id: string) {
    const d = await this.prisma.dataset.findUnique({
      where: { id },
      include: { cohorts: { select: { cohortId: true } } },
    })
    if (!d) throw new NotFoundException(`Dataset ${id} not found`)
    return { ...d, cohortIds: d.cohorts.map((c) => c.cohortId), cohorts: undefined }
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

  async create(input: DatasetInput) {
    const data = await this.prepare(input)
    try {
      return await this.prisma.dataset.create({ data })
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

  /** Replaces the set of cohorts that can open this dataset. */
  async setCohorts(id: string, cohortIds: string[]): Promise<void> {
    await this.get(id)
    await this.prisma.$transaction([
      this.prisma.cohortDataset.deleteMany({ where: { datasetId: id } }),
      this.prisma.cohortDataset.createMany({
        data: cohortIds.map((cohortId) => ({ cohortId, datasetId: id })),
        skipDuplicates: true,
      }),
    ])
  }

  /** Every cohort across all institutions — for the assignment picker. */
  async cohortOptions() {
    const rows = await this.prisma.cohort.findMany({
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
   * Datasets visible to a user: all of them for admins, otherwise those
   * assigned to one of their cohorts that also has the sandbox tool enabled.
   */
  async listForUser(userId: string) {
    const rows = await this.prisma.dataset.findMany({
      where: (await this.clerk.isAdmin(userId)) ? {} : { cohorts: { some: { cohort: this.sandboxCohortFor(userId) } } },
      orderBy: { name: 'asc' },
      select: { id: true, slug: true, name: true, description: true, dialect: true, schemaSummary: true },
    })
    return rows
  }

  async getForUser(userId: string, slug: string) {
    const d = await this.prisma.dataset.findUnique({ where: { slug } })
    if (!d) throw new NotFoundException(`Dataset ${slug} not found`)
    if (!(await this.clerk.isAdmin(userId))) {
      const allowed = await this.prisma.cohortDataset.count({
        where: { datasetId: d.id, cohort: this.sandboxCohortFor(userId) },
      })
      if (allowed === 0) throw new NotFoundException(`Dataset ${slug} not found`)
    }
    return d
  }

  /** Prisma filter: a cohort the user belongs to with 'sql-sandbox' switched on. */
  private sandboxCohortFor(userId: string) {
    return {
      memberships: { some: { userId } },
      tools: { some: { toolKey: 'sql-sandbox', enabled: true } },
    }
  }
}
