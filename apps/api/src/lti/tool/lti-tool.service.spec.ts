import {
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
import { LtiToolService } from './lti-tool.service'

const BASE = 'http://api.test/api'
const ISS = 'http://api.test'
const LINEITEM = `${BASE}/lti/platform/ags/c1/lineitems/i1`

const platformKeys = generateKeyPair()
const otherKeys = generateKeyPair()

const scenario = (questions: string[]) => ({
  scenarioId: 'S1',
  data: {
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
  const prisma = { scenario: { findUnique: jest.fn().mockResolvedValue(scenario(questions)) } }
  const svc = new LtiToolService(prisma as any, { scoreAnswers: jest.fn() } as any)
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
  }) as any
  return {
    svc,
    prisma,
    calls,
    setScoreStatus: (s: number) => (scoreStatus = s),
    setTokenStatus: (s: number) => (tokenStatus = s),
  }
}

function loginParams(extra = {}) {
  return { iss: ISS, client_id: 'ld-platform', login_hint: 'u1', lti_message_hint: 'mh', ...extra }
}

function startLogin(svc: LtiToolService) {
  const url = new URL(svc.login(loginParams()).url)
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

const submissionOf = (html: string) => /name="submission" value="([^"]+)"/.exec(html)![1]

async function launchAgain(svc: LtiToolService) {
  const { state, nonce } = startLogin(svc)
  return svc.launch(idToken(nonce), state, state)
}

async function launched(h = setup()) {
  const { state, nonce } = startLogin(h.svc)
  const html = await h.svc.launch(idToken(nonce), state, state)
  return { ...h, html, submission: submissionOf(html) }
}

beforeEach(() => {
  process.env.LTI_API_BASE = BASE
  process.env.LTI_TOOL_SCORING = 'stub'
  process.env.LTI_RETURN_URL = 'http://return.test'
  for (const k of ['LTI_PLATFORM_ISSUER', 'LTI_TOOL_PRIVATE_KEY', 'LTI_TOOL_SECRET'])
    delete process.env[k]
})

describe('login', () => {
  it('redirects to the platform auth URL with OIDC params', () => {
    const { svc } = setup()
    const { url, state, nonce } = startLogin(svc)
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

  it('rejects an unknown issuer or client', () => {
    const { svc } = setup()
    expect(() => svc.login(loginParams({ iss: 'http://evil' }))).toThrow('Unknown platform')
    expect(() => svc.login(loginParams({ client_id: 'x' }))).toThrow('Unknown platform')
  })

  it('requires a login_hint and an lti_message_hint', () => {
    const { svc } = setup()
    expect(() => svc.login(loginParams({ login_hint: '' }))).toThrow('login_hint')
    expect(() => svc.login(loginParams({ lti_message_hint: '' }))).toThrow('lti_message_hint')
    expect(() => svc.login(loginParams({ lti_message_hint: undefined }))).toThrow(
      'lti_message_hint'
    )
  })

  it('returns the state it stored, for the cookie', () => {
    const { svc } = setup()
    const { url, state } = svc.login(loginParams())
    expect(new URL(url).searchParams.get('state')).toBe(state)
  })

  it('evicts the oldest pending login when full, and sweeps expired ones on the timer', async () => {
    const h = setup()
    h.svc.maxPending = 2
    const first = startLogin(h.svc)
    startLogin(h.svc)
    startLogin(h.svc)
    expect(h.svc['pending'].size).toBe(2)
    await expect(h.svc.launch(idToken(first.nonce), first.state, first.state)).rejects.toThrow(
      'Unknown or expired state'
    )
    const t = Date.now()
    h.svc.now = () => t + 11 * 60_000
    h.svc['sweep']()
    expect(h.svc['pending'].size).toBe(0)
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
    const { nonce } = startLogin(svc)
    await expect(svc.launch(idToken(nonce), 'nope', 'nope')).rejects.toThrow(
      'Unknown or expired state'
    )
    await expect(svc.launch(idToken(nonce), undefined, undefined)).rejects.toThrow('state')
  })

  it('rejects a launch whose lti_state cookie is missing or belongs to another state', async () => {
    const h = setup()
    const { state, nonce } = startLogin(h.svc)
    const other = startLogin(h.svc)
    await expect(h.svc.launch(idToken(nonce), state, undefined)).rejects.toThrow('state')
    await expect(h.svc.launch(idToken(nonce), state, other.state)).rejects.toThrow('state')
    // the refused attempts did not burn the state: the right browser can still finish
    expect(await h.svc.launch(idToken(nonce), state, state)).toContain('name="submission"')
  })

  it('rejects a score endpoint that is not on the platform origin', async () => {
    const h = setup()
    const { state, nonce } = startLogin(h.svc)
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
    const { state, nonce } = startLogin(h.svc)
    await h.svc.launch(idToken(nonce), state, state)
    await expect(h.svc.launch(idToken(nonce), state, state)).rejects.toThrow('state')
  })

  it('rejects an expired state', async () => {
    const h = setup()
    const { state, nonce } = startLogin(h.svc)
    const t = Date.now()
    h.svc.now = () => t + 11 * 60_000
    await expect(h.svc.launch(idToken(nonce), state, state)).rejects.toThrow('state')
  })

  const reject = async (token: (nonce: string) => string, msg: string) => {
    const h = setup()
    const { state, nonce } = startLogin(h.svc)
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

  it('404s when the scenario does not exist', async () => {
    const h = setup()
    h.prisma.scenario.findUnique.mockResolvedValue(null)
    const { state, nonce } = startLogin(h.svc)
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
    const first = h.svc.submit(answers)
    await expect(h.svc.submit(answers)).rejects.toMatchObject({ status: 409 })
    expect((await first).status).toBe(200)
  })

  it('caps the consumed store (oldest evicted) and sweeps expired entries', async () => {
    const h = setup()
    h.svc.maxConsumed = 1
    const a = submissionOf(await launchAgain(h.svc))
    const b = submissionOf(await launchAgain(h.svc))
    await h.svc.submit({ submission: a, answer_0: long, answer_1: long })
    await h.svc.submit({ submission: b, answer_0: long, answer_1: long })
    expect(h.svc['consumed'].size).toBe(1)
    await expect(h.svc.submit({ submission: b, answer_0: long, answer_1: long })).rejects.toThrow(
      'already submitted'
    )
    const t = Date.now()
    h.svc.now = () => t + 31 * 60_000
    h.svc['sweep']()
    expect(h.svc['consumed'].size).toBe(0)
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
    const t = Date.now()
    svc.now = () => t + 31 * 60_000
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

  it('escapes the questions on the result page', async () => {
    const h = await launched(setup(['<img src=x onerror=1>']))
    const { html } = await h.svc.submit({ submission: h.submission, answer_0: long })
    expect(html).not.toContain('<img')
  })
})
