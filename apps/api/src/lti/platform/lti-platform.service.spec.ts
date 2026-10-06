import { HttpException } from '@nestjs/common'
import type { PrismaService } from '../../prisma/prisma.service'
import type { LearnerService } from '../../learn/learner.service'
import {
  AGS_SCOPE_SCORE,
  BRAND_CLAIM,
  CLAIM,
  DIMENSIONS_FIELD,
  LEARNER_ROLE,
  generateKeyPair,
  jwksOf,
  signJwt,
  verifyJwt,
} from '../lti-spec'
import { platformRegistration, registeredTools } from './lti-platform-config'
import { MemoryLtiStore } from '../lti-store'
import { LtiPlatformService, autoSubmitForm, escapeHtml } from './lti-platform.service'

const prisma = {
  cohort: { findUnique: jest.fn() },
  institution: { findUnique: jest.fn() },
  enrollment: { findUnique: jest.fn() },
  courseItem: { findUnique: jest.fn() },
  itemProgress: { findFirst: jest.fn() },
}
const learner = { recordToolResult: jest.fn() }

const tool = registeredTools()[0]
const reg = platformRegistration()
const toolKeys = generateKeyPair()
const PAST = new Date('2020-01-01T00:00:00Z')
const FUTURE = new Date('2099-01-01T00:00:00Z')
const nowS = () => Math.floor(Date.now() / 1000)

let service: LtiPlatformService
let store: MemoryLtiStore

const makeService = (shared = store) =>
  new LtiPlatformService(
    prisma as unknown as PrismaService,
    learner as unknown as LearnerService,
    shared
  )

beforeEach(() => {
  process.env.LTI_LEARN_URL = 'http://learn.test/'
  jest.resetAllMocks()
  prisma.cohort.findUnique.mockResolvedValue({ courseId: 'c1', startsAt: PAST, endsAt: FUTURE })
  prisma.enrollment.findUnique.mockResolvedValue({ status: 'enrolled' })
  prisma.courseItem.findUnique.mockResolvedValue({
    id: 'i1',
    type: 'tool',
    config: { toolId: 'id-interview', ref: 'cna-interview' },
    module: { courseId: 'c1' },
  })
  learner.recordToolResult.mockResolvedValue({})
  store = new MemoryLtiStore()
  service = makeService()
  service.fetchImpl = jest.fn(
    async () => new Response(JSON.stringify(jwksOf(toolKeys)))
  ) as unknown as typeof fetch
})

const reject = async (p: Promise<unknown>, status: number, text?: string) => {
  const err = await p.then(
    () => null,
    (e) => e
  )
  expect(err).toBeInstanceOf(HttpException)
  expect((err as HttpException).getStatus()).toBe(status)
  if (text) expect(JSON.stringify((err as HttpException).getResponse())).toContain(text)
}

const hintOf = async () => (await service.startLaunch('u1', 'k1', 'i1')).fields.lti_message_hint
const authParams = async (over: Record<string, unknown> = {}) => ({
  scope: 'openid',
  response_type: 'id_token',
  response_mode: 'form_post',
  prompt: 'none',
  client_id: tool.clientId,
  redirect_uri: tool.launchUrl,
  login_hint: 'u1',
  lti_message_hint: await hintOf(),
  state: 'st"<1>',
  nonce: 'n1',
  ...over,
})
const field = (html: string, name: string) =>
  html.match(new RegExp(`name="${name}" value="([^"]*)"`))?.[1] as string

describe('jwks', () => {
  it('publishes the platform public key only', () => {
    const { keys } = service.jwks()
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatchObject({ alg: 'RS256', use: 'sig' })
    expect(keys[0]).not.toHaveProperty('d')
  })
})

