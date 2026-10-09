import {
  BRAND_CLAIM,
  CLAIM,
  AGS_SCOPE_SCORE,
  DIMENSIONS_FIELD,
  SCORE_CONTENT_TYPE,
  generateKeyPair,
  jwksOf,
  signJwt,
  verifyJwt,
  LEARNER_ROLE,
} from '../lti-spec'
import { MemoryLtiStore } from '../lti-store'
import { LtiToolService } from './lti-tool.service'
import { PlatformRegistryService } from './platform-registry.service'
import { signSession, sqlDatasetSlugs, verifySession, type LtiSession } from './lti-session'

/** Loose shape for hand-rolled Prisma fakes whose args the tests index freely. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

const BASE = 'http://api.test/api'
const ISS = 'http://api.test'
const LINEITEM = `${BASE}/lti/platform/ags/c1/lineitems/i1`

const platformKeys = generateKeyPair()
const otherKeys = generateKeyPair()

const scenario = (questions: string[]) => ({
  scenarioId: 'S1',
  status: 'published',
  data: {
    mode: 'immersive',
    briefing: { role: 'Analyst' },
    nodes: questions.map((q) => ({ responsePrompt: q })),
    rubric: {
      dimensions: [
        { name: 'Clarity', description: 'd' },
        { name: 'Depth', description: 'd' },
      ],
    },
  },
})

function setup(questions = ['Tell me about a time you led.', 'Why this role?']) {
  const prisma = {
    scenario: { findUnique: jest.fn().mockResolvedValue(scenario(questions)) },
    simulationResult: { findUnique: jest.fn() },
    immersiveSession: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  }
  const store = new MemoryLtiStore()
  const engine = { scoreAnswers: jest.fn() }
  const registry = new PlatformRegistryService({
    ltiPlatform: { findMany: async () => [] },
  } as never)
  const svc = new LtiToolService(prisma as never, engine as never, store, registry)
  const calls: { url: string; init?: RequestInit }[] = []
  let scoreStatus = 200
  let tokenStatus = 200
  svc.fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url.endsWith('/jwks')) return new Response(JSON.stringify(jwksOf(platformKeys)))
    if (url.endsWith('/token')) {
      return new Response(JSON.stringify({ access_token: 'AT' }), { status: tokenStatus })
    }
    return new Response('{}', { status: scoreStatus })
  }) as never
  return {
    svc,
    store,
    registry,
    prisma,
    engine,
    calls,
    setScoreStatus: (s: number) => (scoreStatus = s),
    setTokenStatus: (s: number) => (tokenStatus = s),
  }
}

function loginParams(extra = {}) {
  return { iss: ISS, client_id: 'ld-platform', login_hint: 'u1', lti_message_hint: 'mh', ...extra }
}

/** Moves the tool's clock and its store's clock together. */
function setNow(h: { svc: LtiToolService; store: MemoryLtiStore }, ms: number) {
  h.svc.now = () => ms
  h.store.now = () => ms
}

async function startLogin(svc: LtiToolService) {
  const url = new URL((await svc.login(loginParams())).url)
  return { state: url.searchParams.get('state')!, nonce: url.searchParams.get('nonce')!, url }
}

function idToken(nonce: string, over: Record<string, unknown> = {}, key = platformKeys) {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      iss: ISS,
      aud: 'ld-platform',
      sub: 'u1',
      nonce,
      iat: now,
      exp: now + 300,
      [CLAIM.messageType]: 'LtiResourceLinkRequest',
      [CLAIM.version]: '1.3.0',
      [CLAIM.deploymentId]: '1',
      [CLAIM.roles]: [LEARNER_ROLE],
      [CLAIM.custom]: { ref: 'S1' },
      [CLAIM.agsEndpoint]: { scope: [AGS_SCOPE_SCORE], lineitem: LINEITEM },
      ...over,
    },
    key
  )
}

const submissionOf = (page: string | { redirect: string }) => {
  if (typeof page !== 'string') throw new Error(`expected the typed page, got ${page.redirect}`)
  return /name="submission" value="([^"]+)"/.exec(page)![1]
}

async function launchAgain(svc: LtiToolService) {
  const { state, nonce } = await startLogin(svc)
  return svc.launch(idToken(nonce), state, state)
}

async function launched(h = setup()) {
  const { state, nonce } = await startLogin(h.svc)
  const html = await h.svc.launch(idToken(nonce), state, state)
  return { ...h, html, submission: submissionOf(html) }
}

beforeEach(() => {
  process.env.LTI_API_BASE = BASE
  process.env.LTI_TOOL_SCORING = 'stub'
  process.env.LTI_RETURN_URL = 'http://return.test'
  process.env.LTI_LEARN_URL = 'http://learn.test'
  for (const k of [
    'LTI_PLATFORM_ISSUER',
    'LTI_TOOL_PRIVATE_KEY',
    'LTI_TOOL_PREVIOUS_PRIVATE_KEY',
    'LTI_TOOL_SECRET',
  ])
    delete process.env[k]
})

describe('keys and secrets', () => {
  const env = process.env
  afterEach(() => {
    process.env = env
  })

  it('refuses to boot in production without the LTI keys and secrets', () => {
    process.env = { ...env, NODE_ENV: 'production' }
    for (const k of [
      'LTI_PLATFORM_PRIVATE_KEY',
      'LTI_TOOL_PRIVATE_KEY',
      'LTI_TOOL_SECRET',
      'LTI_HINT_SECRET',
    ])
      delete process.env[k]
    expect(() => setup()).toThrow('LTI_TOOL_SECRET')
  })

  it('publishes the previous key beside the current one and signs with the current one', async () => {
    const previous = generateKeyPair()
    const current = generateKeyPair()
    process.env.LTI_TOOL_PRIVATE_KEY = current.privateKeyPem
    process.env.LTI_TOOL_PREVIOUS_PRIVATE_KEY = previous.privateKeyPem
    const h = await launched()
    const { keys } = h.svc.jwks()
    expect(keys.map((k) => k.kid)).toEqual([current.kid, previous.kid])
    expect(JSON.stringify(keys)).not.toContain('"d"')
    // a token signed with the previous key still verifies against the published set
    const old = signJwt({ iss: 'x', aud: 'y', exp: Math.floor(Date.now() / 1000) + 60 }, previous)
    await expect(
      verifyJwt(old, {
        issuer: 'x',
        audience: 'y',
        keyFor: async (kid) => keys.find((k) => k.kid === kid),
      })
    ).resolves.toBeTruthy()
    // new tokens use the new kid
    await h.svc.submit({
      submission: h.submission,
      answer_0: 'x'.repeat(250),
      answer_1: 'x'.repeat(250),
    })
    const form = new URLSearchParams(
      h.calls.find((c) => c.url.endsWith('/token'))!.init!.body as URLSearchParams
    )
    const kid = JSON.parse(
      Buffer.from(form.get('client_assertion')!.split('.')[0], 'base64url').toString()
    ).kid
    expect(kid).toBe(current.kid)
  })
})

describe('login', () => {
  it('redirects to the platform auth URL with OIDC params', async () => {
    const { svc } = setup()
    const { url, state, nonce } = await startLogin(svc)
    expect(url.origin + url.pathname).toBe(`${BASE}/lti/platform/auth`)
    const q = url.searchParams
    expect(q.get('scope')).toBe('openid')
    expect(q.get('response_type')).toBe('id_token')
    expect(q.get('client_id')).toBe('ld-platform')
    expect(q.get('redirect_uri')).toBe(`${BASE}/lti/tool/launch`)
    expect(q.get('login_hint')).toBe('u1')
    expect(q.get('lti_message_hint')).toBe('mh')
    expect(q.get('response_mode')).toBe('form_post')
    expect(q.get('prompt')).toBe('none')
    expect(state).toBeTruthy()
    expect(nonce).toBeTruthy()
    expect(state).not.toBe(nonce)
  })

  it('rejects an unknown issuer or client', async () => {
    const { svc } = setup()
    await expect(svc.login(loginParams({ iss: 'http://evil' }))).rejects.toThrow('Unknown platform')
    await expect(svc.login(loginParams({ client_id: 'x' }))).rejects.toThrow('Unknown platform')
  })

  it('requires a login_hint and an lti_message_hint', async () => {
    const { svc } = setup()
    await expect(svc.login(loginParams({ login_hint: '' }))).rejects.toThrow('login_hint')
    await expect(svc.login(loginParams({ lti_message_hint: '' }))).rejects.toThrow(
      'lti_message_hint'
    )
    await expect(svc.login(loginParams({ lti_message_hint: undefined }))).rejects.toThrow(
      'lti_message_hint'
    )
  })

  it('returns the state it stored, for the cookie', async () => {
    const { svc } = setup()
    const { url, state } = await svc.login(loginParams())
    expect(new URL(url).searchParams.get('state')).toBe(state)
  })

  it('keeps the login state in the shared store for 10 minutes', async () => {
    const h = setup()
    const { state, nonce } = await startLogin(h.svc)
    expect(await h.store.peek('lti-login', state)).toEqual({ nonce, platformId: 'built-in' })
    const t = Date.now()
    setNow(h, t + 9 * 60_000)
    expect(await h.store.peek('lti-login', state)).toEqual({ nonce, platformId: 'built-in' })
    setNow(h, t + 11 * 60_000)
    expect(await h.store.peek('lti-login', state)).toBeNull()
  })

  it('answers more than 30 logins a minute from one IP with a 429, and counts IPs separately', async () => {
    const h = setup()
    for (let i = 0; i < 30; i++) await h.svc.login(loginParams(), '1.1.1.1')
    await expect(h.svc.login(loginParams(), '1.1.1.1')).rejects.toMatchObject({ status: 429 })
    await expect(h.svc.login(loginParams(), '2.2.2.2')).resolves.toBeTruthy()
    setNow(h, Date.now() + 61_000)
    await expect(h.svc.login(loginParams(), '1.1.1.1')).resolves.toBeTruthy()
  })

  it('serves the public key at jwks', () => {
    const { svc } = setup()
    expect(svc.jwks().keys).toHaveLength(1)
    expect(JSON.stringify(svc.jwks())).not.toContain('"d"')
  })
})

