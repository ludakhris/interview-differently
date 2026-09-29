import { ToolsService } from './tools.service'

const NOW = Date.now()
const row = (id: string, userId: string, ageMin: number, ok = true) => ({
  id,
  userId,
  cohortId: 'c1',
  datasetSlug: 'ds',
  queryText: `select ${id}`,
  ok,
  errorMessage: ok ? null : 'boom',
  rowCount: 1,
  durationMs: 5,
  createdAt: new Date(NOW - ageMin * 60_000),
})

function make(logs: ReturnType<typeof row>[]) {
  const prisma = {
    cohort: {
      findUnique: async () => ({
        id: 'c1',
        name: 'Cohort',
        memberships: [
          { user: { id: 'a', email: 'a@x.com', displayName: 'Alice' } },
          { user: { id: 'b', email: 'b@x.com', displayName: null } },
          { user: { id: 'a', email: 'a@x.com', displayName: 'Alice' } }, // duplicate membership row
        ],
      }),
    },
    sqlQueryLog: { findMany: jest.fn(async () => logs) },
  }
  return { svc: new ToolsService(prisma as never, {} as never), prisma }
}

describe('sandboxActivity', () => {
  it('lists every student once, active first, silent last, with counts', async () => {
    const { svc } = make([row('q2', 'b', 1), row('q1', 'b', 10, false)])
    const r = await svc.sandboxActivity('c1')
    expect(r.students.map((s) => s.userId)).toEqual(['b', 'a'])
    expect(r.students[0]).toMatchObject({ queryCount: 2, errorCount: 1, name: 'b@x.com' })
    expect(r.students[0].queries.map((q) => q.id)).toEqual(['q2', 'q1'])
    expect(r.students[1]).toMatchObject({ queryCount: 0, lastQueryAt: null })
  })

  it('only reads rows inside the 90-day window', async () => {
    const { svc, prisma } = make([])
    await svc.sandboxActivity('c1')
    const where = (
      prisma.sqlQueryLog.findMany.mock.calls[0] as unknown as [
        { where: { createdAt: { gte: Date } } },
      ]
    )[0].where
    const days = (Date.now() - where.createdAt.gte.getTime()) / 86_400_000
    expect(days).toBeGreaterThan(89.9)
    expect(days).toBeLessThan(90.1)
  })
})