describe('keys and secrets', () => {
  const saved = { ...process.env }
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
    Object.assign(process.env, saved)
  })

  it('refuses to boot in production without the LTI keys, secrets and learn URL', () => {
    process.env.NODE_ENV = 'production'
    for (const k of [
      'LTI_PLATFORM_PRIVATE_KEY',
      'LTI_TOOL_PRIVATE_KEY',
      'LTI_TOOL_SECRET',
      'LTI_HINT_SECRET',
      'LTI_API_BASE',
      'LTI_LEARN_URL',
      'LTI_ID_WEB_URL',
    ])
      delete process.env[k]
    expect(() => makeService()).toThrow(/LTI_PLATFORM_PRIVATE_KEY.*LTI_HINT_SECRET.*LTI_LEARN_URL/)
    process.env.LTI_PLATFORM_PRIVATE_KEY = generateKeyPair().privateKeyPem
    process.env.LTI_TOOL_PRIVATE_KEY = generateKeyPair().privateKeyPem
    process.env.LTI_TOOL_SECRET = 's'
    expect(() => makeService()).toThrow('LTI_HINT_SECRET')
    process.env.LTI_HINT_SECRET = 'h'
    expect(() => makeService()).toThrow('LTI_API_BASE')
    process.env.LTI_API_BASE = 'https://api.test/api'
    expect(() => makeService()).toThrow('LTI_LEARN_URL')
    process.env.LTI_LEARN_URL = 'https://learn.test'
    expect(() => makeService()).toThrow('LTI_ID_WEB_URL')
    process.env.LTI_ID_WEB_URL = 'https://id.test'
    expect(() => makeService()).not.toThrow()
  })

  it('publishes the previous key too, verifies tokens it signed, and signs new ones with the current key', async () => {
    const previous = generateKeyPair()
    const current = generateKeyPair()
    process.env.LTI_PLATFORM_PRIVATE_KEY = current.privateKeyPem
    process.env.LTI_PLATFORM_PREVIOUS_PRIVATE_KEY = previous.privateKeyPem
    const rotated = makeService()
    const { keys } = rotated.jwks()
    expect(keys.map((k) => k.kid)).toEqual([current.kid, previous.kid])
    expect(JSON.stringify(keys)).not.toContain('"d"')

    // an access token issued before the rotation (signed with the previous key) is still accepted
    const oldToken = signJwt(
      {
        iss: reg.issuer,
        sub: tool.clientId,
        aud: tool.clientId,
        iat: nowS(),
        exp: nowS() + 3600,
        scope: AGS_SCOPE_SCORE,
      },
      previous
    )
    await verifyJwt(oldToken, {
      issuer: reg.issuer,
      audience: tool.clientId,
      keyFor: async (kid) => keys.find((k) => k.kid === kid),
    })
    await rotated.receiveScore(`Bearer ${oldToken}`, 'k1', 'i1', {
      userId: 'u1',
      scoreGiven: 5,
      scoreMaximum: 10,
      activityProgress: 'Completed',
      gradingProgress: 'FullyGraded',
      timestamp: new Date().toISOString(),
    })
    expect(learner.recordToolResult).toHaveBeenCalled()

    // new tokens carry the new kid
    const html = await rotated.authenticate({
      scope: 'openid',
      response_type: 'id_token',
      client_id: tool.clientId,
      redirect_uri: tool.launchUrl,
      login_hint: 'u1',
      lti_message_hint: (await rotated.startLaunch('u1', 'k1', 'i1')).fields.lti_message_hint,
      state: 's',
      nonce: 'n',
    })
    const idToken = field(html, 'id_token')
    expect(JSON.parse(Buffer.from(idToken.split('.')[0], 'base64url').toString()).kid).toBe(
      current.kid
    )
  })
})