describe('launch', () => {
  it('renders the questions for the ref', async () => {
    const { html, prisma } = await launched()
    expect(prisma.scenario.findUnique).toHaveBeenCalledWith({ where: { scenarioId: 'S1' } })
    expect(html).toContain('Tell me about a time you led.')
    expect(html).toContain('name="answer_1"')
    expect(html).toContain('maxlength="2000"')
    expect(html).toContain('action="http://api.test/api/lti/tool/submit"')
  })

  it('escapes dynamic values', async () => {
    const { html } = await launched(setup(['<script>alert(1)</script> "q"']))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&#60;script&#62;alert(1)&#60;/script&#62;')
  })

  it('rejects unknown state', async () => {
    const { svc } = setup()
    const { nonce } = await startLogin(svc)
    await expect(svc.launch(idToken(nonce), 'nope', 'nope')).rejects.toThrow(
      'Unknown or expired state'
    )
    await expect(svc.launch(idToken(nonce), undefined, undefined)).rejects.toThrow('state')
  })

  it('rejects a launch whose lti_state cookie is missing or belongs to another state', async () => {
    const h = setup()
    const { state, nonce } = await startLogin(h.svc)
    const other = await startLogin(h.svc)
    await expect(h.svc.launch(idToken(nonce), state, undefined)).rejects.toThrow('state')
    await expect(h.svc.launch(idToken(nonce), state, other.state)).rejects.toThrow('state')
    // the refused attempts did not burn the state: the right browser can still finish
    expect(await h.svc.launch(idToken(nonce), state, state)).toContain('name="submission"')
  })

  it('rejects a score endpoint that is not on the platform origin', async () => {
    const h = setup()
    const { state, nonce } = await startLogin(h.svc)
    const lineitem = 'http://evil.test/api/lti/platform/ags/c1/lineitems/i1'
    await expect(
      h.svc.launch(
        idToken(nonce, { [CLAIM.agsEndpoint]: { scope: [AGS_SCOPE_SCORE], lineitem } }),
        state,
        state
      )
    ).rejects.toThrow('Score endpoint')
  })

  it('rejects a reused state', async () => {
    const h = setup()
    const { state, nonce } = await startLogin(h.svc)
    await h.svc.launch(idToken(nonce), state, state)
    await expect(h.svc.launch(idToken(nonce), state, state)).rejects.toThrow('state')
  })

  it('rejects an expired state', async () => {
    const h = setup()
    const { state, nonce } = await startLogin(h.svc)
    setNow(h, Date.now() + 11 * 60_000)
    await expect(h.svc.launch(idToken(nonce), state, state)).rejects.toThrow('state')
  })

  const reject = async (token: (nonce: string) => string, msg: string) => {
    const h = setup()
    const { state, nonce } = await startLogin(h.svc)
    await expect(h.svc.launch(token(nonce), state, state)).rejects.toThrow(msg)
  }

  it('rejects a bad signature', () =>
    reject((n) => idToken(n, {}, { ...otherKeys, kid: platformKeys.kid }), 'Bad signature'))
  it('rejects an unknown signing key', () =>
    reject((n) => idToken(n, {}, otherKeys), 'Unknown signing key'))
  it('rejects a wrong issuer', () => reject((n) => idToken(n, { iss: 'http://evil' }), 'issuer'))
  it('rejects a wrong audience', () => reject((n) => idToken(n, { aud: 'other' }), 'audience'))
  it('rejects a wrong nonce', () => reject(() => idToken('other'), 'Nonce'))
  it('rejects an expired token', () =>
    reject((n) => idToken(n, { exp: Math.floor(Date.now() / 1000) - 3600 }), 'expired'))
  it('rejects a wrong message_type', () =>
    reject((n) => idToken(n, { [CLAIM.messageType]: 'LtiDeepLinkingRequest' }), 'message_type'))
  it('rejects a wrong version', () =>
    reject((n) => idToken(n, { [CLAIM.version]: '1.1' }), 'version'))
  it('rejects a wrong deployment', () =>
    reject((n) => idToken(n, { [CLAIM.deploymentId]: '9' }), 'deployment'))
  it('rejects a launch without a score endpoint', () =>
    reject((n) => idToken(n, { [CLAIM.agsEndpoint]: undefined }), 'score'))
  it('rejects a launch without ref', () => reject((n) => idToken(n, { [CLAIM.custom]: {} }), 'ref'))

  it.each([['draft'], [undefined]])(
    'refuses a scenario with status %p, typed or text',
    async (status) => {
      for (const mode of ['immersive', 'text']) {
        const h = setup()
        const row = scenario([])
        h.prisma.scenario.findUnique.mockResolvedValue({
          ...row,
          status,
          data: { ...row.data, mode },
        })
        const { state, nonce } = await startLogin(h.svc)
        await expect(h.svc.launch(idToken(nonce), state, state)).rejects.toMatchObject({
          status: 404,
          message: 'Interview not found',
        })
      }
    }
  )

  it('404s when the scenario does not exist', async () => {
    const h = setup()
    h.prisma.scenario.findUnique.mockResolvedValue(null)
    const { state, nonce } = await startLogin(h.svc)
    await expect(h.svc.launch(idToken(nonce), state, state)).rejects.toThrow('Interview not found')
  })
})

