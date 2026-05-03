import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface InstitutionInput {
  name: string
  /** Optional. Empty string / null means "no domain — students join via cohort key or admin-add". */
  emailDomain?: string | null
}

export interface InstitutionSummary {
  id: string
  name: string
  emailDomain: string | null
  createdAt: Date
  cohortCount: number
  memberCount: number
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i

/**
 * Normalises an optional email domain. Returns null when the caller passed
 * nothing (or empty/whitespace) — that's a valid state for institutions whose
 * students don't share a domain. Validates format only when a value is given.
 */
function normaliseDomain(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const trimmed = raw.trim().toLowerCase().replace(/^@/, '')
  if (trimmed === '') return null
  if (!DOMAIN_RE.test(trimmed)) {
    throw new BadRequestException(`Invalid email domain: "${raw}". Expected something like "example.edu".`)
  }
  return trimmed
}

@Injectable()
export class InstitutionsService {
  constructor(private prisma: PrismaService) {}

  async list(): Promise<InstitutionSummary[]> {
    const rows = await this.prisma.institution.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { cohorts: true, memberships: true } },
      },
    })
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      emailDomain: r.emailDomain,
      createdAt: r.createdAt,
      cohortCount: r._count.cohorts,
      memberCount: r._count.memberships,
    }))
  }

  async get(id: string) {
    const row = await this.prisma.institution.findUnique({
      where: { id },
      include: {
        cohorts: {
          orderBy: { name: 'asc' },
          include: { _count: { select: { memberships: true } } },
        },
        _count: { select: { memberships: true } },
      },
    })
    if (!row) throw new NotFoundException(`Institution ${id} not found`)
    return {
      id: row.id,
      name: row.name,
      emailDomain: row.emailDomain,
      createdAt: row.createdAt,
      memberCount: row._count.memberships,
      cohorts: row.cohorts.map((c) => ({
        id: c.id,
        name: c.name,
        joinKey: c.joinKey,
        createdAt: c.createdAt,
        memberCount: c._count.memberships,
      })),
    }
  }

  async create(input: InstitutionInput) {
    if (!input.name?.trim()) throw new BadRequestException('name is required')
    const emailDomain = normaliseDomain(input.emailDomain)
    try {
      return await this.prisma.institution.create({
        data: { name: input.name.trim(), emailDomain },
      })
    } catch (err) {
      if (typeof err === 'object' && err && 'code' in err && (err as { code: string }).code === 'P2002') {
        throw new ConflictException(`Email domain "${emailDomain}" is already registered`)
      }
      throw err
    }
  }

  async update(id: string, input: Partial<InstitutionInput>) {
    const data: { name?: string; emailDomain?: string | null } = {}
    if (input.name !== undefined) {
      if (!input.name.trim()) throw new BadRequestException('name cannot be empty')
      data.name = input.name.trim()
    }
    if (input.emailDomain !== undefined) {
      data.emailDomain = normaliseDomain(input.emailDomain)
    }
    try {
      return await this.prisma.institution.update({ where: { id }, data })
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'P2025') throw new NotFoundException(`Institution ${id} not found`)
      if (code === 'P2002') throw new ConflictException(`Email domain "${data.emailDomain}" is already registered`)
      throw err
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.institution.delete({ where: { id } })
    } catch (err) {
      if ((err as { code?: string }).code === 'P2025') {
        throw new NotFoundException(`Institution ${id} not found`)
      }
      throw err
    }
  }
}