describe('startLaunch', () => {
  it('returns the tool login form fields', async () => {
    const out = await service.startLaunch('u1', 'k1', 'i1')
    expect(out.action).toBe(tool.loginUrl)
    expect(out.fields).toMatchObject({
      iss: reg.issuer,
      login_hint: 'u1',
      target_link_uri: tool.launchUrl,
      client_id: tool.clientId,
      lti_deployment_id: tool.deploymentId,
    })
    expect(out.fields.lti_message_hint).toBeTruthy()
  })

  describe('return origin', () => {
    const returnUrlFor = async (origin?: string) => {
      const hint = (await service.startLaunch('u1', 'k1', 'i1', origin)).fields.lti_message_hint
      const html = await service.authenticate(await authParams({ lti_message_hint: hint }))
      const claims = await verifyJwt(field(html, 'id_token'), {
        issuer: reg.issuer,
        audience: tool.clientId,
        nonce: 'n1',
        keyFor: async () => service.jwks().keys[0],
      })
      return claims[CLAIM.launchPresentation].return_url
    }
    const hintClaims = (hint: string) =>
      JSON.parse(Buffer.from(hint.split('.')[0], 'base64url').toString())

    beforeEach(() => {
      process.env.LTI_LEARN_URL = 'https://learn.test'
    })

    it('carries a tenant host in the hint and returns the learner to it', async () => {
      const out = await service.startLaunch('u1', 'k1', 'i1', 'https://delaware.learn.test')
      expect(hintClaims(out.fields.lti_message_hint).returnOrigin).toBe(
        'https://delaware.learn.test'
      )
      expect(await returnUrlFor('https://delaware.learn.test')).toBe(
        'https://delaware.learn.test/lms/learning/k1/i1'
      )
    })

    it('accepts the apex host and the exact local-development origin', async () => {
      expect(await returnUrlFor('https://learn.test')).toBe('https://learn.test/lms/learning/k1/i1')
      process.env.LTI_LEARN_URL = 'http://localhost:5174'
      expect(await returnUrlFor('http://localhost:5174')).toBe(
        'http://localhost:5174/lms/learning/k1/i1'
      )
    })

    it.each([
      ['https://evil.test'],
      ['https://evil-learn.test'],
      ['https://learn.test.evil.test'],
      ['http://delaware.learn.test'],
      ['https://delaware.learn.test:8443'],
      ['https://learn.test@evil.test'],
      ['javascript:alert(1)'],
      ['null'],
      ['not a url'],
      [''],
    ])('ignores a bad origin %p and falls back to LTI_LEARN_URL', async (origin) => {
      const out = await service.startLaunch('u1', 'k1', 'i1', origin)
      expect(hintClaims(out.fields.lti_message_hint).returnOrigin).toBeUndefined()
      expect(await returnUrlFor(origin)).toBe('https://learn.test/lms/learning/k1/i1')
    })

    it('falls back when no origin is given', async () => {
      expect(await returnUrlFor(undefined)).toBe('https://learn.test/lms/learning/k1/i1')
    })
  })

  it('refuses a learner who is not enrolled, an ended cohort, and a non-tool item', async () => {
    prisma.enrollment.findUnique.mockResolvedValue(null)
    await reject(service.startLaunch('u1', 'k1', 'i1'), 404)
    prisma.enrollment.findUnique.mockResolvedValue({ status: 'withdrawn' })
    await reject(service.startLaunch('u1', 'k1', 'i1'), 404)
    prisma.enrollment.findUnique.mockResolvedValue({ status: 'enrolled' })
    prisma.cohort.findUnique.mockResolvedValue({ courseId: 'c1', startsAt: PAST, endsAt: PAST })
    await reject(service.startLaunch('u1', 'k1', 'i1'), 409)
    prisma.cohort.findUnique.mockResolvedValue({ courseId: 'c1', startsAt: PAST, endsAt: FUTURE })
    prisma.courseItem.findUnique.mockResolvedValue({
      type: 'lesson',
      config: {},
      module: { courseId: 'c1' },
    })
    await reject(service.startLaunch('u1', 'k1', 'i1'), 404)
  })

  it('refuses an item from another course or an unregistered tool', async () => {
    prisma.courseItem.findUnique.mockResolvedValue({
      type: 'tool',
      config: { toolId: 'id-interview', ref: 'x' },
      module: { courseId: 'other' },
    })
    await reject(service.startLaunch('u1', 'k1', 'i1'), 404)
    prisma.courseItem.findUnique.mockResolvedValue({
      type: 'tool',
      config: { toolId: 'nope', ref: 'x' },
      module: { courseId: 'c1' },
    })
    await reject(service.startLaunch('u1', 'k1', 'i1'), 409)
  })
})

