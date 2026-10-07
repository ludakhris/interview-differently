import { AGS_SCOPE_SCORE, CLAIM, generateKeyPair, jwksOf, LEARNER_ROLE, signJwt } from '../lti-spec'
import { MemoryLtiStore } from '../lti-store'
import { LtiToolService } from './lti-tool.service'
import { BUILT_IN_ID } from './platform-registry.service'
import { fakePlatformDb, registryOf } from './platform-test-helpers'
import { verifySession, type LtiSession } from './lti-session'

// Interview Differently as a tool for several platforms at once: each login, launch and score goes
// to the platform it came from, whatever another platform's id or client id says.

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const ENV_ISS = 'http://api.test'
const keysA = generateKeyPair() // the built-in platform
const keysB = generateKeyPair()
const keysC = generateKeyPair()

const platformB = {
  name: 'Platform B',
  issuer: 'https://b.example',
  clientId: 'ld-platform', // the same client id as the built-in platform, on purpose
  deploymentId: 'dep-b',
  authUrl: 'https://b.example/auth',
  tokenUrl: 'https://b.example/token',
  jwksUrl: 'https://b.example/jwks',
  enabled: true,
}
const platformC = {
  ...platformB,
  name: 'Platform C',
  issuer: 'https://c.example',
  authUrl: 'https://c.example/auth',
  tokenUrl: 'https://c.example/token',
  jwksUrl: 'https://c.example/jwks',
  deploymentId: 'dep-c',
}
const LINEITEM_A = `${ENV_ISS}/api/lti/platform/ags/c1/lineitems/i1`
const LINEITEM_B = 'https://b.example/ags/lineitems/9'

const textScenario = {
  scenarioId: 'S1',
  status: 'published',
  data: { mode: 'text', briefing: { role: 'Analyst' }, nodes: [], rubric: { dimensions: [] } },
}
const typedScenario = {
  scenarioId: 'T1',
  status: 'published',
  data: {
    mode: 'immersive',
    briefing: { role: 'Analyst' },
    nodes: [{ responsePrompt: 'Tell me about a time you led.' }],
    rubric: { dimensions: [{ name: 'Clarity', description: 'd' }] },
  },
}

function setup(platforms: Row[] = [platformB, platformC]) {
  const db = fakePlatformDb(platforms)
  const registry = registryOf(db)
  const prisma = {
    scenario: {
      findUnique: jest.fn(async (a: Row) =>
        a.where.scenarioId === 'S1'
          ? textScenario
          : a.where.scenarioId === 'T1'
            ? typedScenario
            : null
      ),
    },
    simulationResult: { findUnique: jest.fn() },
  }
  const store = new MemoryLtiStore()
  const svc = new LtiToolService(
    prisma as never,
    { scoreAnswers: jest.fn() } as never,
    store,
    registry
  )
  const calls: { url: string; init?: RequestInit }[] = []
  const keysByJwks: Record<string, ReturnType<typeof jwksOf>> = {
    [`${ENV_ISS}/api/lti/platform/jwks`]: jwksOf(keysA),
    'https://b.example/jwks': jwksOf(keysB),
    'https://c.example/jwks': jwksOf(keysC),
  }
  svc.fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (keysByJwks[url]) return new Response(JSON.stringify(keysByJwks[url]))
    if (url.endsWith('/token')) return new Response(JSON.stringify({ access_token: 'AT' }))
    return new Response('{}')
  }) as never
  return { svc, db, registry, prisma, store, calls }
}
type H = ReturnType<typeof setup>

const loginFor = (iss: string, clientId = 'ld-platform') => ({
  iss,
  client_id: clientId,
  login_hint: 'u1',
  lti_message_hint: 'mh',
})

async function login(h: H, iss: string, clientId?: string) {
  const { url, state } = await h.svc.login(loginFor(iss, clientId))
  return { state, nonce: new URL(url).searchParams.get('nonce')!, url: new URL(url) }
}

function token(
  nonce: string,
  over: {
    aud?: string
    iss?: string
    deployment?: string
    sub?: string
    lineitem?: string
    custom?: Row
    extra?: Row
  },
  key = keysB
) {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      iss: over.iss,
      aud: over.aud ?? 'ld-platform',
      sub: over.sub ?? 'u1',
      nonce,
      iat: now,
      exp: now + 300,
      [CLAIM.messageType]: 'LtiResourceLinkRequest',
      [CLAIM.version]: '1.3.0',
      [CLAIM.deploymentId]: over.deployment,
      [CLAIM.roles]: [LEARNER_ROLE],
      [CLAIM.custom]: { ref: 'S1', ...over.custom },
      [CLAIM.agsEndpoint]: { scope: [AGS_SCOPE_SCORE], lineitem: over.lineitem },
      ...over.extra,
    },
    key
  )
}