describe('submit', () => {
  const long = 'x'.repeat(250)

  it('scores, posts the score to the lineitem and renders the result', async () => {
    const { svc, submission, calls } = await launched()
    const { status, html } = await svc.submit({ submission, answer_0: long, answer_1: long })
    expect(status).toBe(200)
    expect(html).toContain('Overall score: <strong>70</strong>')
    expect(html).toContain('Clarity: 70')
    expect(html).toContain('href="http://return.test"')

    const token = calls.find((c) => c.url.endsWith('/token'))!
    expect(token.url).toBe(`${BASE}/lti/platform/token`)
    const form = new URLSearchParams(token.init!.body as URLSearchParams)
    expect(form.get('grant_type')).toBe('client_credentials')
    expect(form.get('scope')).toBe(AGS_SCOPE_SCORE)
    const assertion = await verifyJwt(form.get('client_assertion')!, {
      issuer: 'ld-platform',
      audience: `${BASE}/lti/platform/token`,
      keyFor: async (kid) => svc.jwks().keys.find((k) => k.kid === kid),
    })
    expect(assertion.sub).toBe('ld-platform')
    expect(assertion.jti).toBeTruthy()
    expect(assertion.exp - assertion.iat).toBe(300)

    const post = calls.find((c) => c.url === `${LINEITEM}/scores`)!
    const headers = post.init!.headers as Record<string, string>
    expect(headers['Content-Type']).toBe(SCORE_CONTENT_TYPE)
    expect(headers.Authorization).toBe('Bearer AT')
    const body = JSON.parse(post.init!.body as string)
    expect(body).toMatchObject({
      userId: 'u1',
      scoreGiven: 70,
      scoreMaximum: 100,
      activityProgress: 'Completed',
      gradingProgress: 'FullyGraded',
      [DIMENSIONS_FIELD]: [
        { dimension: 'Clarity', score: 70 },
        { dimension: 'Depth', score: 70 },
      ],
    })
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date')
  })

  it('uses a fresh jti per assertion', async () => {
    const { svc, submission, calls } = await launched()
    await svc.submit({ submission, answer_0: long, answer_1: long })
    const again = submissionOf(await launchAgain(svc))
    await svc.submit({ submission: again, answer_0: long, answer_1: long })
    const jtis = calls
      .filter((c) => c.url.endsWith('/token'))
      .map((c) => new URLSearchParams(c.init!.body as URLSearchParams).get('client_assertion')!)
      .map((j) => JSON.parse(Buffer.from(j.split('.')[1], 'base64url').toString()).jti)
    expect(new Set(jtis).size).toBe(2)
  })

  it('accepts a submission token once, and answers a reuse with a 409 without scoring again', async () => {
    const { svc, submission, calls } = await launched()
    const answers = { submission, answer_0: long, answer_1: long }
    expect((await svc.submit(answers)).status).toBe(200)
    const posts = () => calls.filter((c) => c.url.endsWith('/scores')).length
    expect(posts()).toBe(1)
    await expect(svc.submit(answers)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('already submitted'),
    })
    expect(posts()).toBe(1)
  })

  it('keeps the token usable when the score post fails, so the learner can retry', async () => {
    const h = await launched()
    const answers = { submission: h.submission, answer_0: long, answer_1: long }
    h.setScoreStatus(500)
    expect((await h.svc.submit(answers)).status).toBe(502)
    h.setScoreStatus(200)
    expect((await h.svc.submit(answers)).status).toBe(200)
    await expect(h.svc.submit(answers)).rejects.toMatchObject({ status: 409 })
  })

  it('refuses a second submit while the first is still being scored', async () => {
    const h = await launched()
    const answers = { submission: h.submission, answer_0: long, answer_1: long }
    const [a, b] = await Promise.allSettled([h.svc.submit(answers), h.svc.submit(answers)])
    const outcomes = [a, b].map((r) =>
      r.status === 'fulfilled' ? r.value.status : (r.reason as { status: number }).status
    )
    expect(outcomes.sort()).toEqual([200, 409])
    expect(h.calls.filter((c) => c.url.endsWith('/scores'))).toHaveLength(1)
  })

  it('keeps a consumed token for as long as the token could be presented, then forgets it', async () => {
    const h = await launched()
    const answers = { submission: h.submission, answer_0: long, answer_1: long }
    await h.svc.submit(answers)
    const jti = JSON.parse(Buffer.from(h.submission.split('.')[0], 'base64url').toString()).jti
    expect(await h.store.peek('lti-submission', jti)).toBe(true)
    setNow(h, Date.now() + 32 * 60_000)
    expect(await h.store.peek('lti-submission', jti)).toBeNull()
  })

  it('releases the lock when validation fails before anything is posted', async () => {
    const { svc, submission, calls } = await launched()
    await expect(svc.submit({ submission, answer_0: 'a' })).rejects.toThrow('Answer every question')
    expect((await svc.submit({ submission, answer_0: long, answer_1: long })).status).toBe(200)
    expect(calls.filter((c) => c.url.endsWith('/scores'))).toHaveLength(1)
  })

  it('is safe across instances: a token spent on one instance is refused on another', async () => {
    process.env.LTI_TOOL_SECRET = 'shared-secret'
    const h = setup()
    const other = new LtiToolService(
      h.prisma as never,
      { scoreAnswers: jest.fn() } as never,
      h.store,
      h.registry
    )
    other.fetchImpl = h.svc.fetchImpl
    const html = await launchAgain(h.svc)
    const answers = { submission: submissionOf(html), answer_0: long, answer_1: long }
    expect((await other.submit(answers)).status).toBe(200)
    await expect(h.svc.submit(answers)).rejects.toMatchObject({ status: 409 })
    // and login state written by one instance is consumed once across both
    const { state, nonce } = await startLogin(other)
    await h.svc.launch(idToken(nonce), state, state)
    await expect(other.launch(idToken(nonce), state, state)).rejects.toThrow('state')
  })

  it('answers more than 10 submissions a minute from one learner with a 429', async () => {
    const h = await launched()
    const answers = { submission: h.submission, answer_0: long, answer_1: long }
    expect((await h.svc.submit(answers)).status).toBe(200)
    for (let i = 0; i < 9; i++)
      await expect(h.svc.submit(answers)).rejects.toMatchObject({ status: 409 })
    await expect(h.svc.submit(answers)).rejects.toMatchObject({ status: 429 })
  })

  it('scores by length band', async () => {
    const { svc, submission } = await launched()
    const { html } = await svc.submit({ submission, answer_0: 'short', answer_1: long })
    expect(html).toContain('Overall score: <strong>45</strong>')
  })

  it('rejects a tampered token', async () => {
    const { svc, submission } = await launched()
    const [body, sig] = submission.split('.')
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), sub: 'u2' })
    ).toString('base64url')
    await expect(
      svc.submit({ submission: `${forged}.${sig}`, answer_0: 'a', answer_1: 'b' })
    ).rejects.toThrow('Invalid submission token')
    await expect(svc.submit({ answer_0: 'a', answer_1: 'b' })).rejects.toThrow(
      'Invalid submission token'
    )
  })

  it('rejects an expired token', async () => {
    const { svc, submission } = await launched()
    svc.now = () => Date.now() + 31 * 60_000
    await expect(svc.submit({ submission, answer_0: 'a', answer_1: 'b' })).rejects.toThrow(
      'expired'
    )
  })

  it('rejects blank and over-long answers', async () => {
    const { svc, submission } = await launched()
    await expect(svc.submit({ submission, answer_0: 'a' })).rejects.toThrow('Answer every question')
    await expect(
      svc.submit({ submission, answer_0: 'a', answer_1: 'y'.repeat(2001) })
    ).rejects.toThrow('under 2000')
  })

  it('shows an error and no success when the platform rejects the score', async () => {
    const h = await launched()
    h.setScoreStatus(403)
    const { status, html } = await h.svc.submit({
      submission: h.submission,
      answer_0: long,
      answer_1: long,
    })
    expect(status).toBe(502)
    expect(html).toContain('could not be sent to your course')
    expect(html).toContain('403')
    expect(html).not.toContain('Overall score')
  })

  it('shows an error when the token endpoint fails', async () => {
    const h = await launched()
    h.setTokenStatus(401)
    const { status, html } = await h.svc.submit({
      submission: h.submission,
      answer_0: long,
      answer_1: long,
    })
    expect(status).toBe(502)
    expect(html).toContain('token endpoint')
    expect(h.calls.some((c) => c.url.endsWith('/scores'))).toBe(false)
  })

  describe.each(['/token', '/scores'])('a platform that stalls on %s', (stalled) => {
    it('times out into a 502 and releases the claims, so a retry is not a 409', async () => {
      const h = await launched()
      h.svc.platformTimeoutMs = 20
      const real = h.svc.fetchImpl
      let stall = true
      h.svc.fetchImpl = ((url: string, init?: RequestInit) =>
        stall && url.endsWith(stalled)
          ? new Promise((_, reject) => {
              init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
            })
          : real(url, init)) as never
      const answers = { submission: h.submission, answer_0: long, answer_1: long }
      expect((await h.svc.submit(answers)).status).toBe(502)
      stall = false
      expect((await h.svc.submit(answers)).status).toBe(200)
    })
  })

  it('escapes the questions on the result page', async () => {
    const h = await launched(setup(['<img src=x onerror=1>']))
    const { html } = await h.svc.submit({ submission: h.submission, answer_0: long })
    expect(html).not.toContain('<img')
  })
})

describe('return link', () => {
  const long = 'x'.repeat(250)
  const withReturn = async (value: unknown) => {
    const h = setup()
    const { state, nonce } = await startLogin(h.svc)
    const html = await h.svc.launch(
      idToken(nonce, {
        [CLAIM.launchPresentation]: { document_target: 'window', return_url: value },
      }),
      state,
      state
    )
    return { ...h, submission: submissionOf(html) }
  }
  const answers = (submission: string) => ({ submission, answer_0: long, answer_1: long })

  it('links the result page back to the return_url of the launch', async () => {
    const h = await withReturn('http://learn.test/lms/learning/c1/i1')
    const { html } = await h.svc.submit(answers(h.submission))
    expect(html).toContain('href="http://learn.test/lms/learning/c1/i1"')
    expect(html).toContain('Back to your course')
    expect(html).not.toContain('return.test')
  })

  it('links error pages back to it too, including a failed score post', async () => {
    const h = await withReturn('http://learn.test/lms/learning/c1/i1')
    h.setScoreStatus(500)
    const { html } = await h.svc.submit(answers(h.submission))
    expect(html).toContain('href="http://learn.test/lms/learning/c1/i1"')
    await expect(h.svc.submit({ submission: h.submission, answer_0: 'a' })).rejects.toMatchObject({
      returnUrl: 'http://learn.test/lms/learning/c1/i1',
    })
  })

  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,x'],
    ['/relative/path'],
    ['not a url'],
    ['http://evil.test/phish'],
    [42],
    [undefined],
  ])('ignores a return_url of %p and falls back to LTI_RETURN_URL', async (value) => {
    const h = await withReturn(value)
    const { html } = await h.svc.submit(answers(h.submission))
    expect(html).toContain('href="http://return.test"')
    expect(html).not.toContain('javascript:')
  })

  it('accepts a return_url on a tenant subdomain of the learn host', async () => {
    process.env.LTI_LEARN_URL = 'https://learn.test'
    const h = await withReturn('https://delaware.learn.test/lms/learning/c1/i1')
    const { html } = await h.svc.submit(answers(h.submission))
    expect(html).toContain('href="https://delaware.learn.test/lms/learning/c1/i1"')
  })

  it.each([
    ['https://evil-learn.test/back'],
    ['https://learn.test.evil.test/back'],
    ['https://evil.test/back'],
    ['https://learn.test@evil.test/back'],
    ['http://delaware.learn.test/back'],
    ['https://delaware.learn.test:8443/back'],
    ['ftp://delaware.learn.test/back'],
  ])('rejects the lookalike return_url %p', async (value) => {
    process.env.LTI_LEARN_URL = 'https://learn.test'
    const h = await withReturn(value)
    const { html } = await h.svc.submit(answers(h.submission))
    expect(html).toContain('href="http://return.test"')
  })

  it('accepts a return_url on the issuer origin', async () => {
    const h = await withReturn('http://api.test/somewhere')
    const { html } = await h.svc.submit(answers(h.submission))
    expect(html).toContain('href="http://api.test/somewhere"')
  })

  it('falls back to LTI_RETURN_URL when the launch has no launch_presentation claim', async () => {
    const h = await launched()
    const { html } = await h.svc.submit(answers(h.submission))
    expect(html).toContain('href="http://return.test"')
  })
})