describe('assessment attempts and time limit', () => {
  const assessment = (config: object = {}) =>
    prisma.courseItem.findUnique.mockResolvedValue({
      id: 'i1',
      type: 'tool',
      config: { toolId: 'id-assessment', ref: 'cna-pre', ...config },
      module: { courseId: 'c1' },
    })
  const customOf = async () => {
    const html = await service.authenticate(await authParams())
    const claims = await verifyJwt(field(html, 'id_token'), {
      issuer: reg.issuer,
      audience: tool.clientId,
      nonce: 'n1',
      keyFor: async () => service.jwks().keys[0],
    })
    return claims[CLAIM.custom]
  }

  it('sends attempt 1 and no time limit by default', async () => {
    assessment()
    prisma.itemProgress.findFirst.mockResolvedValue(null)
    expect(await customOf()).toEqual({ ref: 'cna-pre', tool: 'id-assessment', attempt: 1 })
  })

  it('sends the time limit and the next attempt number after the recorded scores', async () => {
    assessment({ maxAttempts: 3, timeLimitMinutes: 45 })
    prisma.itemProgress.findFirst.mockResolvedValue({ attempts: 1 })
    expect(await customOf()).toEqual({
      ref: 'cna-pre',
      tool: 'id-assessment',
      attempt: 2,
      timeLimitMinutes: 45,
    })
  })

  it('resumes an unfinished attempt: with no new score the attempt number is unchanged', async () => {
    assessment({ maxAttempts: 3 })
    prisma.itemProgress.findFirst.mockResolvedValue({ attempts: 1 })
    expect(((await customOf()) as { attempt: number }).attempt).toBe(2)
    expect(((await customOf()) as { attempt: number }).attempt).toBe(2)
  })

  it('refuses a launch with 409 once all attempts are used, and allows the last one', async () => {
    assessment({ maxAttempts: 2 })
    prisma.itemProgress.findFirst.mockResolvedValue({ attempts: 1 })
    await expect(service.startLaunch('u1', 'k1', 'i1')).resolves.toBeTruthy()
    prisma.itemProgress.findFirst.mockResolvedValue({ attempts: 2 })
    await reject(service.startLaunch('u1', 'k1', 'i1'), 409, 'You have used all 2 attempts.')
    assessment()
    prisma.itemProgress.findFirst.mockResolvedValue({ attempts: 1 })
    await reject(service.startLaunch('u1', 'k1', 'i1'), 409, 'You have used all 1 attempts.')
  })

  it('refuses the OIDC step with 409 when the attempts ran out after the hint was minted', async () => {
    assessment()
    prisma.itemProgress.findFirst.mockResolvedValue(null)
    const params = await authParams() // minted while an attempt was left (e.g. another tab)
    prisma.itemProgress.findFirst.mockResolvedValue({ attempts: 1 })
    await reject(service.authenticate(params), 409, 'You have used all 1 attempts.')
  })

  it('leaves interview tools unlimited and without attempt or time-limit claims', async () => {
    prisma.itemProgress.findFirst.mockResolvedValue({ attempts: 50 })
    await expect(service.startLaunch('u1', 'k1', 'i1')).resolves.toBeTruthy()
    prisma.courseItem.findUnique.mockResolvedValue({
      id: 'i1',
      type: 'tool',
      config: { toolId: 'id-interview', ref: 'x', maxAttempts: 1, timeLimitMinutes: 30 },
      module: { courseId: 'c1' },
    })
    expect(await customOf()).toEqual({ ref: 'x', tool: 'id-interview' })
  })
})

describe('auth for an assessment item', () => {
  it('puts the tool id and the assessment slug in the custom claim', async () => {
    prisma.courseItem.findUnique.mockResolvedValue({
      id: 'i1',
      type: 'tool',
      config: { toolId: 'id-assessment', ref: 'cna-pre' },
      module: { courseId: 'c1' },
    })
    const html = await service.authenticate(await authParams())
    const claims = await verifyJwt(field(html, 'id_token'), {
      issuer: reg.issuer,
      audience: tool.clientId,
      nonce: 'n1',
      keyFor: async () => service.jwks().keys[0],
    })
    expect(claims[CLAIM.custom]).toEqual({ ref: 'cna-pre', tool: 'id-assessment', attempt: 1 })
  })
})