const asB = (nonce: string, o: Row = {}) =>
  token(nonce, { iss: 'https://b.example', deployment: 'dep-b', lineitem: LINEITEM_B, ...o }, keysB)
const asA = (nonce: string, o: Row = {}) =>
  token(nonce, { iss: ENV_ISS, deployment: '1', lineitem: LINEITEM_A, ...o }, keysA)

const sessionOf = (out: string | { redirect: string }): LtiSession => {
  if (typeof out === 'string') throw new Error('expected a redirect')
  return verifySession(/#session=(.+)$/.exec(out.redirect)![1])
}

async function launchedB(h: H, o: Row = {}) {
  const { state, nonce } = await login(h, 'https://b.example')
  return sessionOf(await h.svc.launch(asB(nonce, o), state, state))
}

beforeEach(() => {
  process.env.LTI_API_BASE = `${ENV_ISS}/api`
  process.env.LTI_TOOL_SCORING = 'stub'
  process.env.LTI_RETURN_URL = 'http://return.test'
  process.env.LTI_LEARN_URL = 'http://learn.test'
  process.env.LTI_ID_WEB_URL = 'http://web.test'
  for (const k of [
    'LTI_PLATFORM_ISSUER',
    'LTI_TOOL_CLIENT_ID',
    'LTI_DEPLOYMENT_ID',
    'LTI_TOOL_PRIVATE_KEY',
    'LTI_TOOL_SECRET',
  ])
    delete process.env[k]
})

describe('login picks the platform by issuer and client id', () => {
  it('sends each platform to its own auth URL with its own client id', async () => {
    const h = setup()
    const b = await login(h, 'https://b.example')
    expect(b.url.origin + b.url.pathname).toBe('https://b.example/auth')
    expect(b.url.searchParams.get('client_id')).toBe('ld-platform')
    const c = await login(h, 'https://c.example')
    expect(c.url.origin + c.url.pathname).toBe('https://c.example/auth')
    const a = await login(h, ENV_ISS)
    expect(a.url.pathname).toBe('/api/lti/platform/auth')
  })

  it('remembers which platform the login was for', async () => {
    const h = setup()
    const b = await login(h, 'https://b.example')
    expect(await h.store.peek('lti-login', b.state)).toMatchObject({ platformId: 'p1' })
    const a = await login(h, ENV_ISS)
    expect(await h.store.peek('lti-login', a.state)).toMatchObject({ platformId: BUILT_IN_ID })
  })

  it('refuses an unknown issuer, an unknown client id and a wrong deployment', async () => {
    const h = setup()
    await expect(h.svc.login(loginFor('https://evil.example'))).rejects.toThrow('Unknown platform')
    await expect(h.svc.login(loginFor('https://b.example', 'other'))).rejects.toThrow(
      'Unknown platform'
    )
    await expect(
      h.svc.login({ ...loginFor('https://b.example'), lti_deployment_id: 'dep-c' })
    ).rejects.toThrow('Unknown deployment')
    // the built-in platform's deployment id is not platform B's
    await expect(
      h.svc.login({ ...loginFor('https://b.example'), lti_deployment_id: '1' })
    ).rejects.toThrow('Unknown deployment')
    await h.svc.login({ ...loginFor('https://b.example'), lti_deployment_id: 'dep-b' })
  })

  it('refuses a platform that is registered but not approved, and says why', async () => {
    const h = setup([{ ...platformB, enabled: false }])
    await expect(h.svc.login(loginFor('https://b.example'))).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining('not been approved'),
    })
    expect(
      [...(h.store as never as { entries: Map<string, unknown> }).entries.keys()].filter((k) =>
        k.includes('lti-login')
      )
    ).toEqual([])
  })

  it('refuses a platform switched off after the login began', async () => {
    const h = setup()
    const { state, nonce } = await login(h, 'https://b.example')
    await h.registry.setEnabled({ userId: 'u', userName: 'U' }, 'p1', false)
    await expect(h.svc.launch(asB(nonce), state, state)).rejects.toThrow('Unknown platform')
  })

  it('refuses the built-in platform once its table row is switched off', async () => {
    const h = setup([{ ...platformB, issuer: ENV_ISS, enabled: false }])
    await expect(h.svc.login(loginFor(ENV_ISS))).rejects.toMatchObject({ status: 403 })
  })
})

