import type { PrismaService } from '../prisma/prisma.service'
import { FAILURE_KEEP_MS, ServiceFailureLog, type FailureService } from './service-failure-log'

// Learner failures kept in the ServiceFailure table, one product's rows per log (GitHub issue #92).

const HOUR = 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 15, 12, 0)

class TestLog extends ServiceFailureLog<'infra' | 'busy'> {
  constructor(prisma: PrismaService, service: FailureService) {
    super(prisma, service, ['infra', 'busy'])
  }
}

type Row = { at: Date; reason: string; kind: string }

function setup(service: FailureService = 'grading') {
  const serviceFailure = {
    create: jest.fn(async () => ({})),
    deleteMany: jest.fn(async () => ({ count: 0 })),
    count: jest.fn(async () => 0),
    findMany: jest.fn(async () => [] as Row[]),
    findFirst: jest.fn(async (): Promise<Row | null> => null),
  }
  const queryRaw = jest.fn(async (): Promise<{ hour: number; count: number }[]> => [])
  const log = new TestLog(
    { serviceFailure, $queryRaw: queryRaw } as unknown as PrismaService,
    service
  )
  let t = NOW
  log.now = () => t
  return { log, db: serviceFailure, queryRaw, later: (ms: number) => (t += ms) }
}

describe('ServiceFailureLog', () => {
  it("writes a failure with its time, its product's service, kind and reason", async () => {
    const { log, db } = setup('lessons')
    await log.record('Grading is busy. Try again in a moment.', 'busy')
    expect(db.create).toHaveBeenCalledWith({
      data: {
        at: new Date(NOW),
        service: 'lessons',
        kind: 'busy',
        reason: 'Grading is busy. Try again in a moment.',
      },
    })
  })

  it("deletes its own product's failures older than 30 days as it writes, at most once an hour", async () => {
    const { log, db, later } = setup()
    await log.record('a', 'infra')
    expect(db.deleteMany).toHaveBeenCalledWith({
      where: { service: 'grading', at: { lt: new Date(NOW - FAILURE_KEEP_MS) } },
    })
    later(HOUR - 1)
    await log.record('b', 'infra')
    expect(db.deleteMany).toHaveBeenCalledTimes(1)
    later(1)
    await log.record('c', 'infra')
    expect(db.deleteMany).toHaveBeenCalledTimes(2)
    expect(db.create).toHaveBeenCalledTimes(3)
  })

  it('never rejects when the database fails: the request goes on and the error is logged', async () => {
    const { log, db } = setup()
    db.create.mockRejectedValueOnce(new Error('connection refused'))
    const error = jest
      .spyOn((log as unknown as { logger: { error: (m: string) => void } }).logger, 'error')
      .mockImplementation(() => undefined)
    await expect(log.record('The practice database could not be loaded.', 'infra')).resolves.toBe(
      undefined
    )
    expect(error.mock.calls[0][0]).toContain('connection refused')
    db.deleteMany.mockRejectedValueOnce(new Error('timeout'))
    await expect(log.record('x', 'infra')).resolves.toBe(undefined)
  })

  it('cuts a very long reason', async () => {
    const { log, db } = setup()
    await log.record('x'.repeat(2_000), 'infra')
    const [[arg]] = db.create.mock.calls as unknown as [[{ data: { reason: string } }]]
    expect(arg.data.reason).toHaveLength(500)
  })

  it("reads only its own product's failures since a time (count and newest first), and the last one kept", async () => {
    const { log, db } = setup('lessons')
    const at = new Date(Date.UTC(2026, 9, 15, 11, 50))
    db.count.mockResolvedValue(4)
    db.findMany.mockResolvedValue([{ at, reason: 'r', kind: 'busy' }])
    db.findFirst.mockResolvedValue({ at, reason: 'r', kind: 'something-old' })
    const since = new Date(Date.UTC(2026, 9, 15, 11, 45))
    expect(await log.since(since, 20)).toEqual({
      count: 4,
      latest: [{ at, reason: 'r', kind: 'busy' }],
    })
    const where = { service: 'lessons', at: { gte: since } }
    expect(db.count).toHaveBeenCalledWith({ where })
    expect(db.findMany).toHaveBeenCalledWith({ where, orderBy: { at: 'desc' }, take: 20 })
    // a kind this product does not know reads back as its first kind
    expect(await log.last()).toEqual({ at, reason: 'r', kind: 'infra' })
    expect(db.findFirst).toHaveBeenCalledWith({
      where: { service: 'lessons' },
      orderBy: { at: 'desc' },
    })
  })

  it("counts its product's failures per hour in one parameterized grouped query, oldest hour first", async () => {
    const { log, queryRaw } = setup()
    queryRaw.mockResolvedValue([
      { hour: 0, count: 2 },
      { hour: 22, count: 5 },
      { hour: 24, count: 1 }, // stamped just after now: counts in the last hour
    ])
    const since = new Date(Date.UTC(2026, 9, 14, 12, 0))
    const counts = await log.perHour(since, 24)
    expect(counts).toHaveLength(24)
    expect(counts[0]).toBe(2)
    expect(counts[22]).toBe(5)
    expect(counts[23]).toBe(1)
    expect(counts.reduce((a, b) => a + b, 0)).toBe(8)
    const [strings, ...values] = queryRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ]
    expect(strings.join('?')).toContain('GROUP BY 1')
    expect(strings.join('?')).toContain('"service" = ?')
    expect(values).toEqual([since.toISOString(), 'grading', since.toISOString()])
  })

  it('gives 24 zeros when there were no failures', async () => {
    const { log } = setup()
    expect(await log.perHour(new Date(Date.UTC(2026, 9, 14, 12, 0)), 24)).toEqual(
      new Array(24).fill(0)
    )
  })

  it('says whether learners hit failures in the last 15 minutes, for a public check', async () => {
    const { log, db } = setup()
    expect(await log.recent()).toEqual({
      status: 'ok',
      failures: 0,
      windowMinutes: 15,
      latest: null,
    })
    expect(db.count).toHaveBeenCalledWith({
      where: { service: 'grading', at: { gte: new Date(NOW - 15 * 60_000) } },
    })
    const at = new Date(NOW - 60_000)
    db.count.mockResolvedValue(2)
    db.findMany.mockResolvedValue([{ at, reason: 'boom', kind: 'infra' }])
    expect(await log.recent()).toEqual({
      status: 'failing',
      failures: 2,
      windowMinutes: 15,
      latest: { at: at.toISOString(), reason: 'boom' },
    })
  })

  it('gives the last 24 hours (newest 20, per hour) and the last failure kept, for the System status page', async () => {
    const { log, db, queryRaw } = setup()
    const at = new Date(Date.UTC(2026, 9, 15, 9, 30))
    db.count.mockResolvedValue(3)
    db.findMany.mockResolvedValue([{ at, reason: 'busy', kind: 'busy' }])
    db.findFirst.mockResolvedValue({ at, reason: 'busy', kind: 'busy' })
    queryRaw.mockResolvedValue([{ hour: 21, count: 3 }])
    const h = await log.history()
    expect(h.failures).toEqual({
      windowHours: 24,
      count: 3,
      perHour: [...new Array<number>(21).fill(0), 3, 0, 0],
      latest: [{ at: at.toISOString(), reason: 'busy', kind: 'busy' }],
    })
    expect(h.lastFailureAt).toBe(at.toISOString())
    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 20,
        where: { service: 'grading', at: { gte: new Date(NOW - 24 * HOUR) } },
      })
    )
  })
})