describe('launch of a text scenario', () => {
  const textScenario = (mode?: string) => ({
    ...scenario([]),
    data: { ...scenario([]).data, mode },
  })

  it.each([[undefined], ['text']])(
    'redirects to the web app with the session in the fragment (mode %p)',
    async (mode) => {
      const h = setup()
      h.prisma.scenario.findUnique.mockResolvedValue(textScenario(mode))
      process.env.LTI_ID_WEB_URL = 'http://id.test/'
      const { state, nonce } = await startLogin(h.svc)
      const out = await h.svc.launch(
        idToken(nonce, {
          [CLAIM.launchPresentation]: { return_url: 'http://learn.test/back' },
        }),
        state,
        state
      )
      delete process.env.LTI_ID_WEB_URL
      const { redirect } = out as { redirect: string }
      const [path, token] = redirect.split('#session=')
      expect(path).toBe('http://id.test/lti/play/S1')
      expect(verifySession(token)).toMatchObject({
        sub: 'u1',
        ref: 'S1',
        lineitem: LINEITEM,
        returnUrl: 'http://learn.test/back',
        jti: expect.any(String),
        iat: expect.any(Number),
      })
    }
  )

  it('defaults the web app URL and encodes the ref', async () => {
    const h = setup()
    h.prisma.scenario.findUnique.mockResolvedValue(textScenario())
    const { state, nonce } = await startLogin(h.svc)
    const out = await h.svc.launch(
      idToken(nonce, { [CLAIM.custom]: { ref: 'a b/c' } }),
      state,
      state
    )
    expect((out as { redirect: string }).redirect).toMatch(
      /^http:\/\/localhost:5173\/lti\/play\/a%20b%2Fc#session=/
    )
  })

  it('puts the datasets of the scenario sql nodes in the session', async () => {
    const h = setup()
    const base = textScenario()
    h.prisma.scenario.findUnique.mockResolvedValue({
      ...base,
      data: {
        ...base.data,
        nodes: [
          { type: 'sql', sql: { datasetSlug: 'sql-fundamentals' } },
          { type: 'decision' },
          { type: 'sql', sql: { datasetSlug: 'sql-fundamentals' } },
          { type: 'sql', sql: { datasetSlug: 'orders-2' } },
        ],
      },
    })
    const { state, nonce } = await startLogin(h.svc)
    const out = await h.svc.launch(idToken(nonce), state, state)
    const token = (out as { redirect: string }).redirect.split('#session=')[1]
    expect(verifySession(token).datasets).toEqual(['sql-fundamentals', 'orders-2'])
  })

  describe('brand', () => {
    const launchWith = async (claim: unknown, over: Record<string, unknown> = {}) => {
      const h = setup()
      h.prisma.scenario.findUnique.mockResolvedValue(textScenario())
      const { state, nonce } = await startLogin(h.svc)
      const out = await h.svc.launch(
        idToken(nonce, claim === undefined ? over : { [BRAND_CLAIM]: claim, ...over }),
        state,
        state
      )
      return verifySession((out as { redirect: string }).redirect.split('#session=')[1])
    }

    it('carries the brand in the signed session', async () => {
      const brand = { name: 'Delaware DOL', primary: '#05405c', scheme: 'light' }
      expect((await launchWith(brand)).brand).toEqual(brand)
    })

    it('re-sanitizes the claim and never trusts it', async () => {
      const s = await launchWith({
        name: 'Acme',
        logoUrl: 'javascript:alert(1)',
        primary: '#ABCDEF',
        accent: 'url(https://evil.test)',
        extra: 'x',
      })
      expect(s.brand).toEqual({ name: 'Acme', primary: '#abcdef' })
    })

    it.each([[undefined], [null], ['Acme'], [[]], [{ primary: '#000000' }], [{ name: '<b>' }]])(
      'has no brand for the claim %p',
      async (claim) => {
        const s = await launchWith(claim)
        expect(s).not.toHaveProperty('brand')
      }
    )

    it('rejects a session whose brand was altered after signing', async () => {
      const brand = { name: 'Acme', primary: '#112233' }
      const s = await launchWith(brand)
      const token = signSession(s)
      const [body, mac] = token.split('.')
      const forged = Buffer.from(
        JSON.stringify({ ...s, brand: { ...brand, primary: '#ff0000' } })
      ).toString('base64url')
      expect(() => verifySession(`${forged}.${mac}`)).toThrow('Invalid session token')
      expect(body).not.toBe(forged)
    })

    it('rejects a correctly signed session holding an unsanitized brand', () => {
      const s = {
        sub: 'u1',
        ref: 'S1',
        lineitem: LINEITEM,
        jti: 'j',
        iat: 1,
        exp: Math.floor(Date.now() / 1000) + 60,
      }
      for (const brand of [
        { name: 'A', primary: '#ABCDEF' }, // not in sanitized (lowercase) form
        { name: 'A', logoUrl: 'javascript:x' },
        { name: 'A', other: 1 },
        { primary: '#000000' },
        'Acme',
        null,
      ])
        expect(() => verifySession(signSession({ ...s, brand } as unknown as LtiSession))).toThrow(
          'Invalid session token'
        )
    })

    it('still verifies a session without a brand', () => {
      const s = signSession({
        sub: 'u1',
        ref: 'S1',
        lineitem: LINEITEM,
        jti: 'j',
        iat: 1,
        exp: Math.floor(Date.now() / 1000) + 60,
      })
      expect(verifySession(s).brand).toBeUndefined()
    })
  })

  it('puts no datasets in the session of a scenario without sql nodes', async () => {
    const h = setup()
    h.prisma.scenario.findUnique.mockResolvedValue(textScenario())
    const { state, nonce } = await startLogin(h.svc)
    const out = await h.svc.launch(idToken(nonce), state, state)
    const token = (out as { redirect: string }).redirect.split('#session=')[1]
    expect(verifySession(token).datasets).toEqual([])
  })

  it('keeps the typed page for an immersive scenario without an interviewer', async () => {
    const out = await launchAgain(setup().svc)
    expect(typeof out).toBe('string')
  })

  it.each([[{}], [{ presenterId: 'p' }], [{ voiceId: 'v' }], [{ presenterId: '', voiceId: '' }]])(
    'keeps the typed page for an incomplete interviewer %p',
    async (interviewer) => {
      const h = setup()
      const base = scenario(['Q1?'])
      h.prisma.scenario.findUnique.mockResolvedValue({
        ...base,
        data: { ...base.data, interviewer },
      })
      expect(typeof (await launchAgain(h.svc))).toBe('string')
    }
  )

  it('redirects an immersive scenario with an interviewer to the web app', async () => {
    const h = setup()
    const base = scenario(['Q1?'])
    h.prisma.scenario.findUnique.mockResolvedValue({
      ...base,
      data: { ...base.data, interviewer: { presenterId: 'p', voiceId: 'v' } },
    })
    const out = (await launchAgain(h.svc)) as { redirect: string }
    const [path, token] = out.redirect.split('#session=')
    expect(path).toBe('http://localhost:5173/lti/play/S1')
    expect(verifySession(token)).toMatchObject({ sub: 'u1', ref: 'S1', lineitem: LINEITEM })
  })

  it('still refuses an unpublished immersive scenario with an interviewer', async () => {
    const h = setup()
    const base = scenario(['Q1?'])
    h.prisma.scenario.findUnique.mockResolvedValue({
      ...base,
      status: 'draft',
      data: { ...base.data, interviewer: { presenterId: 'p', voiceId: 'v' } },
    })
    await expect(launchAgain(h.svc)).rejects.toMatchObject({ status: 404 })
  })
})

describe('session token', () => {
  const claims: LtiSession = {
    sub: 'u1',
    ref: 'S1',
    lineitem: LINEITEM,
    jti: 'j1',
    iat: 1_000_000_000,
    exp: 2_000_000_000,
  }

  it('round trips', () => expect(verifySession(signSession(claims), 1_000)).toEqual(claims))

  it('rejects a changed claim, a bad mac, junk and an expired token', () => {
    const [body, mac] = signSession(claims).split('.')
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: 'victim' })).toString('base64url')
    expect(() => verifySession(`${forged}.${mac}`, 1_000)).toThrow('Invalid')
    expect(() => verifySession(`${body}.AAAA`, 1_000)).toThrow('Invalid')
    expect(() => verifySession(`${body}.${mac}.x`, 1_000)).toThrow('Invalid')
    expect(() => verifySession(undefined)).toThrow('Invalid')
    expect(() => verifySession(signSession(claims), 2_000_000_001)).toThrow('expired')
  })

  it('round trips a delivery id and refuses a malformed one', () => {
    const t = signSession({ ...claims, deliveryId: 'd1' })
    expect(verifySession(t, 1_000).deliveryId).toBe('d1')
    expect(verifySession(signSession(claims), 1_000).deliveryId).toBeUndefined()
    for (const bad of ['', 5, {}])
      expect(() =>
        verifySession(signSession({ ...claims, deliveryId: bad } as unknown as LtiSession), 1_000)
      ).toThrow('Invalid')
  })

  it('rejects a token without iat', () => {
    const noIat: Partial<LtiSession> = { ...claims }
    delete noIat.iat
    expect(() => verifySession(signSession(noIat as LtiSession), 1_000)).toThrow('Invalid')
  })

  it('rejects a datasets claim that is not a list of strings', () => {
    for (const datasets of ['sql-fundamentals', [1], [null]])
      expect(() =>
        verifySession(signSession({ ...claims, datasets } as unknown as LtiSession), 1_000)
      ).toThrow('Invalid')
    expect(verifySession(signSession({ ...claims, datasets: ['a'] }), 1_000).datasets).toEqual([
      'a',
    ])
  })

  it('reads dataset slugs from sql nodes only, without duplicates', () => {
    expect(sqlDatasetSlugs(null)).toEqual([])
    expect(sqlDatasetSlugs({ nodes: 'x' })).toEqual([])
    expect(
      sqlDatasetSlugs({
        nodes: [
          null,
          { type: 'decision', sql: { datasetSlug: 'no' } },
          { type: 'sql' },
          { type: 'sql', sql: { datasetSlug: '' } },
          { type: 'sql', sql: { datasetSlug: 7 } },
          { type: 'sql', sql: { datasetSlug: 'a' } },
          { type: 'sql', sql: { datasetSlug: 'a' } },
        ],
      })
    ).toEqual(['a'])
  })

  it('does not verify with another secret', () =>
    expect(() => verifySession(signSession(claims, 'other'), 1_000)).toThrow('Invalid'))

  it('is not interchangeable with a submission token', async () => {
    const h = await launched()
    expect(() => verifySession(h.submission)).toThrow('Invalid')
  })
})

