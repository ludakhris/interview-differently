import type { FailureHistory } from '../../core/status-port'
import type { RecentFailures } from '../../core/service-failure-log'
import type { GradingFailureLog } from './grading-failure-log'
import { GradingHealthController } from './grading-health.controller'
import {
  BUSY_CHECK_TTL_MS,
  GRADING_CHECK_TTL_MS,
  GradingHealthService,
} from './grading-health.service'
import { SqlRunnerBusyError, type SqlRunnerService } from './sql-runner.service'

const ok = { ok: true, error: null, peakMb: 1_300, limitMb: 2_048 }
const fail = {
  ok: false,
  error: 'The practice database could not be loaded.',
  peakMb: null,
  limitMb: 2_048,
}

function setup(...answers: (object | Error)[]) {
  const measure = jest.fn()
  for (const a of answers)
    measure.mockImplementationOnce(() =>
      a instanceof Error ? Promise.reject(a) : Promise.resolve(a)
    )
  const quiet: FailureHistory<'infra' | 'busy'> = {
    failures: { windowHours: 24, count: 0, perHour: new Array<number>(24).fill(0), latest: [] },
    lastFailureAt: null,
  }
  const log = {
    recent: jest.fn(
      async (): Promise<RecentFailures> => ({
        status: 'ok',
        failures: 0,
        windowMinutes: 15,
        latest: null,
      })
    ),
    history: jest.fn(async () => quiet),
  }
  const s = new GradingHealthService(
    { measure, limits: { maxRssMb: 2_048 } } as unknown as SqlRunnerService,
    log as unknown as GradingFailureLog
  )
  let t = Date.UTC(2026, 9, 15, 15, 0)
  s.now = () => t
  const c = new GradingHealthController(s)
  const res = { status: jest.fn() }
  return { c, s, measure, log, res, later: (ms: number) => (t += ms) }
}

describe('GET /health/grading/self-test', () => {
  it('loads the practice dataset in a grading process and answers ok, saying only that and when', async () => {
    const { c, measure, res } = setup(ok)
    expect(await c.selfTest(res as never)).toEqual({
      status: 'ok',
      checkedAt: '2026-10-15T15:00:00.000Z',
    })
    expect(res.status).not.toHaveBeenCalled()
    expect(measure.mock.calls[0][0]).toContain('CREATE TABLE')
  })

  it('answers 503 when grading fails, keeping the reason off the public answer', async () => {
    const { c, s, res } = setup(fail)
    expect(await c.selfTest(res as never)).toEqual({
      status: 'failing',
      checkedAt: '2026-10-15T15:00:00.000Z',
    })
    expect(res.status).toHaveBeenCalledWith(503)
    // the reason is kept for the admin System status page
    expect((await s.check()).reason).toBe('The practice database could not be loaded.')
  })

  it('reuses an answer for five minutes, then checks again', async () => {
    const { s, measure, later } = setup(ok, fail)
    await s.check()
    later(GRADING_CHECK_TTL_MS - 1)
    expect((await s.check()).status).toBe('ok')
    expect(measure).toHaveBeenCalledTimes(1)
    later(1)
    expect((await s.check()).status).toBe('failing')
    expect(measure).toHaveBeenCalledTimes(2)
  })

  it('runs one check for callers who ask at the same time', async () => {
    const { s, measure } = setup(ok)
    await Promise.all([s.check(), s.check(), s.check()])
    expect(measure).toHaveBeenCalledTimes(1)
  })

  it('is not failing when every grading slot is busy, and reuses that answer for a minute only', async () => {
    const { c, s, measure, res, later } = setup(new SqlRunnerBusyError(), ok)
    expect((await c.selfTest(res as never)).status).toBe('busy')
    expect(res.status).not.toHaveBeenCalled()
    later(BUSY_CHECK_TTL_MS - 1)
    // a flood during a busy spell does not queue another check for a grading slot
    expect((await s.check()).status).toBe('busy')
    expect(measure).toHaveBeenCalledTimes(1)
    later(1)
    expect((await s.check()).status).toBe('ok')
    expect(measure).toHaveBeenCalledTimes(2)
  })

  it('fails early when grading memory is low, before answers start failing', async () => {
    const { c, s, res } = setup({ ok: true, error: null, peakMb: 1_700, limitMb: 2_048 })
    expect((await c.selfTest(res as never)).status).toBe('failing')
    expect(res.status).toHaveBeenCalledWith(503)
    expect((await s.check()).reason).toBe(
      'Grading memory is low: a process holds 1700 MB of its 2048 MB limit with the dataset loaded'
    )
  })

  it('reports a thrown error as failing', async () => {
    const { s } = setup(new Error('spawn EAGAIN'))
    expect(await s.check()).toMatchObject({ status: 'failing', reason: 'spawn EAGAIN' })
  })
})

describe('GET /health/grading/recent-failures', () => {
  it('is ok when no learner grading failed in the window', async () => {
    const { c, log, res } = setup()
    expect(await c.recentFailures(res as never)).toEqual({
      status: 'ok',
      failures: 0,
      windowMinutes: 15,
    })
    expect(res.status).not.toHaveBeenCalled()
    // from grading's rows of the failures table (so a deploy does not reset it)
    expect(log.recent).toHaveBeenCalledTimes(1)
  })

  it('answers 503 with the count when learners hit failures, keeping the reason off the public answer', async () => {
    const { c, log, res } = setup()
    log.recent.mockResolvedValue({
      status: 'failing',
      failures: 2,
      windowMinutes: 15,
      latest: {
        at: '2026-10-15T14:48:00.000Z',
        reason: 'The practice database could not be loaded.',
      },
    })
    expect(await c.recentFailures(res as never)).toEqual({
      status: 'failing',
      failures: 2,
      windowMinutes: 15,
    })
    expect(res.status).toHaveBeenCalledWith(503)
  })
})

describe('GradingHealthService.status (the Skill Simulator status port)', () => {
  it('gives the cached self-test with the failure history, under grading', async () => {
    const { s, log, measure } = setup(ok)
    await s.check()
    const perHour = new Array<number>(24).fill(0)
    perHour[18] = 3
    const history: FailureHistory<'infra' | 'busy'> = {
      failures: {
        windowHours: 24,
        count: 3,
        perHour,
        latest: [
          {
            at: '2026-10-15T09:30:00.000Z',
            reason: 'Grading is busy. Try again in a moment.',
            kind: 'busy',
          },
        ],
      },
      lastFailureAt: '2026-10-15T09:30:00.000Z',
    }
    log.history.mockResolvedValue(history)
    expect(await s.status()).toEqual({
      grading: {
        selfTest: {
          status: 'ok',
          reason: null,
          peakMb: 1_300,
          limitMb: 2_048,
          checkedAt: '2026-10-15T15:00:00.000Z',
        },
        ...history,
      },
    })
    // the cached self-test: no second check
    expect(measure).toHaveBeenCalledTimes(1)
  })

  it('carries a failing self-test with its reason', async () => {
    const { s } = setup(fail)
    const { grading } = await s.status()
    expect(grading.selfTest).toMatchObject({
      status: 'failing',
      reason: 'The practice database could not be loaded.',
    })
    expect(grading.lastFailureAt).toBeNull()
  })
})