describe('auth', () => {
  it('replies with a form posting a signed id_token and the state back to the launch URL', async () => {
    const html = await service.authenticate(await authParams())
    expect(html).toContain(`action="${escapeHtml(tool.launchUrl)}"`)
    expect(field(html, 'state')).toBe('st&quot;&lt;1&gt;')
    const idToken = field(html, 'id_token')
    const claims = await verifyJwt(idToken, {
      issuer: reg.issuer,
      audience: tool.clientId,
      nonce: 'n1',
      keyFor: async () => service.jwks().keys[0],
    })
    expect(claims.sub).toBe('u1')
    expect(claims[CLAIM.messageType]).toBe('LtiResourceLinkRequest')
    expect(claims[CLAIM.version]).toBe('1.3.0')
    expect(claims[CLAIM.deploymentId]).toBe(tool.deploymentId)
    expect(claims[CLAIM.targetLinkUri]).toBe(tool.launchUrl)
    expect(claims[CLAIM.resourceLink]).toEqual({ id: 'i1' })
    expect(claims[CLAIM.context]).toEqual({ id: 'k1' })
    expect(claims[CLAIM.roles]).toEqual([LEARNER_ROLE])
    expect(claims[CLAIM.custom]).toEqual({ ref: 'cna-interview', tool: 'id-interview' })
    expect(claims[CLAIM.launchPresentation]).toEqual({
      document_target: 'window',
      return_url: 'http://learn.test/lms/learning/k1/i1',
    })
    expect(claims[CLAIM.agsEndpoint].scope).toEqual([AGS_SCOPE_SCORE])
    expect(claims[CLAIM.agsEndpoint].lineitem).toMatch(/\/lti\/platform\/ags\/k1\/lineitems\/i1$/)
    expect(claims.exp - claims.iat).toBe(300)
  })

  it('rejects a replayed lti_message_hint', async () => {
    const params = await authParams()
    await service.authenticate(params)
    await reject(service.authenticate(params), 400, 'already used')
  })

  it.each([
    ['scope', { scope: 'profile' }],
    ['response_type', { response_type: 'code' }],
    ['response_mode', { response_mode: 'query' }],
    ['prompt', { prompt: 'login' }],
    ['state', { state: '' }],
    ['nonce', { nonce: '' }],
    ['client_id', { client_id: 'someone-else' }],
    ['redirect_uri', { redirect_uri: 'https://evil.example/launch' }],
    ['login_hint', { login_hint: 'u2' }],
    ['hint', { lti_message_hint: 'garbage' }],
  ])('rejects a bad %s', async (_n, over) => {
    await reject(service.authenticate(await authParams(over)), 400)
  })

  it('rejects a tampered or expired hint', async () => {
    const hint = await hintOf()
    const [body, mac] = hint.split('.')
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), userId: 'u2' })
    ).toString('base64url')
    await reject(
      service.authenticate(
        await authParams({ lti_message_hint: `${forged}.${mac}`, login_hint: 'u2' })
      ),
      400
    )
    jest.useFakeTimers().setSystemTime(Date.now() + 61_000)
    try {
      await reject(
        service.authenticate(await authParams({ lti_message_hint: hint })),
        400,
        'expired'
      )
    } finally {
      jest.useRealTimers()
    }
  })

  it('accepts a hint within its 60 second lifetime', async () => {
    const hint = await hintOf()
    jest.useFakeTimers().setSystemTime(Date.now() + 59_000)
    try {
      expect(await service.authenticate(await authParams({ lti_message_hint: hint }))).toContain(
        'id_token'
      )
    } finally {
      jest.useRealTimers()
    }
  })

  it('re-authorizes the learner: a withdrawn learner or a closed cohort gets no id_token', async () => {
    const params = await authParams()
    prisma.enrollment.findUnique.mockResolvedValue({ status: 'withdrawn' })
    await reject(service.authenticate(params), 404)
    prisma.enrollment.findUnique.mockResolvedValue(null)
    await reject(service.authenticate(params), 404)
    prisma.enrollment.findUnique.mockResolvedValue({ status: 'enrolled' })
    prisma.cohort.findUnique.mockResolvedValue({ courseId: 'c1', startsAt: PAST, endsAt: PAST })
    await reject(service.authenticate(params), 409)
    // the refused attempts did not burn the hint
    prisma.cohort.findUnique.mockResolvedValue({ courseId: 'c1', startsAt: PAST, endsAt: FUTURE })
    expect(await service.authenticate(params)).toContain('id_token')
  })

  it('derives the hint secret from LTI_HINT_SECRET when set, so instances with different keys agree', async () => {
    const make = () => makeService()
    process.env.LTI_HINT_SECRET = 'shared-secret'
    try {
      const a = make()
      const b = make()
      const hint = (await a.startLaunch('u1', 'k1', 'i1')).fields.lti_message_hint
      expect(await b.authenticate(await authParams({ lti_message_hint: hint }))).toContain(
        'id_token'
      )
    } finally {
      delete process.env.LTI_HINT_SECRET
    }
  })

  it('does not honour a hint from another service instance with a different key', async () => {
    const other = makeService(new MemoryLtiStore())
    const foreign = (await other.startLaunch('u1', 'k1', 'i1')).fields.lti_message_hint
    await reject(service.authenticate(await authParams({ lti_message_hint: foreign })), 400)
  })

  it('keeps a hint single use across instances that share a store', async () => {
    process.env.LTI_HINT_SECRET = 'shared-secret'
    try {
      const a = makeService()
      const b = makeService()
      const hint = (await a.startLaunch('u1', 'k1', 'i1')).fields.lti_message_hint
      const params = await authParams({ lti_message_hint: hint })
      expect(await a.authenticate(params)).toContain('id_token')
      await reject(b.authenticate(params), 400, 'already used')
    } finally {
      delete process.env.LTI_HINT_SECRET
    }
  })

  it('answers more than 30 auth requests a minute from one IP with a 429', async () => {
    for (let i = 0; i < 30; i++) await service.authenticate({}, '9.9.9.9').catch(() => undefined) // 400s still count
    await reject(service.authenticate({}, '9.9.9.9'), 429)
    await reject(service.authenticate({}, '8.8.8.8'), 400) // another IP is unaffected
  })

  it('rejects a hint whose item no longer launches a registered tool', async () => {
    const params = await authParams()
    prisma.courseItem.findUnique.mockResolvedValue({
      type: 'tool',
      config: { toolId: 'nope', ref: 'x' },
      module: { courseId: 'c1' },
    })
    await reject(service.authenticate(params), 409)
  })
})

