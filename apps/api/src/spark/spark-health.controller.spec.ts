import type { RecentFailures } from '../core/service-failure-log'
import type { FailureHistory, LessonFailureKind } from '../core/status-port'
import type { LessonFailureLog } from './lesson-failure-log'
import { SparkHealthController } from './spark-health.controller'
import { PLAYER_CHECK_TTL_MS, SparkHealthService } from './spark-health.service'
import type { SparkService } from './spark.service'

// Spark's health: lessons set up, the video player answering, lessons learners could not get (GitHub issue #92).

const ENV = ['NODE_ENV', 'SPARK_SESSION_SECRET', 'SPARK_WEB_URL'] as const
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]))
afterEach(() => {
  for (const k of ENV)
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
})

const quiet: FailureHistory<LessonFailureKind> = {
  failures: { windowHours: 24, count: 0, perHour: new Array<number>(24).fill(0), latest: [] },
  lastFailureAt: null,
}

function setup({ ai = true, url = 'https://spark.example.test/' as string | null } = {}) {
  if (url === null) delete process.env.SPARK_WEB_URL
  else process.env.SPARK_WEB_URL = url
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
  const spark = { aiConfigured: jest.fn(() => ai) }
  const s = new SparkHealthService(
    spark as unknown as SparkService,
    log as unknown as LessonFailureLog
  )
  const fetch = jest.fn<Promise<Response>, [string, RequestInit?]>(
    async () => new Response('<html></html>', { status: 200 })
  )
  s.fetch = fetch as unknown as typeof globalThis.fetch
  let t = Date.UTC(2026, 9, 15, 15, 0)
  s.now = () => t
  jest.spyOn(s['logger'], 'error').mockImplementation(() => undefined)
  const c = new SparkHealthController(s)
  const res = { status: jest.fn() }
  return { s, c, log, spark, fetch, res, later: (ms: number) => (t += ms) }
}

describe('SparkHealthService.setup ("Videos are set up")', () => {
  it('is ok when the AI client is configured, and needs nothing else outside production', () => {
    process.env.NODE_ENV = 'test'
    delete process.env.SPARK_SESSION_SECRET
    const { s, fetch } = setup({ url: null })
    expect(s.setup()).toEqual({ status: 'ok', problems: [] })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails when the AI service is not configured', () => {
    process.env.NODE_ENV = 'test'
    const { s } = setup({ ai: false })
    expect(s.setup()).toEqual({
      status: 'failing',
      problems: ['The AI service that writes lessons is not configured (ANTHROPIC_API_KEY).'],
    })
  })

  it('in production, also needs a real link secret and the player address, without throwing', () => {
    process.env.NODE_ENV = 'production'
    process.env.SPARK_SESSION_SECRET = 'replace_with_a_long_random_string'
    const { s } = setup({ url: null })
    expect(s.setup()).toEqual({
      status: 'failing',
      problems: [
        'The secret that signs video links (SPARK_SESSION_SECRET) is not set.',
        'The video player’s web address (SPARK_WEB_URL) is not set.',
      ],
    })
    process.env.SPARK_SESSION_SECRET = 'configured'
    process.env.SPARK_WEB_URL = 'https://spark.example.test'
    expect(s.setup()).toEqual({ status: 'ok', problems: [] })
  })
})

