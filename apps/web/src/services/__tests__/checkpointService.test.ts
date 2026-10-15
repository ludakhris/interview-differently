import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerLtiTokenGetter } from '../authToken'
import {
  CheckpointError,
  fetchSimulations,
  isSessionEnded,
  isUnavailable,
  ltiCheckpointClient as lti,
  standaloneCheckpointClient,
  startSimulation,
} from '../checkpointService'

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }))

describe('the checkpoint API client', () => {
  beforeEach(() => registerLtiTokenGetter(() => 'lti.abc'))
  afterEach(() => {
    registerLtiTokenGetter(null)
    vi.unstubAllGlobals()
  })

  it('reads the checkpoint with the LTI session as the credential', async () => {
    const fetchMock = reply(200, { deliveryId: 'd1' })
    vi.stubGlobal('fetch', fetchMock)
    expect(await lti.view()).toEqual({ deliveryId: 'd1' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/lti\/tool\/checkpoint$/)
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer lti.abc')
  })

  it.each([
    ['run', () => lti.run('select 1', 'q1'), '/run', { ref: 'q1', sql: 'select 1' }],
    ['answer', () => lti.answer({ ref: 'q1', pass: true }), '/answer', { ref: 'q1', pass: true }],
    [
      'help',
      () => lti.help('q1', 'select', 'hint'),
      '/help',
      { ref: 'q1', sql: 'select', kind: 'hint' },
    ],
    ['practice', () => lti.practice(), '/practice', undefined],
  ] as const)('posts %s', async (_name, send, path, body) => {
    const fetchMock = reply(200, {})
    vi.stubGlobal('fetch', fetchMock)
    await send()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(new RegExp(`/api/lti/tool/checkpoint${path}$`))
    expect(init.method).toBe('POST')
    expect(init.body === undefined ? undefined : JSON.parse(init.body as string)).toEqual(body)
  })

  it('tells an ended session and unavailable grading apart from other refusals', async () => {
    vi.stubGlobal('fetch', reply(503, { message: 'Grading is down' }))
    const down = await lti.run('select 1').catch((e: unknown) => e)
    expect(down).toBeInstanceOf(CheckpointError)
    expect((down as CheckpointError).message).toBe('Grading is down')
    expect(isUnavailable(down)).toBe(true)
    expect(isSessionEnded(down)).toBe(false)

    vi.stubGlobal('fetch', reply(401, { message: 'Session expired' }))
    const ended = await lti.view().catch((e: unknown) => e)
    expect(isSessionEnded(ended)).toBe(true)

    vi.stubGlobal('fetch', reply(400, {}))
    const bad = await lti.run('').catch((e: unknown) => e)
    expect((bad as CheckpointError).message).toBe('Request failed (400)')
    expect(isSessionEnded(bad) || isUnavailable(bad)).toBe(false)
  })

  it('says when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    const e = await lti.view().catch((err: unknown) => err)
    expect((e as CheckpointError).status).toBe(0)
  })
})

describe('the standalone client (a work simulation in Interview Differently)', () => {
  // An LTI session in the same tab must never stand in for the signed-in learner.
  beforeEach(() => registerLtiTokenGetter(() => 'lti.abc'))
  afterEach(() => {
    registerLtiTokenGetter(null)
    vi.unstubAllGlobals()
  })

  it("uses the learner's Clerk token on their delivery's routes", async () => {
    const fetchMock = reply(200, {})
    vi.stubGlobal('fetch', fetchMock)
    const client = standaloneCheckpointClient('d/1', async () => 'clerk.xyz')
    await client.view()
    await client.answer({ ref: 'q1', sql: 'select 1' })
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0]![0]).toMatch(/\/api\/me\/checkpoints\/d%2F1$/)
    expect(calls[1]![0]).toMatch(/\/api\/me\/checkpoints\/d%2F1\/answer$/)
    for (const [, init] of calls)
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer clerk.xyz')
  })

  it('ends the page without calling the API when the learner is signed out', async () => {
    const fetchMock = reply(200, {})
    vi.stubGlobal('fetch', fetchMock)
    const e = await standaloneCheckpointClient('d1', async () => null)
      .view()
      .catch((err: unknown) => err)
    expect(isSessionEnded(e)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lists and starts simulations', async () => {
    const fetchMock = reply(200, { deliveryId: 'd1' })
    vi.stubGlobal('fetch', fetchMock)
    await fetchSimulations(async () => 'clerk.xyz')
    expect(await startSimulation(async () => 'clerk.xyz', 'orders')).toEqual({ deliveryId: 'd1' })
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0]![0]).toMatch(/\/api\/me\/checkpoints$/)
    expect(calls[0]![1].method).toBe('GET')
    expect(calls[1]![1].method).toBe('POST')
    expect(JSON.parse(calls[1]![1].body as string)).toEqual({ bankSlug: 'orders' })
  })
})
