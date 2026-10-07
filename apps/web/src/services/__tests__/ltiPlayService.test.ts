import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerLtiTokenGetter } from '../authToken'
import { fetchPlay, ltiPlayGrader, onPlayConflict, PlayError } from '../ltiPlayService'

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }))

describe('the launched-play API client', () => {
  beforeEach(() => registerLtiTokenGetter(() => 'lti.abc'))
  afterEach(() => {
    registerLtiTokenGetter(null)
    vi.unstubAllGlobals()
  })

  it('reads where the play stands, with the LTI session as the credential', async () => {
    const fetchMock = reply(200, {
      node: 'n1',
      done: false,
      choices: {},
      quant: {},
      sql: {},
      hints: [],
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchPlay()).toMatchObject({ node: 'n1', done: false })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/lti\/tool\/play$/)
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer lti.abc')
  })

  it.each([
    ['choose', () => ltiPlayGrader.choose('n1', 'A'), '/choice', { nodeId: 'n1', choiceId: 'A' }],
    [
      'quant',
      () => ltiPlayGrader.quant('n2', { value: 5 }),
      '/quant',
      { nodeId: 'n2', answer: { value: 5 } },
    ],
    ['sql', () => ltiPlayGrader.sql('n3', 'select 1'), '/sql', { nodeId: 'n3', sql: 'select 1' }],
    ['hint', () => ltiPlayGrader.hint('n2'), '/hint', { nodeId: 'n2' }],
  ])('posts a %s answer and nothing else', async (_n, run, path, body) => {
    const fetchMock = reply(201, { next: 'n2', done: false })
    vi.stubGlobal('fetch', fetchMock)
    await run()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(new RegExp(`/api/lti/tool/play${path}$`))
    expect(init.method).toBe('POST')
    // no score, no verdict: only what the learner chose or typed
    expect(JSON.parse(init.body as string)).toEqual(body)
  })

  it('turns a refusal into an error with the server message and status', async () => {
    vi.stubGlobal('fetch', reply(409, { message: 'That question is not the current one' }))
    await expect(ltiPlayGrader.choose('n1', 'A')).rejects.toMatchObject({
      status: 409,
      message: 'That question is not the current one',
    })
    await expect(ltiPlayGrader.choose('n1', 'A')).rejects.toBeInstanceOf(PlayError)
  })

  it('has a plain message when the reply is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>', { status: 502 }))
    )
    await expect(fetchPlay()).rejects.toMatchObject({
      status: 502,
      message: 'Request failed (502)',
    })
  })

  it('says so plainly when the server cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )
    await expect(ltiPlayGrader.choose('n1', 'A')).rejects.toMatchObject({
      status: 0,
      message: 'Could not reach the server. Check your connection and try again.',
    })
  })

  it('tells the player when the server says the play has moved on (409), and only then', async () => {
    const listener = vi.fn()
    const off = onPlayConflict(listener)
    vi.stubGlobal('fetch', reply(409, { message: 'That question is not the current one' }))
    await expect(ltiPlayGrader.choose('n1', 'A')).rejects.toBeInstanceOf(PlayError)
    expect(listener).toHaveBeenCalledTimes(1)
    vi.stubGlobal('fetch', reply(400, { message: 'bad' }))
    await expect(ltiPlayGrader.choose('n1', 'A')).rejects.toBeInstanceOf(PlayError)
    expect(listener).toHaveBeenCalledTimes(1)
    off()
    vi.stubGlobal('fetch', reply(409, { message: 'x' }))
    await expect(ltiPlayGrader.choose('n1', 'A')).rejects.toBeInstanceOf(PlayError)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