describe('html form', () => {
  it('escapes every value', () => {
    const html = autoSubmitForm('https://x/"><script>', { 'a"b': `<img onerror='x'>&` })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).toContain('name="a&quot;b" value="&lt;img onerror=&#39;x&#39;&gt;&amp;"')
  })
})

describe('token', () => {
  const assertion = (over: Record<string, unknown> = {}, key = toolKeys) =>
    signJwt(
      {
        iss: tool.clientId,
        sub: tool.clientId,
        aud: reg.tokenUrl,
        iat: nowS(),
        exp: nowS() + 300,
        jti: `j-${Math.random()}`,
        ...over,
      },
      key
    )
  const body = (over: Record<string, unknown> = {}) => ({
    grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: assertion(),
    scope: AGS_SCOPE_SCORE,
    ...over,
  })

  it('issues a platform-signed bearer token for a good assertion', async () => {
    const out = await service.token(body())
    expect(out).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: AGS_SCOPE_SCORE })
    const claims = await verifyJwt(out.access_token, {
      issuer: reg.issuer,
      audience: tool.clientId,
      keyFor: async () => service.jwks().keys[0],
    })
    expect(claims.scope).toBe(AGS_SCOPE_SCORE)
    expect(service.fetchImpl).toHaveBeenCalledWith(tool.jwksUrl, expect.anything())
  })

  it('rejects a replayed jti across instances that share a store', async () => {
    const other = makeService()
    other.fetchImpl = service.fetchImpl
    const b = body({ client_assertion: assertion({ jti: 'shared' }) })
    await service.token(b)
    await reject(other.token(b), 401, 'already used')
  })

  it('answers more than 60 token requests a minute per client with a 429', async () => {
    for (let i = 0; i < 60; i++) await service.token(body({ client_assertion: assertion() }))
    await reject(service.token(body({ client_assertion: assertion() })), 429, 'rate_limited')
    store.now = () => Date.now() + 61_000
    await service.token(body({ client_assertion: assertion() }))
  })

  it("does not let unsigned requests use up a client's token budget", async () => {
    for (let i = 0; i < 70; i++)
      await service
        .token(body({ client_assertion: assertion({}, generateKeyPair()) }))
        .catch(() => 0)
    await service.token(body())
  })

  it('rejects a replayed jti', async () => {
    const b = body({ client_assertion: assertion({ jti: 'same' }) })
    await service.token(b)
    await reject(service.token(b), 401, 'already used')
  })

  it('rejects a bad signature, wrong audience, wrong sub, expiry, missing jti, unknown client', async () => {
    await reject(service.token(body({ client_assertion: assertion({}, generateKeyPair()) })), 401)
    await reject(
      service.token(body({ client_assertion: assertion({ aud: 'https://other/token' }) })),
      401,
      'Client authentication failed'
    )
    await reject(service.token(body({ client_assertion: assertion({ sub: 'x' }) })), 401, 'sub')
    await reject(
      service.token(body({ client_assertion: assertion({ exp: nowS() - 600 }) })),
      401,
      'Client authentication failed'
    )
    await reject(
      service.token(body({ client_assertion: assertion({ jti: undefined }) })),
      401,
      'jti'
    )
    await reject(
      service.token(body({ client_assertion: assertion({ iss: 'nobody' }) })),
      401,
      'Unknown'
    )
    await reject(service.token(body({ client_assertion: 'junk' })), 401)
  })

  it('does not echo verification internals in invalid_client', async () => {
    const err = await service
      .token(body({ client_assertion: assertion({ iss: tool.clientId, aud: 'https://other' }) }))
      .catch((e) => e)
    const text = JSON.stringify(err.getResponse())
    expect(text).not.toMatch(/audience|issuer|signature|expired|key/i)
  })

  it('rejects an assertion that lives longer than 10 minutes', async () => {
    await reject(
      service.token(body({ client_assertion: assertion({ exp: nowS() + 601 }) })),
      401,
      'lifetime'
    )
    await service.token(body({ client_assertion: assertion({ exp: nowS() + 600 }) }))
  })

  it('rejects the wrong grant, assertion type and scope', async () => {
    await reject(service.token(body({ grant_type: 'password' })), 400, 'unsupported_grant_type')
    await reject(service.token(body({ client_assertion_type: 'x' })), 400, 'invalid_request')
    await reject(service.token(body({ scope: 'https://other/scope' })), 400, 'invalid_scope')
  })
})