describe('complete', () => {
  const session: LtiSession = {
    sub: 'u1',
    ref: 'S1',
    lineitem: LINEITEM,
    returnUrl: 'http://learn.test/back',
    jti: 'j1',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  }
  const result = (over = {}) => ({
    id: 'r1',
    userId: 'u1',
    scenarioId: 'S1',
    overallScore: 72,
    completedAt: new Date(),
    dimensionScores: [
      { dimension: 'Clarity', score: 80 },
      { dimension: 'Depth', score: 64 },
    ],
    ...over,
  })
  const ready = (over = {}) => {
    const h = setup()
    h.prisma.simulationResult.findUnique.mockResolvedValue(result(over))
    return h
  }

  it('posts the score and dimensions to the lineitem and returns the return link', async () => {
    const h = ready()
    expect(await h.svc.complete(session, 'r1')).toEqual({
      score: 72,
      returnUrl: 'http://learn.test/back',
    })
    const post = h.calls.find((c) => c.url === `${LINEITEM}/scores`)!
    expect((post.init!.headers as Record<string, string>)['Content-Type']).toBe(SCORE_CONTENT_TYPE)
    expect(JSON.parse(post.init!.body as string)).toEqual({
      userId: 'u1',
      scoreGiven: 72,
      scoreMaximum: 100,
      activityProgress: 'Completed',
      gradingProgress: 'FullyGraded',
      timestamp: expect.any(String),
      [DIMENSIONS_FIELD]: [
        { dimension: 'Clarity', score: 80 },
        { dimension: 'Depth', score: 64 },
      ],
    })
  })

  it('falls back to LTI_RETURN_URL', async () => {
    const out = await ready().svc.complete({ ...session, returnUrl: undefined }, 'r1')
    expect(out.returnUrl).toBe('http://return.test')
  })

  it.each([
    ['another learner', { userId: 'u2' }],
    ['another scenario', { scenarioId: 'S2' }],
  ])('refuses a result of %s and posts nothing', async (_n, over) => {
    const h = ready(over)
    await expect(h.svc.complete(session, 'r1')).rejects.toMatchObject({ status: 404 })
    expect(h.calls).toEqual([])
  })

  it('404s an unknown result and 400s a missing resultId', async () => {
    const h = setup()
    h.prisma.simulationResult.findUnique.mockResolvedValue(null)
    await expect(h.svc.complete(session, 'r1')).rejects.toMatchObject({ status: 404 })
    await expect(h.svc.complete(session, undefined)).rejects.toMatchObject({ status: 400 })
  })

  it('refuses a result completed before the session began, allowing a minute of skew', async () => {
    const iatMs = session.iat * 1000
    const h = ready({ completedAt: new Date(iatMs - 61_000) })
    await expect(h.svc.complete(session, 'r1')).rejects.toMatchObject({ status: 400 })
    expect(h.calls).toEqual([])
    const ok = ready({ completedAt: new Date(iatMs - 59_000) })
    await expect(ok.svc.complete(session, 'r1')).resolves.toMatchObject({ score: 72 })
  })

  it('accepts a result only once across sessions, 409 afterwards', async () => {
    const h = ready()
    await h.svc.complete(session, 'r1')
    await expect(h.svc.complete({ ...session, jti: 'j2' }, 'r1')).rejects.toMatchObject({
      status: 409,
    })
    expect(h.calls.filter((c) => c.url.endsWith('/scores'))).toHaveLength(1)
  })

  it('does not burn the session when the result was already sent', async () => {
    const h = ready()
    await h.svc.complete(session, 'r1')
    h.prisma.simulationResult.findUnique.mockResolvedValue(result({ id: 'r2' }))
    await expect(h.svc.complete({ ...session, jti: 'j2' }, 'r1')).rejects.toMatchObject({
      status: 409,
    })
    await expect(h.svc.complete({ ...session, jti: 'j2' }, 'r2')).resolves.toMatchObject({
      score: 72,
    })
  })

  it('accepts a session only once, 409 afterwards', async () => {
    const h = ready()
    await h.svc.complete(session, 'r1')
    await expect(h.svc.complete(session, 'r1')).rejects.toMatchObject({ status: 409 })
    expect(h.calls.filter((c) => c.url.endsWith('/scores'))).toHaveLength(1)
  })

  it('answers a platform failure with a generic 502 and lets the session retry', async () => {
    const h = ready()
    h.setScoreStatus(500)
    await expect(h.svc.complete(session, 'r1')).rejects.toMatchObject({
      status: 502,
      message: 'The score could not be sent to your course. Please try again.',
    })
    h.setScoreStatus(200)
    await expect(h.svc.complete(session, 'r1')).resolves.toMatchObject({ score: 72 })
    // the result is consumed only by the success
    await expect(h.svc.complete({ ...session, jti: 'j2' }, 'r1')).rejects.toMatchObject({
      status: 409,
    })
  })

  it('releases the result when the post fails, so another session can send it', async () => {
    const h = ready()
    h.setScoreStatus(500)
    await expect(h.svc.complete(session, 'r1')).rejects.toMatchObject({ status: 502 })
    h.setScoreStatus(200)
    await expect(h.svc.complete({ ...session, jti: 'j2' }, 'r1')).resolves.toMatchObject({
      score: 72,
    })
  })

  it('rate limits by learner', async () => {
    const h = ready()
    for (let i = 0; i < 10; i++)
      await h.svc.complete({ ...session, jti: `j${i}` }, 'r1').catch(() => undefined)
    await expect(h.svc.complete({ ...session, jti: 'jx' }, 'r1')).rejects.toMatchObject({
      status: 429,
    })
  })
})

