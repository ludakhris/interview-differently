import { BadRequestException, ForbiddenException } from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service'
import { AccessService } from './access/access.service'
import { SYSTEM_ADMIN } from './access/permissions'
import { AdminComplianceService, parseImport } from './admin-compliance.service'

const findMany = jest.fn()
const deleteMany = jest.fn((a: unknown) => ({ op: 'delete', a }))
const createMany = jest.fn((a: unknown) => ({ op: 'create', a }))
const $transaction = jest.fn(async (ops: unknown[]) => ops)
const prisma = {
  complianceRequirement: { findMany, deleteMany, createMany },
  $transaction,
} as unknown as PrismaService
const service = new AdminComplianceService(prisma, new AccessService({} as never))

const row = (over: Record<string, unknown> = {}) => ({
  code: 'IAM-12',
  area: 'Identity and access',
  requirement: 'Adaptive multi-factor authentication',
  strength: 'MUST',
  source: 'IAM-S §IV, p2',
  status: 'not_satisfied',
  standing: 'No MFA is enforced.',
  plan: 'Turn on MFA for staff.',
  issue: 99,
  ...over,
})
const file = (requirements: unknown[] = [row()]) => ({
  key: 'delaware-dti',
  name: 'State of Delaware, DTI',
  requirements,
})

describe('AdminComplianceService', () => {
  beforeEach(() => jest.clearAllMocks())

  it('refuses everyone but platform administrators', async () => {
    for (const role of [undefined, 'agency-admin', 'provider-admin']) {
      await expect(service.frameworks(role)).rejects.toThrow(ForbiddenException)
      await expect(service.import(role, file())).rejects.toThrow(ForbiddenException)
    }
    expect(findMany).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })

  it('groups requirements by framework in imported order', async () => {
    const at = new Date('2026-10-19T00:00:00Z')
    findMany.mockResolvedValue([
      {
        ...row(),
        framework: 'delaware-dti',
        frameworkName: 'Delaware',
        importedAt: at,
        position: 0,
      },
      {
        ...row({ code: 'ACC-01', status: 'satisfied', plan: null, issue: null }),
        framework: 'delaware-dti',
        frameworkName: 'Delaware',
        importedAt: at,
        position: 1,
      },
    ])
    const [f] = await service.frameworks(SYSTEM_ADMIN)
    expect(f.key).toBe('delaware-dti')
    expect(f.requirements.map((r) => r.code)).toEqual(['IAM-12', 'ACC-01'])
  })

  it('replaces only the imported framework, in one transaction', async () => {
    await expect(service.import(SYSTEM_ADMIN, file())).resolves.toEqual({
      key: 'delaware-dti',
      count: 1,
    })
    expect(deleteMany).toHaveBeenCalledWith({ where: { framework: 'delaware-dti' } })
    expect(createMany.mock.calls[0][0]).toMatchObject({
      data: [{ framework: 'delaware-dti', code: 'IAM-12', position: 0 }],
    })
    expect($transaction).toHaveBeenCalledTimes(1)
  })
})

describe('parseImport', () => {
  it('rejects a bad status, a missing plan and a repeated code, naming the row', () => {
    expect(() => parseImport(file([row({ status: 'gap' })]))).toThrow(/IAM-12: status must be/)
    expect(() => parseImport(file([row({ plan: '' })]))).toThrow(/has no plan/)
    expect(() => parseImport(file([row(), row()]))).toThrow(/appears twice/)
    expect(() => parseImport({ ...file(), key: 'Delaware DTI' })).toThrow(BadRequestException)
  })

  it('drops the plan of a satisfied or not applicable requirement', () => {
    const out = parseImport(file([row({ status: 'not_applicable', plan: 'x' })]))
    expect(out.requirements[0].plan).toBeNull()
    expect(out.requirements[0].issue).toBeNull()
  })

  it('keeps the tracking issue of an open requirement and rejects one that is not a number', () => {
    expect(parseImport(file()).requirements[0].issue).toBe(99)
    expect(() => parseImport(file([row({ issue: 'soon' })]))).toThrow(/issue must be/)
  })
})