describe('scores', () => {
  const bearer = async (over: Record<string, unknown> = {}, key = service['keys']) =>
    `Bearer ${signJwt(
      {
        iss: reg.issuer,
        sub: tool.clientId,
        aud: tool.clientId,
        iat: nowS(),
        exp: nowS() + 3600,
        scope: AGS_SCOPE_SCORE,
        ...over,
      },
      key
    )}`
  const score = (over: Record<string, unknown> = {}) => ({
    userId: 'u1',
    scoreGiven: 7,
    scoreMaximum: 10,
    activityProgress: 'Completed',
    gradingProgress: 'FullyGraded',
    timestamp: new Date().toISOString(),
    ...over,
  })

  it('records a score as a percentage, with dimensions', async () => {
    const dims = { Clarity: 80 }
    await service.receiveScore(await bearer(), 'k1', 'i1', score({ [DIMENSIONS_FIELD]: dims }))
    expect(learner.recordToolResult).toHaveBeenCalledWith('u1', 'k1', 'i1', {
      scorePct: 70,
      reportedAt: expect.any(String),
      dimensions: dims,
    })
  })

  it('accepts a timestamp a little ahead of the clock', async () => {
    const timestamp = new Date(Date.now() + 4 * 60_000).toISOString()
    await service.receiveScore(await bearer(), 'k1', 'i1', score({ timestamp }))
    expect(learner.recordToolResult).toHaveBeenCalled()
  })

  it('needs a Bearer token', async () => {
    await reject(service.receiveScore(undefined, 'k1', 'i1', score()), 401)
    await reject(service.receiveScore('Basic abc', 'k1', 'i1', score()), 401)
    await reject(service.receiveScore('Bearer junk', 'k1', 'i1', score()), 401)
    expect(learner.recordToolResult).not.toHaveBeenCalled()
  })

  it('rejects tokens signed by someone else, for another audience, expired, or without the scope', async () => {
    await reject(service.receiveScore(await bearer({}, toolKeys), 'k1', 'i1', score()), 401)
    await reject(service.receiveScore(await bearer({ aud: 'other' }), 'k1', 'i1', score()), 401)
    await reject(
      service.receiveScore(await bearer({ exp: nowS() - 600 }), 'k1', 'i1', score()),
      401
    )
    await reject(service.receiveScore(await bearer({ sub: 'x' }), 'k1', 'i1', score()), 401)
    await reject(service.receiveScore(await bearer({ scope: 'other' }), 'k1', 'i1', score()), 403)
    expect(learner.recordToolResult).not.toHaveBeenCalled()
  })

  it('rejects a token for a different tool than the item launches', async () => {
    prisma.courseItem.findUnique.mockResolvedValue({
      type: 'tool',
      config: { toolId: 'other-tool', ref: 'x' },
      module: { courseId: 'c1' },
    })
    await reject(service.receiveScore(await bearer(), 'k1', 'i1', score()), 409)
    expect(learner.recordToolResult).not.toHaveBeenCalled()
  })

  it('accepts a score for an assessment item launched by the shared client', async () => {
    prisma.courseItem.findUnique.mockResolvedValue({
      type: 'tool',
      config: { toolId: 'id-assessment', ref: 'cna-pre' },
      module: { courseId: 'c1' },
    })
    await service.receiveScore(await bearer(), 'k1', 'i1', score())
    expect(learner.recordToolResult).toHaveBeenCalled()
  })

  it('rejects the wrong cohort or item', async () => {
    prisma.cohort.findUnique.mockResolvedValue(null)
    await reject(service.receiveScore(await bearer(), 'nope', 'i1', score()), 404)
    prisma.cohort.findUnique.mockResolvedValue({ courseId: 'c1', startsAt: PAST, endsAt: FUTURE })
    prisma.courseItem.findUnique.mockResolvedValue({
      type: 'tool',
      config: { toolId: 'id-interview', ref: 'x' },
      module: { courseId: 'other' },
    })
    await reject(service.receiveScore(await bearer(), 'k1', 'i1', score()), 404)
    prisma.courseItem.findUnique.mockResolvedValue(null)
    await reject(service.receiveScore(await bearer(), 'k1', 'nope', score()), 404)
    expect(learner.recordToolResult).not.toHaveBeenCalled()
  })

  it.each([
    ['no body', undefined],
    ['no user', score({ userId: '' })],
    ['negative', score({ scoreGiven: -1 })],
    ['over max', score({ scoreGiven: 11 })],
    ['zero max', score({ scoreMaximum: 0 })],
    ['text', score({ scoreGiven: '7' })],
    ['in progress', score({ activityProgress: 'InProgress' })],
    ['not graded', score({ gradingProgress: 'Pending' })],
    ['no timestamp', score({ timestamp: undefined })],
    ['timestamp not a string', score({ timestamp: 1_700_000_000 })],
    ['timestamp not ISO', score({ timestamp: 'yesterday' })],
    ['timestamp impossible', score({ timestamp: '2026-13-45T99:99:99Z' })],
    [
      'timestamp 6 minutes ahead',
      score({ timestamp: new Date(Date.now() + 6 * 60_000).toISOString() }),
    ],
  ])('rejects a bad score body: %s', async (_n, body) => {
    await expect(service.receiveScore(await bearer(), 'k1', 'i1', body)).rejects.toBeInstanceOf(
      HttpException
    )
    expect(learner.recordToolResult).not.toHaveBeenCalled()
  })
})