describe('completeImmersive', () => {
  const nowS = Math.floor(Date.now() / 1000)
  const session: LtiSession = {
    sub: 'u1',
    ref: 'S1',
    lineitem: LINEITEM,
    returnUrl: 'http://learn.test/back',
    jti: 'j1',
    iat: nowS,
    exp: nowS + 3600,
  }
  const voice = {
    scenarioId: 'S1',
    status: 'published',
    data: {
      mode: 'immersive',
      interviewer: { presenterId: 'p', voiceId: 'v' },
      briefing: { role: 'Analyst' },
      nodes: [
        { nodeId: 'n1', responsePrompt: ' First question? ' },
        { nodeId: 'n2', type: 'decision', responsePrompt: 'Second question?' },
      ],
      rubric: {
        dimensions: [
          { name: 'Clarity', description: 'd' },
          { name: 'Depth', description: 'd' },
        ],
      },
    },
  }
  const response = (nodeId: string, transcript: string | null, over = {}) => ({
    id: `r-${nodeId}`,
    nodeId,
    questionText: 'client supplied text',
    transcript,
    ...over,
  })
  const row = (over = {}) => ({
    id: 'im1',
    userId: 'u1',
    scenarioId: 'S1',
    status: 'active',
    createdAt: new Date(),
    responses: [response('n1', 'I would page the owner.'), response('n2', 'Then roll back.')],
    ...over,
  })
  const scored = (a: number, b: number) => ({
    score: Math.round((a + b) / 2),
    dimensions: [
      { dimension: 'Clarity', score: a },
      { dimension: 'Depth', score: b },
    ],
    feedback: '',
    strengths: '',
    development: '',
  })
  function ready(over = {}) {
    const h = setup()
    process.env.LTI_TOOL_SCORING = 'engine'
    process.env.ANTHROPIC_API_KEY = 'test-key'
    h.prisma.scenario.findUnique.mockResolvedValue(voice)
    h.prisma.immersiveSession.findUnique.mockResolvedValue(row(over))
    h.engine.scoreAnswers.mockResolvedValue([scored(80, 60), scored(70, 90)])
    return h
  }
  afterEach(() => {
    process.env.LTI_TOOL_SCORING = 'stub'
    delete process.env.ANTHROPIC_API_KEY
  })

  it('scores the transcripts on the server and posts the mean to the lineitem', async () => {
    const h = ready()
    expect(await h.svc.completeImmersive(session, 'im1')).toEqual({
      score: 75,
      returnUrl: 'http://learn.test/back',
    })
    expect(h.engine.scoreAnswers).toHaveBeenCalledWith({
      role: 'Analyst',
      rubric: [
        { name: 'Clarity', description: 'd' },
        { name: 'Depth', description: 'd' },
      ],
      questions: ['First question?', 'Second question?'],
      answers: ['I would page the owner.', 'Then roll back.'],
    })
    const post = h.calls.find((c) => c.url === `${LINEITEM}/scores`)!
    expect(JSON.parse(post.init!.body as string)).toEqual({
      userId: 'u1',
      scoreGiven: 75,
      scoreMaximum: 100,
      activityProgress: 'Completed',
      gradingProgress: 'FullyGraded',
      timestamp: expect.any(String),
      [DIMENSIONS_FIELD]: [
        { dimension: 'Clarity', score: 75 },
        { dimension: 'Depth', score: 75 },
      ],
    })
    expect(h.prisma.immersiveSession.update).toHaveBeenCalledWith({
      where: { id: 'im1' },
      data: { status: 'completed' },
    })
  })

  it('asks the scenario for the question, not the client, and takes the latest answer per node', async () => {
    const h = ready({
      responses: [
        response('n1', 'first try'),
        response('n2', 'Then roll back.'),
        response('n1', 'second try', { id: 'r-n1b' }),
        response('zz', 'not a question of this scenario'),
      ],
    })
    await h.svc.completeImmersive(session, 'im1')
    expect(h.engine.scoreAnswers).toHaveBeenCalledWith(
      expect.objectContaining({
        questions: ['First question?', 'Second question?'],
        answers: ['second try', 'Then roll back.'],
      })
    )
  })

  it('refuses a missing sessionId', async () => {
    await expect(ready().svc.completeImmersive(session, undefined)).rejects.toMatchObject({
      status: 400,
    })
  })

  it.each([
    ['null', null],
    ['whitespace', '   '],
  ])('refuses while a transcript is %s and posts nothing', async (_n, transcript) => {
    const h = ready({ responses: [response('n1', 'ok'), response('n2', transcript)] })
    await expect(h.svc.completeImmersive(session, 'im1')).rejects.toMatchObject({ status: 422 })
    expect(h.engine.scoreAnswers).not.toHaveBeenCalled()
    expect(h.calls).toEqual([])
    // nothing was consumed: once the transcript lands, the same session completes
    h.prisma.immersiveSession.findUnique.mockResolvedValue(row())
    await expect(h.svc.completeImmersive(session, 'im1')).resolves.toMatchObject({ score: 75 })
  })

  it('refuses when a question has no response', async () => {
    const h = ready({ responses: [response('n1', 'ok')] })
    await expect(h.svc.completeImmersive(session, 'im1')).rejects.toMatchObject({ status: 400 })
    expect(h.calls).toEqual([])
  })

  it.each([
    ['another learner', { userId: 'u2' }],
    ['another scenario', { scenarioId: 'S2' }],
  ])('refuses a session of %s', async (_n, over) => {
    const h = ready(over)
    await expect(h.svc.completeImmersive(session, 'im1')).rejects.toMatchObject({ status: 404 })
    expect(h.engine.scoreAnswers).not.toHaveBeenCalled()
    expect(h.calls).toEqual([])
  })

  it('404s an unknown session', async () => {
    const h = ready()
    h.prisma.immersiveSession.findUnique.mockResolvedValue(null)
    await expect(h.svc.completeImmersive(session, 'im1')).rejects.toMatchObject({ status: 404 })
  })

  it('refuses a session that is not active', async () => {
    const h = ready({ status: 'completed' })
    await expect(h.svc.completeImmersive(session, 'im1')).rejects.toMatchObject({ status: 409 })
    expect(h.calls).toEqual([])
  })

  it('says an abandoned session was replaced (410), not already sent', async () => {
    const h = ready({ status: 'abandoned' })
    await expect(h.svc.completeImmersive(session, 'im1')).rejects.toMatchObject({ status: 410 })
    expect(h.calls).toEqual([])
  })

  it('refuses a session created before the LTI session, allowing a minute of skew', async () => {
    const iatMs = session.iat * 1000
    const stale = ready({ createdAt: new Date(iatMs - 61_000) })
    await expect(stale.svc.completeImmersive(session, 'im1')).rejects.toMatchObject({ status: 400 })
    expect(stale.calls).toEqual([])
    const ok = ready({ createdAt: new Date(iatMs - 59_000) })
    await expect(ok.svc.completeImmersive(session, 'im1')).resolves.toMatchObject({ score: 75 })
  })

  it('accepts an LTI session only once, 409 afterwards', async () => {
    const h = ready()
    await h.svc.completeImmersive(session, 'im1')
    await expect(h.svc.completeImmersive(session, 'im1')).rejects.toMatchObject({ status: 409 })
    expect(h.calls.filter((c) => c.url.endsWith('/scores'))).toHaveLength(1)
  })

  it('accepts an interview only once across LTI sessions', async () => {
    const h = ready()
    await h.svc.completeImmersive(session, 'im1')
    await expect(h.svc.completeImmersive({ ...session, jti: 'j2' }, 'im1')).rejects.toMatchObject({
      status: 409,
    })
    expect(h.calls.filter((c) => c.url.endsWith('/scores'))).toHaveLength(1)
    expect(h.engine.scoreAnswers).toHaveBeenCalledTimes(1)
  })

  it('answers an engine failure with a generic 502 and releases both locks', async () => {
    const h = ready()
    h.engine.scoreAnswers.mockRejectedValueOnce(new Error('anthropic exploded: secret detail'))
    await expect(h.svc.completeImmersive(session, 'im1')).rejects.toMatchObject({
      status: 502,
      message: 'Your answers could not be scored right now. Please try again.',
    })
    expect(h.calls).toEqual([])
    await expect(h.svc.completeImmersive(session, 'im1')).resolves.toMatchObject({ score: 75 })
  })

  it('says scoring is not set up when the Anthropic key is missing, without calling the engine', async () => {
    const h = ready()
    delete process.env.ANTHROPIC_API_KEY
    await expect(h.svc.completeImmersive(session, 'im1')).rejects.toMatchObject({
      status: 502,
      message: 'Interview scoring is not set up on this server.',
    })
    expect(h.engine.scoreAnswers).not.toHaveBeenCalled()
    process.env.ANTHROPIC_API_KEY = 'test-key'
    await expect(h.svc.completeImmersive(session, 'im1')).resolves.toMatchObject({ score: 75 })
  })

  it('answers a platform failure with a generic 502 and lets the same session retry', async () => {
    const h = ready()
    h.setScoreStatus(500)
    await expect(h.svc.completeImmersive(session, 'im1')).rejects.toMatchObject({
      status: 502,
      message: 'The score could not be sent to your course. Please try again.',
    })
    expect(h.prisma.immersiveSession.update).not.toHaveBeenCalled()
    h.setScoreStatus(200)
    await expect(h.svc.completeImmersive(session, 'im1')).resolves.toMatchObject({ score: 75 })
  })

  it('stays successful when marking the session completed fails', async () => {
    const h = ready()
    h.prisma.immersiveSession.update.mockRejectedValue(new Error('db down'))
    await expect(h.svc.completeImmersive(session, 'im1')).resolves.toMatchObject({ score: 75 })
  })

  it('uses the offline scorer when LTI_TOOL_SCORING=stub', async () => {
    const h = ready()
    process.env.LTI_TOOL_SCORING = 'stub'
    delete process.env.ANTHROPIC_API_KEY
    await expect(h.svc.completeImmersive(session, 'im1')).resolves.toMatchObject({ score: 20 })
    expect(h.engine.scoreAnswers).not.toHaveBeenCalled()
  })

  it('rate limits by learner', async () => {
    const h = ready()
    for (let i = 0; i < 10; i++)
      await h.svc.completeImmersive({ ...session, jti: `j${i}` }, 'im1').catch(() => undefined)
    await expect(h.svc.completeImmersive({ ...session, jti: 'jx' }, 'im1')).rejects.toMatchObject({
      status: 429,
    })
  })
})