describe('SparkHealthService.player ("Video player")', () => {
  it("asks the player's lesson page and is ok when it answers", async () => {
    const { s, fetch } = setup()
    expect(await s.player()).toEqual({
      status: 'ok',
      reason: null,
      checkedAt: '2026-10-15T15:00:00.000Z',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://spark.example.test/lesson')
    expect(init.method).toBe('GET')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('is not set up, with no call, in production with no player address', async () => {
    const { s, fetch } = setup({ url: null })
    process.env.NODE_ENV = 'production'
    expect(await s.player()).toMatchObject({ status: 'not-set-up', reason: null })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('checks the local player when no address is set outside production, as lesson links do', async () => {
    const { s, fetch } = setup({ url: null })
    process.env.NODE_ENV = 'test'
    expect((await s.player()).status).toBe('ok')
    expect(String(fetch.mock.calls[0][0])).toBe('http://localhost:5175/lesson')
  })

  it('fails with the status when the player answers with an error', async () => {
    const { s, fetch } = setup()
    fetch.mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
    expect(await s.player()).toMatchObject({
      status: 'failing',
      reason: 'The video player answered 502.',
    })
  })

  it('fails when the player cannot be reached', async () => {
    const { s, fetch } = setup()
    fetch.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect(await s.player()).toMatchObject({
      status: 'failing',
      reason: 'Could not reach the video player: fetch failed',
    })
  })

  it('fails when the player does not answer in time', async () => {
    const { s, fetch } = setup()
    s.timeoutMs = 20
    // a player that never answers: only the timeout's abort ends the request
    fetch.mockImplementationOnce(
      (_url: unknown, init: unknown) =>
        new Promise((_resolve, reject) =>
          (init as RequestInit).signal!.addEventListener('abort', () =>
            reject((init as RequestInit).signal!.reason)
          )
        ) as never
    )
    expect(await s.player()).toMatchObject({
      status: 'failing',
      reason: 'The video player did not answer within 0.02 seconds.',
    })
  })

  it('reuses an answer for five minutes, then checks again', async () => {
    const { s, fetch, later } = setup()
    await s.player()
    later(PLAYER_CHECK_TTL_MS - 1)
    fetch.mockResolvedValueOnce(new Response('', { status: 500 }))
    expect((await s.player()).status).toBe('ok')
    expect(fetch).toHaveBeenCalledTimes(1)
    later(1)
    expect((await s.player()).status).toBe('failing')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('runs one check for callers who ask at the same time', async () => {
    const { s, fetch } = setup()
    await Promise.all([s.player(), s.player(), s.player()])
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('GET /health/videos/setup', () => {
  it('is ok, saying only that and when, when lessons are set up and the player answers', async () => {
    const { c, res } = setup()
    expect(await c.setup(res as never)).toEqual({
      status: 'ok',
      checkedAt: '2026-10-15T15:00:00.000Z',
    })
    expect(res.status).not.toHaveBeenCalled()
  })

  it('answers 503 when the AI service is not configured, keeping the reason off', async () => {
    const { c, res } = setup({ ai: false })
    expect(await c.setup(res as never)).toEqual({
      status: 'failing',
      checkedAt: '2026-10-15T15:00:00.000Z',
    })
    expect(res.status).toHaveBeenCalledWith(503)
  })

  it('answers 503 when the player fails or is not set up', async () => {
    const failing = setup()
    failing.fetch.mockResolvedValueOnce(new Response('', { status: 404 }))
    expect((await failing.c.setup(failing.res as never)).status).toBe('failing')
    expect(failing.res.status).toHaveBeenCalledWith(503)
    const none = setup({ url: null })
    process.env.NODE_ENV = 'production'
    expect((await none.c.setup(none.res as never)).status).toBe('failing')
    expect(none.res.status).toHaveBeenCalledWith(503)
  })
})

describe('GET /health/videos/recent-failures', () => {
  it('is ok when no learner missed a lesson in the window', async () => {
    const { c, log, res } = setup()
    expect(await c.recentFailures(res as never)).toEqual({
      status: 'ok',
      failures: 0,
      windowMinutes: 15,
    })
    expect(res.status).not.toHaveBeenCalled()
    expect(log.recent).toHaveBeenCalledTimes(1)
  })

  it('answers 503 with the count, keeping the reason off', async () => {
    const { c, log, res } = setup()
    log.recent.mockResolvedValue({
      status: 'failing',
      failures: 3,
      windowMinutes: 15,
      latest: { at: '2026-10-15T14:58:00.000Z', reason: 'Could not write that lesson. Try again.' },
    })
    expect(await c.recentFailures(res as never)).toEqual({
      status: 'failing',
      failures: 3,
      windowMinutes: 15,
    })
    expect(res.status).toHaveBeenCalledWith(503)
  })
})

describe('SparkHealthService.status (the Spark status port)', () => {
  it('gives the setup, the cached player check and the lesson failure history', async () => {
    process.env.NODE_ENV = 'test'
    const { s, fetch, log } = setup()
    await s.player()
    const history: FailureHistory<LessonFailureKind> = {
      failures: {
        windowHours: 24,
        count: 1,
        perHour: [...new Array<number>(23).fill(0), 1],
        latest: [
          {
            at: '2026-10-15T14:58:00.000Z',
            reason: 'Could not write that lesson. Try again.',
            kind: 'no-lesson',
          },
        ],
      },
      lastFailureAt: '2026-10-15T14:58:00.000Z',
    }
    log.history.mockResolvedValue(history)
    expect(await s.status()).toEqual({
      setup: { status: 'ok', problems: [] },
      player: { status: 'ok', reason: null, checkedAt: '2026-10-15T15:00:00.000Z' },
      lessons: history,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