describe('launch uses the platform the login was for', () => {
  it('launches a registered platform with its own deployment and key set', async () => {
    const h = setup()
    const s = await launchedB(h)
    expect(s.platformId).toBe('p1')
    expect(h.calls.map((c) => c.url)).toContain('https://b.example/jwks')
    expect(h.calls.map((c) => c.url)).not.toContain(`${ENV_ISS}/api/lti/platform/jwks`)
  })

  it('refuses a token from another platform presented on this login', async () => {
    const h = setup()
    // a login for B, finished with a token platform C signed (same client id, valid for C)
    const b = await login(h, 'https://b.example')
    const forC = token(
      b.nonce,
      { iss: 'https://c.example', deployment: 'dep-c', lineitem: 'https://c.example/l' },
      keysC
    )
    await expect(h.svc.launch(forC, b.state, b.state)).rejects.toMatchObject({ status: 401 })
    // the built-in platform's token, signed by its own key
    const b2 = await login(h, 'https://b.example')
    await expect(h.svc.launch(asA(b2.nonce), b2.state, b2.state)).rejects.toMatchObject({
      status: 401,
    })
    // B's key but another platform's claimed issuer
    const b3 = await login(h, 'https://b.example')
    const lie = token(
      b3.nonce,
      { iss: 'https://c.example', deployment: 'dep-b', lineitem: LINEITEM_B },
      keysB
    )
    await expect(h.svc.launch(lie, b3.state, b3.state)).rejects.toThrow('Wrong issuer')
  })

  it('does not take the platform from the token: a token naming B on a built-in login fails', async () => {
    const h = setup()
    const a = await login(h, ENV_ISS)
    await expect(h.svc.launch(asB(a.nonce), a.state, a.state)).rejects.toMatchObject({
      status: 401,
    })
    expect(h.calls.map((c) => c.url)).not.toContain('https://b.example/jwks')
  })

  it("refuses another platform's deployment id", async () => {
    const h = setup()
    const b = await login(h, 'https://b.example')
    await expect(
      h.svc.launch(asB(b.nonce, { deployment: 'dep-c' }), b.state, b.state)
    ).rejects.toThrow('Unknown deployment')
    const b2 = await login(h, 'https://b.example')
    await expect(
      h.svc.launch(asB(b2.nonce, { deployment: '1' }), b2.state, b2.state)
    ).rejects.toThrow('Unknown deployment')
  })

  it('wants the score endpoint on the launching platform’s own origin', async () => {
    const h = setup()
    for (const lineitem of [
      LINEITEM_A,
      'https://c.example/l',
      'https://b.example.evil.example/l',
    ]) {
      const b = await login(h, 'https://b.example')
      await expect(h.svc.launch(asB(b.nonce, { lineitem }), b.state, b.state)).rejects.toThrow(
        'Score endpoint is not on the platform'
      )
    }
  })

  it('keeps a key set per platform: one platform’s key never verifies another’s token', async () => {
    const h = setup()
    await launchedB(h)
    const c = await login(h, 'https://c.example')
    const t = token(
      c.nonce,
      { iss: 'https://c.example', deployment: 'dep-c', lineitem: 'https://c.example/l' },
      keysB
    )
    await expect(h.svc.launch(t, c.state, c.state)).rejects.toMatchObject({ status: 401 })
    expect(h.calls.filter((x) => x.url === 'https://c.example/jwks')).toHaveLength(1)
  })

  it('does not launch a state twice', async () => {
    const h = setup()
    const b = await login(h, 'https://b.example')
    await h.svc.launch(asB(b.nonce), b.state, b.state)
    await expect(h.svc.launch(asB(b.nonce), b.state, b.state)).rejects.toThrow(
      'Unknown or expired state'
    )
  })
})