describe('assessment launch', () => {
  const bank = { id: 'as1', slug: 'sql-basics', dataset: { slug: 'sql-fundamentals' } }

  function ready(over: { assessment?: unknown; cohort?: unknown } = {}) {
    const h = setup() as ReturnType<typeof setup> & { prisma: Row }
    const deliveries: Row[] = []
    const attempts: Row[] = []
    h.prisma.assessment = {
      findUnique: jest.fn(async (a: Row) =>
        over.assessment === undefined
          ? a.where.slug === 'sql-basics' || a.where.id === 'as1'
            ? bank
            : null
          : over.assessment
      ),
    }
    h.prisma.cohort = {
      findUnique: jest.fn(async () => (over.cohort === undefined ? { id: 'c1' } : over.cohort)),
    }
    h.prisma.assessmentDelivery = {
      findFirst: jest.fn(
        async (a: Row) =>
          deliveries.find(
            (d) =>
              d.assessmentId === a.where.assessmentId &&
              d.cohortId === a.where.cohortId &&
              d.label === a.where.label &&
              // a review launch only matches a delivery this learner submitted
              (!a.where.attempts?.some ||
                attempts.some(
                  (t) =>
                    t.userId === a.where.attempts.some.userId &&
                    t.submittedAt &&
                    t.delivery.label === d.label
                ))
          ) ?? null
      ),
      create: jest.fn(async (a: Row) => {
        await Promise.resolve()
        const d = { id: `d${deliveries.length + 1}`, ...a.data }
        deliveries.push(d)
        return d
      }),
    }
    // the learner's attempts: `delivery` is what the tool's where-clause filters on
    h.prisma.assessmentAttempt = {
      ...h.prisma.assessmentAttempt,
      findMany: jest.fn(async (a: Row) =>
        attempts.filter(
          (t) =>
            t.userId === a.where.userId &&
            t.submittedAt &&
            t.delivery.assessmentId === a.where.delivery.assessmentId &&
            t.delivery.cohortId === a.where.delivery.cohortId &&
            t.delivery.label.startsWith(a.where.delivery.label.startsWith)
        )
      ),
    }
    h.svc.sleep = async () => undefined
    return { ...h, deliveries, attempts }
  }
  async function launchWith(
    h: ReturnType<typeof ready>,
    custom: Record<string, unknown> = { ref: 'sql-basics', tool: 'id-assessment' },
    extra: Record<string, unknown> = {}
  ) {
    const { state, nonce } = await startLogin(h.svc)
    return h.svc.launch(
      idToken(nonce, {
        [CLAIM.custom]: custom,
        [CLAIM.context]: { id: 'c1' },
        [CLAIM.resourceLink]: { id: 'item1' },
        ...extra,
      }),
      state,
      state
    ) as Promise<{ redirect: string }>
  }
  const sessionOf = (r: { redirect: string }) => verifySession(r.redirect.split('#session=')[1])

  it('creates the delivery and redirects to the assessment page with a pinned session', async () => {
    const h = ready()
    const r = await launchWith(h)
    expect(h.deliveries).toEqual([
      { id: 'd1', assessmentId: 'as1', cohortId: 'c1', label: 'lti:item1' },
    ])
    expect(r.redirect.startsWith('http://localhost:5173/lti/assessment/d1#session=')).toBe(true)
    expect(sessionOf(r)).toMatchObject({
      sub: 'u1',
      ref: 'sql-basics',
      deliveryId: 'd1',
      datasets: ['sql-fundamentals'],
      lineitem: LINEITEM,
    })
    expect(h.prisma.scenario.findUnique).not.toHaveBeenCalled()
  })

  describe('review launch', () => {
    const review = { ref: 'sql-basics', tool: 'id-assessment', attempt: 1, review: true }
    const submitted = (label: string) => ({
      userId: 'u1',
      submittedAt: new Date(),
      delivery: { assessmentId: 'as1', cohortId: 'c1', label },
    })

    it('opens a session marked review on the delivery the learner submitted', async () => {
      const h = ready()
      h.deliveries.push({ id: 'd1', assessmentId: 'as1', cohortId: 'c1', label: 'lti:item1' })
      h.attempts.push(submitted('lti:item1'))
      const r = await launchWith(h, review)
      expect(r.redirect.startsWith('http://localhost:5173/lti/assessment/d1#session=')).toBe(true)
      expect(sessionOf(r)).toMatchObject({ deliveryId: 'd1', review: true })
    })

    it('reviews the retake the claim names', async () => {
      const h = ready()
      h.deliveries.push({ id: 'd2', assessmentId: 'as1', cohortId: 'c1', label: 'lti:item1#2' })
      h.attempts.push(submitted('lti:item1#2'))
      expect(sessionOf(await launchWith(h, { ...review, attempt: 2 }))).toMatchObject({
        deliveryId: 'd2',
        review: true,
      })
    })

    it('never creates a delivery, and refuses when nothing was submitted', async () => {
      const h = ready()
      await expect(launchWith(h, review)).rejects.toMatchObject({ status: 404 })
      h.deliveries.push({ id: 'd1', assessmentId: 'as1', cohortId: 'c1', label: 'lti:item1' })
      await expect(launchWith(h, review)).rejects.toMatchObject({ status: 404 }) // started, not submitted
      expect(h.deliveries).toHaveLength(1)
    })

    it('an ordinary launch carries no review flag', async () => {
      const h = ready()
      expect(sessionOf(await launchWith(h))).not.toHaveProperty('review')
    })
  })

  describe('attempts and time limits', () => {
    const attemptCustom = (extra: Record<string, unknown>) => ({
      ref: 'sql-basics',
      tool: 'id-assessment',
      ...extra,
    })
    const submittedOn = (label: string, over: Row = {}) => ({
      userId: 'u1',
      submittedAt: new Date(),
      delivery: { assessmentId: 'as1', cohortId: 'c1', label },
      ...over,
    })

    it('uses the original label for attempt 1, with or without the claim', async () => {
      const h = ready()
      const a = await launchWith(h, attemptCustom({}))
      const b = await launchWith(h, attemptCustom({ attempt: 1 }))
      expect(h.deliveries.map((d) => d.label)).toEqual(['lti:item1'])
      expect(sessionOf(a).deliveryId).toBe(sessionOf(b).deliveryId)
    })

    it('matches a delivery created before retakes existed', async () => {
      const h = ready()
      h.deliveries.push({ id: 'old', assessmentId: 'as1', cohortId: 'c1', label: 'lti:item1' })
      const r = await launchWith(h, attemptCustom({ attempt: 1, timeLimitMinutes: 30 }))
      expect(sessionOf(r).deliveryId).toBe('old')
      // existing deliveries keep what they have
      expect(h.deliveries).toHaveLength(1)
      expect(h.deliveries[0]).not.toHaveProperty('timeLimitMinutes')
    })

    it('gives each retake its own delivery, labelled lti:<link>#<n>', async () => {
      const h = ready()
      const first = await launchWith(h, attemptCustom({}))
      h.attempts.push(submittedOn('lti:item1'))
      const second = await launchWith(h, attemptCustom({ attempt: 2 }))
      h.attempts.push(submittedOn('lti:item1#2'))
      const third = await launchWith(h, attemptCustom({ attempt: 3 }))
      expect(h.deliveries.map((d) => d.label)).toEqual(['lti:item1', 'lti:item1#2', 'lti:item1#3'])
      expect(new Set([first, second, third].map((r) => sessionOf(r).deliveryId)).size).toBe(3)
      expect(sessionOf(second).deliveryId).toBe('d2')
    })

    it('resumes the same delivery when an attempt is relaunched, submitted or not', async () => {
      const h = ready()
      await launchWith(h, attemptCustom({}))
      h.attempts.push(submittedOn('lti:item1'))
      const a = await launchWith(h, attemptCustom({ attempt: 2 }))
      // attempt 2 has not been submitted; launching it again finds the same delivery
      const b = await launchWith(h, attemptCustom({ attempt: 2 }))
      expect(sessionOf(b).deliveryId).toBe(sessionOf(a).deliveryId)
      // a submitted attempt 1 can still be relaunched
      const c = await launchWith(h, attemptCustom({ attempt: 1 }))
      expect(sessionOf(c).deliveryId).toBe('d1')
      expect(h.deliveries).toHaveLength(2)
    })

    it('refuses to skip ahead of the submitted attempts', async () => {
      const h = ready()
      await expect(launchWith(h, attemptCustom({ attempt: 2 }))).rejects.toMatchObject({
        status: 400,
      })
      // an unsubmitted attempt 1 does not unlock attempt 2
      h.attempts.push(submittedOn('lti:item1', { submittedAt: null }))
      await expect(launchWith(h, attemptCustom({ attempt: 2 }))).rejects.toMatchObject({
        status: 400,
      })
      h.attempts.push(submittedOn('lti:item1'))
      await expect(launchWith(h, attemptCustom({ attempt: 3 }))).rejects.toMatchObject({
        status: 400,
      })
      await expect(launchWith(h, attemptCustom({ attempt: 2 }))).resolves.toBeDefined()
      expect(h.deliveries.map((d) => d.label)).toEqual(['lti:item1#2'])
    })

    it('counts only this learner, item, assessment and cohort', async () => {
      const h = ready()
      h.attempts.push(
        submittedOn('lti:item1', { userId: 'someone-else' }),
        submittedOn('lti:item2'),
        submittedOn('lti:item1#2', {
          delivery: { assessmentId: 'as2', cohortId: 'c1', label: 'lti:item1' },
        }),
        submittedOn('lti:item1', {
          delivery: { assessmentId: 'as1', cohortId: 'c9', label: 'lti:item1' },
        }),
        // another item whose id merely starts with this one
        submittedOn('lti:item1#x')
      )
      await expect(launchWith(h, attemptCustom({ attempt: 2 }))).rejects.toMatchObject({
        status: 400,
      })
    })

    it('creates the delivery with the time limit, only on creation', async () => {
      const h = ready()
      await launchWith(h, attemptCustom({ timeLimitMinutes: 45 }))
      expect(h.deliveries[0]).toMatchObject({ label: 'lti:item1', timeLimitMinutes: 45 })
      await launchWith(h, attemptCustom({ timeLimitMinutes: 90 }))
      expect(h.deliveries).toHaveLength(1)
      expect(h.deliveries[0].timeLimitMinutes).toBe(45)
      h.attempts.push(submittedOn('lti:item1'))
      await launchWith(h, attemptCustom({ attempt: 2, timeLimitMinutes: 60 }))
      expect(h.deliveries[1]).toMatchObject({ label: 'lti:item1#2', timeLimitMinutes: 60 })
    })

    it.each([
      [{ attempt: 0 }],
      [{ attempt: -1 }],
      [{ attempt: 1.5 }],
      [{ attempt: '2' }],
      [{ attempt: null }],
      [{ attempt: 101 }],
      [{ timeLimitMinutes: 4 }],
      [{ timeLimitMinutes: 241 }],
      [{ timeLimitMinutes: 30.5 }],
      [{ timeLimitMinutes: '30' }],
      [{ timeLimitMinutes: null }],
    ])('rejects the claims %j with a 400 and creates nothing', async (extra) => {
      const h = ready()
      await expect(launchWith(h, attemptCustom(extra))).rejects.toMatchObject({ status: 400 })
      expect(h.deliveries).toHaveLength(0)
    })

    it('accepts the limit bounds', async () => {
      const h = ready()
      await launchWith(h, attemptCustom({ timeLimitMinutes: 5 }))
      expect(h.deliveries[0].timeLimitMinutes).toBe(5)
      const h2 = ready()
      await launchWith(h2, attemptCustom({ timeLimitMinutes: 240 }))
      expect(h2.deliveries[0].timeLimitMinutes).toBe(240)
    })

    it('creates one delivery when two launches of the same retake race', async () => {
      const h = ready()
      h.attempts.push(submittedOn('lti:item1'))
      const [a, b] = await Promise.all([
        launchWith(h, attemptCustom({ attempt: 2, timeLimitMinutes: 20 })),
        launchWith(h, attemptCustom({ attempt: 2, timeLimitMinutes: 20 })),
      ])
      expect(h.deliveries).toHaveLength(1)
      expect(sessionOf(a).deliveryId).toBe(sessionOf(b).deliveryId)
    })

    it('locks on the exact label, so attempt 2 is not blocked by attempt 1 being set up', async () => {
      const h = ready()
      h.attempts.push(submittedOn('lti:item1'))
      await h.store.claim('lti-delivery', 'as1:c1:lti:item1', 60)
      await expect(launchWith(h, attemptCustom({ attempt: 2 }))).resolves.toBeDefined()
      await expect(launchWith(h, attemptCustom({ attempt: 1 }))).rejects.toMatchObject({
        status: 503,
      })
    })
  })

  describe('session lifetime', () => {
    const lifetime = (r: { redirect: string }) => {
      const s = sessionOf(r)
      return s.exp - s.iat
    }
    const custom = (minutes?: number) => ({
      ref: 'sql-basics',
      tool: 'id-assessment',
      ...(minutes === undefined ? {} : { timeLimitMinutes: minutes }),
    })

    it('is the default two hours without a time limit', async () => {
      const h = ready()
      expect(lifetime(await launchWith(h, custom()))).toBe(2 * 3600)
    })

    it.each([[180], [240]])('covers a %i minute limit plus 15 minutes grace', async (m) => {
      const h = ready()
      expect(lifetime(await launchWith(h, custom(m)))).toBe(m * 60 + 15 * 60)
    })

    it('stays at the default for a short limit', async () => {
      const h = ready()
      expect(lifetime(await launchWith(h, custom(30)))).toBe(2 * 3600)
    })

    it('uses the limit stored on an existing delivery, not the relaunch claim', async () => {
      const h = ready()
      await launchWith(h, custom(240))
      expect(lifetime(await launchWith(h, custom(30)))).toBe(240 * 60 + 15 * 60)
    })
  })

  it('reuses the delivery on a second launch and matches by id as a fallback', async () => {
    const h = ready()
    await launchWith(h)
    const r = await launchWith(h, { ref: 'as1', tool: 'id-assessment' })
    expect(h.deliveries).toHaveLength(1)
    expect(sessionOf(r).deliveryId).toBe('d1')
  })

  it('creates one delivery when two launches race', async () => {
    const h = ready()
    const [a, b] = await Promise.all([launchWith(h), launchWith(h)])
    expect(h.deliveries).toHaveLength(1)
    expect(sessionOf(a).deliveryId).toBe(sessionOf(b).deliveryId)
  })

  it('fails with a 503 page when the lock holder never produces the delivery', async () => {
    const h = ready()
    await h.store.claim('lti-delivery', 'as1:c1:lti:item1', 60)
    await expect(launchWith(h)).rejects.toMatchObject({ status: 503 })
  })

  it('answers 404 for an unknown assessment', async () => {
    const h = ready({ assessment: null })
    await expect(launchWith(h)).rejects.toMatchObject({
      status: 404,
      message: 'Assessment not found',
    })
    expect(h.deliveries).toHaveLength(0)
  })

  it('uses a null cohort when the context is not a cohort row', async () => {
    const h = ready({ cohort: null })
    await launchWith(h)
    expect(h.deliveries[0]).toMatchObject({ cohortId: null })
  })

  it('has no datasets when the bank has no dataset', async () => {
    const h = ready({ assessment: { ...bank, dataset: null } })
    expect(sessionOf(await launchWith(h)).datasets).toEqual([])
  })

  it('keeps the brand and the return link', async () => {
    const h = ready()
    const r = await launchWith(h, undefined, {
      [BRAND_CLAIM]: { name: 'Acme' },
      [CLAIM.launchPresentation]: { return_url: 'http://learn.test/back' },
    })
    expect(sessionOf(r)).toMatchObject({
      brand: { name: 'Acme' },
      returnUrl: 'http://learn.test/back',
    })
  })

  it('treats a missing tool as the interview and refuses an unknown one', async () => {
    const h = ready()
    const text = await launchWith(h, { ref: 'S1' })
    expect(typeof text).toBe('string') // typed interview page, no assessment lookups
    expect(h.prisma.assessment.findUnique).not.toHaveBeenCalled()
    await expect(launchWith(h, { ref: 'S1', tool: 'nope' })).rejects.toMatchObject({ status: 400 })
  })
})