describe('brand claim', () => {
  type Inst = { brand: unknown; parentId: string | null }
  const brand = { name: 'Delaware DOL', primary: '#05405c', logoUrl: 'https://l.test/a.png' }
  const withInstitutions = (map: Record<string, Inst>, institutionId = 'child') => {
    prisma.cohort.findUnique.mockResolvedValue({
      courseId: 'c1',
      startsAt: PAST,
      endsAt: FUTURE,
      institutionId,
    })
    prisma.institution.findUnique.mockImplementation(
      async (a: { where: { id: string } }) => map[a.where.id] ?? null
    )
  }
  const idTokenClaims = async () => {
    const html = await service.authenticate(await authParams())
    return JSON.parse(Buffer.from(field(html, 'id_token').split('.')[1], 'base64url').toString())
  }

  it('carries the brand of the cohort institution', async () => {
    withInstitutions({ child: { brand, parentId: 'parent' } })
    expect((await idTokenClaims())[BRAND_CLAIM]).toEqual(brand)
    expect(prisma.institution.findUnique).toHaveBeenCalledTimes(1)
  })

  it('sanitizes the stored brand before signing it', async () => {
    withInstitutions({
      child: {
        brand: { ...brand, primary: 'url(https://evil.test)', accent: '#ABCDEF', sky: '#000000' },
        parentId: null,
      },
    })
    expect((await idTokenClaims())[BRAND_CLAIM]).toEqual({
      name: 'Delaware DOL',
      logoUrl: 'https://l.test/a.png',
      accent: '#abcdef',
    })
  })

  it('walks up to the first ancestor with a valid brand', async () => {
    withInstitutions({
      child: { brand: null, parentId: 'mid' },
      mid: { brand: { primary: '#000000' }, parentId: 'top' }, // invalid: no name
      top: { brand, parentId: null },
    })
    expect((await idTokenClaims())[BRAND_CLAIM]).toEqual(brand)
  })

  it('prefers the nearest brand over an ancestor', async () => {
    withInstitutions({
      child: { brand: { name: 'Child' }, parentId: 'top' },
      top: { brand, parentId: null },
    })
    expect((await idTokenClaims())[BRAND_CLAIM]).toEqual({ name: 'Child' })
  })

  it('omits the claim when nothing on the chain has a brand', async () => {
    withInstitutions({
      child: { brand: null, parentId: 'top' },
      top: { brand: { name: '' }, parentId: null },
    })
    expect(await idTokenClaims()).not.toHaveProperty([BRAND_CLAIM])
  })

  it('omits the claim when the cohort has no institution', async () => {
    withInstitutions({}, null as unknown as string)
    expect(await idTokenClaims()).not.toHaveProperty([BRAND_CLAIM])
    expect(prisma.institution.findUnique).not.toHaveBeenCalled()
  })

  it('stops after 5 hops and survives a parent cycle', async () => {
    const chain: Record<string, Inst> = {}
    for (let i = 0; i < 10; i++) chain[`i${i}`] = { brand: null, parentId: `i${i + 1}` }
    chain.i7 = { brand, parentId: null }
    withInstitutions(chain, 'i0')
    expect(await idTokenClaims()).not.toHaveProperty([BRAND_CLAIM])
    expect(prisma.institution.findUnique).toHaveBeenCalledTimes(6)

    prisma.institution.findUnique.mockClear()
    chain.i5 = { brand, parentId: null }
    expect((await idTokenClaims())[BRAND_CLAIM]).toEqual(brand) // i0 + 5 hops = i5

    withInstitutions({ a: { brand: null, parentId: 'b' }, b: { brand: null, parentId: 'a' } }, 'a')
    expect(await idTokenClaims()).not.toHaveProperty([BRAND_CLAIM])
  })
})