describe('the session carries the platform', () => {
  it('names the platform and keeps the learner’s id apart from every other platform’s', async () => {
    const h = setup()
    const s = await launchedB(h)
    expect(s).toMatchObject({ platformId: 'p1', platformSub: 'u1', sub: 'lti:p1:u1' })
    const { state, nonce } = await login(h, 'https://c.example')
    const c = sessionOf(
      await h.svc.launch(
        token(
          nonce,
          { iss: 'https://c.example', deployment: 'dep-c', lineitem: 'https://c.example/l' },
          keysC
        ),
        state,
        state
      )
    )
    expect(c.sub).toBe('lti:p2:u1')
    // the built-in platform keeps bare ids and carries no platform id (tokens as before)
    const a = await login(h, ENV_ISS)
    const own = sessionOf(await h.svc.launch(asA(a.nonce), a.state, a.state))
    expect(own.sub).toBe('u1')
    expect(own.platformId).toBeUndefined()
    expect(own.platformSub).toBeUndefined()
  })

  it('a platform cannot launch as another platform’s learner by choosing their sub', async () => {
    const h = setup()
    const s = await launchedB(h, { sub: 'user_clerk_victim' })
    expect(s.sub).toBe('lti:p1:user_clerk_victim')
    expect(s.sub).not.toBe('user_clerk_victim')
  })

  it('a table row for the built-in pair keeps bare ids but names the row', async () => {
    const h = setup([
      {
        ...platformB,
        issuer: ENV_ISS,
        deploymentId: '1',
        jwksUrl: `${ENV_ISS}/api/lti/platform/jwks`,
      },
    ])
    const a = await login(h, ENV_ISS)
    const s = sessionOf(await h.svc.launch(asA(a.nonce), a.state, a.state))
    expect(s).toMatchObject({ sub: 'u1', platformId: 'p1' })
    expect(s.platformSub).toBeUndefined()
  })

  it('rejects a session token whose platform fields are not strings', () => {
    const base = { sub: 's', ref: 'r', lineitem: 'l', jti: 'j', iat: 1, exp: 9_999_999_999 }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { signSession } = require('./lti-session')
    expect(() => verifySession(signSession({ ...base, platformId: 5 }), 2)).toThrow()
    expect(() => verifySession(signSession({ ...base, platformSub: '' }), 2)).toThrow()
    expect(verifySession(signSession({ ...base, platformId: 'p1' }), 2).platformId).toBe('p1')
  })

  it('a launch from a platform only reaches this platform’s return links', async () => {
    const h = setup()
    const own = await launchedB(h, {
      extra: { [CLAIM.launchPresentation]: { return_url: 'https://b.example/back' } },
    })
    expect(own.returnUrl).toBe('https://b.example/back')
    // a LearnDifferently address is accepted for the built-in platform only
    const learn = await launchedB(h, {
      extra: { [CLAIM.launchPresentation]: { return_url: 'http://learn.test/x' } },
    })
    expect(learn.returnUrl).toBeUndefined()
    const other = await launchedB(h, {
      extra: { [CLAIM.launchPresentation]: { return_url: 'https://c.example/x' } },
    })
    expect(other.returnUrl).toBeUndefined()
    const a = await login(h, ENV_ISS)
    const builtIn = sessionOf(
      await h.svc.launch(
        asA(a.nonce, {
          extra: { [CLAIM.launchPresentation]: { return_url: 'http://learn.test/x' } },
        }),
        a.state,
        a.state
      )
    )
    expect(builtIn.returnUrl).toBe('http://learn.test/x')
  })
})

