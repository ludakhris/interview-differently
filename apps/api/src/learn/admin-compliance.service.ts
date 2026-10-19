import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AccessService } from './access/access.service'
import type {
  ComplianceFramework,
  ComplianceImport,
  ComplianceRequirement,
  ComplianceStatus,
} from './learn-types'

const STATUSES: ComplianceStatus[] = ['satisfied', 'partial', 'not_satisfied', 'not_applicable']
const MAX_ROWS = 2000
const text = (v: unknown, max = 4000): string | null =>
  typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null

/**
 * System admin tool: Compliance. Each governing agency's requirements on us as a vendor (for example Delaware DTI)
 * and where we stand on each. Platform admins only: the rows describe how the system is built. The data is imported
 * from a file, a whole framework at a time, and never kept in the repo, which is public.
 */
@Injectable()
export class AdminComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService
  ) {}

  async frameworks(actorRole: string | undefined): Promise<ComplianceFramework[]> {
    this.access.requireSystemAdmin({ userId: '', role: actorRole })
    const rows = await this.prisma.complianceRequirement.findMany({
      orderBy: [{ framework: 'asc' }, { position: 'asc' }],
    })
    const out = new Map<string, ComplianceFramework>()
    for (const r of rows) {
      let f = out.get(r.framework)
      if (!f) {
        f = {
          key: r.framework,
          name: r.frameworkName,
          importedAt: r.importedAt.toISOString(),
          requirements: [],
        }
        out.set(r.framework, f)
      }
      f.requirements.push({
        code: r.code,
        area: r.area,
        requirement: r.requirement,
        strength: r.strength === 'SHOULD' ? 'SHOULD' : 'MUST',
        source: r.source,
        status: r.status as ComplianceStatus,
        standing: r.standing,
        plan: r.plan,
        issue: r.issue,
      })
    }
    return [...out.values()]
  }

  /** Replaces one framework's requirements with the file's; other frameworks are left alone. */
  async import(
    actorRole: string | undefined,
    body: unknown
  ): Promise<{ key: string; count: number }> {
    this.access.requireSystemAdmin({ userId: '', role: actorRole })
    const file = parseImport(body)
    await this.prisma.$transaction([
      this.prisma.complianceRequirement.deleteMany({ where: { framework: file.key } }),
      this.prisma.complianceRequirement.createMany({
        data: file.requirements.map((r, position) => ({
          framework: file.key,
          frameworkName: file.name,
          ...r,
          position,
        })),
      }),
    ])
    return { key: file.key, count: file.requirements.length }
  }
}

/** Checks an import file and returns it cleaned; throws a message that says which row is wrong. */
export function parseImport(body: unknown): ComplianceImport {
  const b = (body ?? {}) as Partial<Record<keyof ComplianceImport, unknown>>
  const key = text(b.key, 64)
  if (!key || !/^[a-z0-9-]+$/.test(key))
    throw new BadRequestException(
      'The file needs a "key" of lowercase letters, digits and dashes, such as delaware-dti.'
    )
  const name = text(b.name, 200)
  if (!name) throw new BadRequestException('The file needs a "name" for the governing agency.')
  if (
    !Array.isArray(b.requirements) ||
    b.requirements.length === 0 ||
    b.requirements.length > MAX_ROWS
  )
    throw new BadRequestException(`The file needs a "requirements" list of 1 to ${MAX_ROWS} rows.`)
  const seen = new Set<string>()
  const requirements = b.requirements.map((raw, i): ComplianceRequirement => {
    const r = (raw ?? {}) as Record<string, unknown>
    const where = `Row ${i + 1}`
    const code = text(r.code, 32)
    if (!code) throw new BadRequestException(`${where} has no code.`)
    if (seen.has(code)) throw new BadRequestException(`${where}: ${code} appears twice.`)
    seen.add(code)
    const status = r.status as ComplianceStatus
    if (!STATUSES.includes(status))
      throw new BadRequestException(`${code}: status must be one of ${STATUSES.join(', ')}.`)
    const fields = {
      area: text(r.area, 200),
      requirement: text(r.requirement, 500),
      source: text(r.source, 500),
      standing: text(r.standing),
    }
    for (const [k, v] of Object.entries(fields))
      if (!v) throw new BadRequestException(`${code} has no ${k}.`)
    const plan = text(r.plan)
    if ((status === 'partial' || status === 'not_satisfied') && !plan)
      throw new BadRequestException(`${code} is ${status.replace('_', ' ')} but has no plan.`)
    const open = status === 'partial' || status === 'not_satisfied'
    const issue = r.issue == null || r.issue === '' ? null : Number(r.issue)
    if (issue !== null && (!Number.isInteger(issue) || issue < 1))
      throw new BadRequestException(`${code}: issue must be a GitHub issue number.`)
    return {
      code,
      area: fields.area as string,
      requirement: fields.requirement as string,
      strength: r.strength === 'SHOULD' ? 'SHOULD' : 'MUST',
      source: fields.source as string,
      status,
      standing: fields.standing as string,
      plan: open ? plan : null,
      issue: open ? issue : null,
    }
  })
  return { key, name, requirements }
}