describe('completeAssessment', () => {
  const nowS = Math.floor(Date.now() / 1000)
  const session: LtiSession = {
    sub: 'u1',
    ref: 'sql-basics',
    lineitem: LINEITEM,
    returnUrl: 'http://learn.test/back',
    deliveryId: 'd1',
    jti: 'j1',
    iat: nowS,
    exp: nowS + 3600,
  }
  const attempt = (over = {}) => ({
    id: 'at1',
    userId: 'u1',
    deliveryId: 'd1',
    startedAt: new Date(),
    submittedAt: new Date(),
    sectionScores: [
      { sectionId: 's1', title: 'Basics', correct: 1, total: 3, questions: [] },
      { sectionId: 's2', title: 'Joins', correct: 2, total: 2, questions: [] },
    ],
    ...over,
  })
  function ready(over = {}) {
    const h = setup() as ReturnType<typeof setup> & { prisma: Row }
    h.prisma.assessmentAttempt = { findUnique: jest.fn().mockResolvedValue(attempt(over)) }
    return h as ReturnType<typeof setup> & { prisma: Row }
  }

  it('posts the server-computed percent and per-section scores, then answers', async () => {
    const h = ready()
    expect(await h.svc.completeAssessment(session, 'at1')).toEqual({
      score: 60,
      returnUrl: 'http://learn.test/back',
    })
    const body = JSON.parse(String(h.calls.at(-1)!.init!.body))
    expect(body).toMatchObject({ userId: 'u1', scoreGiven: 60, scoreMaximum: 100 })
    expect(body[DIMENSIONS_FIELD]).toEqual([
      { dimension: 'Basics', score: 33 },
      { dimension: 'Joins', score: 100 },
    ])
  })

  it('needs an attempt id and a session with a delivery', async () => {
    const h = ready()
    await expect(h.svc.completeAssessment(session, undefined)).rejects.toMatchObject({
      status: 400,
    })
    const noDelivery: Partial<LtiSession> = { ...session }
    delete noDelivery.deliveryId
    await expect(h.svc.completeAssessment(noDelivery as LtiSession, 'at1')).rejects.toMatchObject({
      status: 404,
    })
  })

  it.each([
    ['a missing attempt', null, 404],
    ['another learner', { userId: 'u2' }, 404],
    ['another delivery', { deliveryId: 'd2' }, 404],
    ['an unsubmitted attempt', { submittedAt: null }, 400],
    ['an ungraded attempt', { sectionScores: null }, 400],
  ])('refuses %s and posts nothing', async (_n, over, status) => {
    const h = ready(over ?? {})
    if (over === null) h.prisma.assessmentAttempt.findUnique.mockResolvedValue(null)
    await expect(h.svc.completeAssessment(session, 'at1')).rejects.toMatchObject({ status })
    expect(h.calls).toHaveLength(0)
  })

  it('posts an attempt started before the session began (a relaunch resumes it)', async () => {
    const h = ready({ startedAt: new Date(Date.now() - 3 * 3600 * 1000) })
    await expect(h.svc.completeAssessment(session, 'at1')).resolves.toMatchObject({ score: 60 })
    expect(h.calls).not.toHaveLength(0)
  })

  it('sends an attempt once, per session and across sessions', async () => {
    const h = ready()
    await h.svc.completeAssessment(session, 'at1')
    await expect(h.svc.completeAssessment(session, 'at1')).rejects.toMatchObject({ status: 409 })
    await expect(h.svc.completeAssessment({ ...session, jti: 'j2' }, 'at1')).rejects.toMatchObject({
      status: 409,
    })
    expect(h.calls.filter((c) => c.url.endsWith('/scores'))).toHaveLength(1)
  })

  it('posts a retake with its own score and dimensions, independent of the first attempt', async () => {
    const h = ready()
    await h.svc.completeAssessment(session, 'at1')
    const retake = attempt({
      id: 'at2',
      deliveryId: 'd2',
      sectionScores: [{ sectionId: 's1', title: 'Basics', correct: 3, total: 3, questions: [] }],
    })
    h.prisma.assessmentAttempt.findUnique.mockResolvedValue(retake)
    await expect(
      h.svc.completeAssessment({ ...session, deliveryId: 'd2', jti: 'j2' }, 'at2')
    ).resolves.toMatchObject({ score: 100 })
    const bodies = h.calls
      .filter((c) => c.url.endsWith('/scores'))
      .map((c) => JSON.parse(String(c.init!.body)))
    expect(bodies.map((b) => b.scoreGiven)).toEqual([60, 100])
    expect(bodies[1][DIMENSIONS_FIELD]).toEqual([{ dimension: 'Basics', score: 100 }])
    // a session pinned to the retake cannot send the first attempt's score
    h.prisma.assessmentAttempt.findUnique.mockResolvedValue(attempt())
    await expect(
      h.svc.completeAssessment({ ...session, deliveryId: 'd2', jti: 'j3' }, 'at1')
    ).rejects.toMatchObject({ status: 404 })
  })

  it('releases both locks when the platform fails, so a retry works', async () => {
    const h = ready()
    h.setScoreStatus(500)
    await expect(h.svc.completeAssessment(session, 'at1')).rejects.toMatchObject({ status: 502 })
    h.setScoreStatus(200)
    await expect(h.svc.completeAssessment(session, 'at1')).resolves.toMatchObject({ score: 60 })
  })

  it('rate limits by learner', async () => {
    const h = ready()
    for (let i = 0; i < 10; i++)
      await h.svc.completeAssessment({ ...session, jti: `j${i}` }, 'at1').catch(() => undefined)
    await expect(h.svc.completeAssessment({ ...session, jti: 'jx' }, 'at1')).rejects.toMatchObject({
      status: 429,
    })
  })
})