describe('the score goes back to the platform that launched it', () => {
  const result = (userId: string) => ({
    id: 'r1',
    userId,
    scenarioId: 'S1',
    overallScore: 72,
    completedAt: new Date(),
    dimensionScores: [{ dimension: 'Clarity', score: 80 }],
  })

  async function tokenRequest(h: H) {
    const req = h.calls.find((c) => c.url.endsWith('/token'))!
    const form = new URLSearchParams(req.init!.body as URLSearchParams)
    const assertion = form.get('client_assertion')!
    const claims = JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString())
    return { url: req.url, claims }
  }

  it('asks the launching platform’s token endpoint, as its client id, for the score scope', async () => {
    const h = setup()
    const s = await launchedB(h)
    h.prisma.simulationResult.findUnique.mockResolvedValue(result(s.sub))
    await h.svc.complete({ ...s }, 'r1')
    const t = await tokenRequest(h)
    expect(t.url).toBe('https://b.example/token')
    expect(t.claims).toMatchObject({
      iss: 'ld-platform',
      sub: 'ld-platform',
      aud: 'https://b.example/token',
    })
    const score = h.calls.find((c) => c.url === `${LINEITEM_B}/scores`)!
    expect((score.init!.headers as Row).Authorization).toBe('Bearer AT')
    // the platform's own learner id, not our prefixed one
    expect(JSON.parse(score.init!.body as string).userId).toBe('u1')
    expect(h.calls.some((c) => c.url.startsWith(ENV_ISS))).toBe(false)
  })

  it('uses a different client id and token endpoint for another platform', async () => {
    const h = setup([platformB, { ...platformC, clientId: 'c-client' }])
    const { state, nonce } = await login(h, 'https://c.example', 'c-client')
    const t = token(
      nonce,
      {
        aud: 'c-client',
        iss: 'https://c.example',
        deployment: 'dep-c',
        lineitem: 'https://c.example/l',
      },
      keysC
    )
    const s = sessionOf(await h.svc.launch(t, state, state))
    h.prisma.simulationResult.findUnique.mockResolvedValue(result(s.sub))
    await h.svc.complete(s, 'r1')
    const req = await tokenRequest(h)
    expect(req.url).toBe('https://c.example/token')
    expect(req.claims).toMatchObject({ iss: 'c-client', aud: 'https://c.example/token' })
  })

  it('a token from before platforms existed returns to the built-in platform', async () => {
    const h = setup()
    const old: LtiSession = {
      sub: 'u1',
      ref: 'S1',
      lineitem: LINEITEM_A,
      jti: 'j',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }
    h.prisma.simulationResult.findUnique.mockResolvedValue(result('u1'))
    await h.svc.complete(old, 'r1')
    const t = await tokenRequest(h)
    expect(t.url).toBe(`${ENV_ISS}/api/lti/platform/token`)
    expect(t.claims).toMatchObject({ iss: 'ld-platform', aud: `${ENV_ISS}/api/lti/platform/token` })
  })

  it('still returns the work of a platform switched off after the launch', async () => {
    const h = setup()
    const s = await launchedB(h)
    await h.registry.setEnabled({ userId: 'u', userName: 'U' }, 'p1', false)
    h.prisma.simulationResult.findUnique.mockResolvedValue(result(s.sub))
    await expect(h.svc.complete(s, 'r1')).resolves.toMatchObject({ score: 72 })
    expect((await tokenRequest(h)).url).toBe('https://b.example/token')
    // ...but it cannot start a new login
    await expect(h.svc.login(loginFor('https://b.example'))).rejects.toMatchObject({ status: 403 })
  })

  it('fails (502) when the session names a platform that is not registered', async () => {
    const h = setup()
    const s = await launchedB(h)
    h.prisma.simulationResult.findUnique.mockResolvedValue(result(s.sub))
    await expect(h.svc.complete({ ...s, platformId: 'ghost' }, 'r1')).rejects.toMatchObject({
      status: 502,
    })
    expect(h.calls.filter((c) => c.url.endsWith('/token'))).toHaveLength(0)
  })

  it('a typed interview returns to the platform it was launched from', async () => {
    const h = setup()
    const { state, nonce } = await login(h, 'https://b.example')
    const page = await h.svc.launch(asB(nonce, { custom: { ref: 'T1' } }), state, state)
    if (typeof page !== 'string') throw new Error('expected the typed page')
    const submission = /name="submission" value="([^"]+)"/.exec(page)![1]
    const claims = JSON.parse(Buffer.from(submission.split('.')[0], 'base64url').toString())
    expect(claims).toMatchObject({ platformId: 'p1', platformSub: 'u1', sub: 'lti:p1:u1' })
    const out = await h.svc.submit({ submission, answer_0: 'x'.repeat(600) })
    expect(out.status).toBe(200)
    expect((await tokenRequest(h)).url).toBe('https://b.example/token')
    expect(h.calls.some((c) => c.url === `${LINEITEM_B}/scores`)).toBe(true)
  })

  it('a tampered submission cannot move the score to another platform', async () => {
    const h = setup()
    const { state, nonce } = await login(h, 'https://b.example')
    const page = (await h.svc.launch(asB(nonce, { custom: { ref: 'T1' } }), state, state)) as string
    const [body, sig] = /name="submission" value="([^"]+)"/.exec(page)![1].split('.')
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString())
    const forged = Buffer.from(JSON.stringify({ ...claims, platformId: 'p2' })).toString(
      'base64url'
    )
    await expect(
      h.svc.submit({ submission: `${forged}.${sig}`, answer_0: 'x' })
    ).rejects.toMatchObject({ status: 401 })
  })
})

describe('built-in platform behaviour is unchanged', () => {
  it('logs in and launches from settings alone when the table is empty', async () => {
    const h = setup([])
    const a = await login(h, ENV_ISS)
    const s = sessionOf(await h.svc.launch(asA(a.nonce), a.state, a.state))
    expect(s).toMatchObject({ sub: 'u1', ref: 'S1', lineitem: LINEITEM_A })
    expect(Object.keys(s)).not.toContain('platformId')
    await expect(h.svc.login(loginFor('https://b.example'))).rejects.toThrow('Unknown platform')
  })

  it('verifyJwt is still given the settings issuer and client id', async () => {
    const h = setup([])
    const a = await login(h, ENV_ISS)
    const bad = token(
      a.nonce,
      { iss: 'http://other.test', deployment: '1', lineitem: LINEITEM_A },
      keysA
    )
    await expect(h.svc.launch(bad, a.state, a.state)).rejects.toThrow('Wrong issuer')
  })
})
