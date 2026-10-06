import { NotFoundException } from '@nestjs/common'
import { DatasetsMeController } from './datasets.controller'
import { DatasetsService } from './datasets.service'

const dataset = { id: 'd1', slug: 'sql-fundamentals', setupSql: 'create table t(x int);' }
const scenario = (over: object = {}) => ({
  scenarioId: 'data-001',
  status: 'published',
  data: {
    nodes: [{ type: 'decision' }, { type: 'sql', sql: { datasetSlug: 'sql-fundamentals' } }],
  },
  ...over,
})

function setup(row: object | null = scenario()) {
  const prisma = {
    scenario: { findUnique: jest.fn().mockResolvedValue(row) },
    dataset: {
      findUnique: jest.fn(async (a: { where: { slug: string } }) =>
        a.where.slug === 'sql-fundamentals' || a.where.slug === 'other'
          ? { ...dataset, ...a.where }
          : null
      ),
    },
    cohortDataset: { count: jest.fn().mockResolvedValue(0) },
    membership: { count: jest.fn().mockResolvedValue(0) },
  }
  const clerk = { getRole: jest.fn().mockResolvedValue('student') }
  return { prisma, clerk, svc: new DatasetsService(prisma as any, clerk as any, {} as any) }
}

describe('DatasetsService.getForLti', () => {
  it('returns the dataset an sql node of the launched scenario uses', async () => {
    const h = setup()
    await expect(h.svc.getForLti('data-001', 'sql-fundamentals')).resolves.toMatchObject({
      slug: 'sql-fundamentals',
    })
    expect(h.prisma.scenario.findUnique).toHaveBeenCalledWith({ where: { scenarioId: 'data-001' } })
  })

  it('does not consult the cohort, role or membership rules that apply to Clerk learners', async () => {
    const h = setup()
    await h.svc.getForLti('data-001', 'sql-fundamentals')
    expect(h.clerk.getRole).not.toHaveBeenCalled()
    expect(h.prisma.cohortDataset.count).not.toHaveBeenCalled()
    expect(h.prisma.membership.count).not.toHaveBeenCalled()
  })

  it('404s a dataset the launched scenario does not use, even though it exists', async () => {
    const h = setup()
    await expect(h.svc.getForLti('data-001', 'other')).rejects.toBeInstanceOf(NotFoundException)
    expect(h.prisma.dataset.findUnique).not.toHaveBeenCalled()
  })

  it('404s when the scenario is unknown, unpublished or has no sql nodes', async () => {
    await expect(setup(null).svc.getForLti('x', 'sql-fundamentals')).rejects.toBeInstanceOf(
      NotFoundException
    )
    await expect(
      setup(scenario({ status: 'draft' })).svc.getForLti('data-001', 'sql-fundamentals')
    ).rejects.toBeInstanceOf(NotFoundException)
    await expect(
      setup(scenario({ data: { nodes: [{ type: 'decision' }] } })).svc.getForLti(
        'data-001',
        'sql-fundamentals'
      )
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('404s when the referenced dataset row is gone', async () => {
    const h = setup(scenario({ data: { nodes: [{ type: 'sql', sql: { datasetSlug: 'gone' } }] } }))
    await expect(h.svc.getForLti('data-001', 'gone')).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('DatasetsMeController.get', () => {
  it('authorizes an LTI viewer by the launched scenario, not by the learner', async () => {
    const service = { getForLti: jest.fn().mockResolvedValue('d'), getForUser: jest.fn() }
    const c = new DatasetsMeController(service as any)
    const lti = { ref: 'data-001', jti: 'j', iat: 1, exp: 2, lineitem: 'l' }
    await expect(c.get({ userId: 'u1', lti }, 'sql-fundamentals')).resolves.toBe('d')
    expect(service.getForLti).toHaveBeenCalledWith('data-001', 'sql-fundamentals')
    expect(service.getForUser).not.toHaveBeenCalled()
  })

  it('keeps the existing rules for a Clerk learner', async () => {
    const service = { getForLti: jest.fn(), getForUser: jest.fn().mockResolvedValue('d') }
    const c = new DatasetsMeController(service as any)
    await c.get({ userId: 'u1' }, 'sql-fundamentals')
    expect(service.getForUser).toHaveBeenCalledWith('u1', 'sql-fundamentals')
    expect(service.getForLti).not.toHaveBeenCalled()
  })
})
