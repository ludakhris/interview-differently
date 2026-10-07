import { LtiError } from '../lti-spec'
import { MemoryLtiStore } from '../lti-store'
import { PLATFORM_CONFIG_CLAIM, TOOL_CONFIG_CLAIM } from './dynamic-registration'
import { fakePlatformDb, registryOf } from './platform-test-helpers'
import { MAX_PENDING, ToolRegistrationService } from './registration.service'

const CONFIG_URL = 'https://lms.example/.well-known/openid-configuration'
const config = (over: Record<string, unknown> = {}) => ({
  issuer: 'https://lms.example',
  authorization_endpoint: 'https://lms.example/auth',
  token_endpoint: 'https://lms.example/token',
  jwks_uri: 'https://lms.example/jwks',
  registration_endpoint: 'https://lms.example/register',
  [PLATFORM_CONFIG_CLAIM]: { product_family_code: 'moodle' },
  ...over,
})
const answer = (over: Record<string, unknown> = {}) => ({
  client_id: 'client-1',
  [TOOL_CONFIG_CLAIM]: { deployment_id: 'dep-1' },
  ...over,
})
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })

type Calls = { url: string; init?: RequestInit }[]

function setup(
  responses: { config?: () => Response | Promise<Response>; register?: () => Response } = {}
) {
  process.env.LTI_API_BASE = 'https://id.example/api'
  const db = fakePlatformDb()
  const registry = registryOf(db)
  const store = new MemoryLtiStore()
  const svc = new ToolRegistrationService(registry, store)
  const calls: Calls = []
  svc.fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url === CONFIG_URL) return (responses.config ?? (() => json(config())))()
    if (url === 'https://lms.example/register')
      return (responses.register ?? (() => json(answer())))()
    throw new Error(`unexpected fetch ${url}`)
  }) as never
  const go = (q: Record<string, string | undefined> = {}, ip = '1.1.1.1') =>
    svc.register({ openid_configuration: CONFIG_URL, registration_token: 'tok-123', ...q }, ip)
  return { svc, db, registry, store, calls, go }
}

const refused = async (p: Promise<unknown>, status?: number) => {
  const err = await p.then(
    () => undefined,
    (e) => e
  )
  expect(err).toBeInstanceOf(LtiError)
  if (status) expect((err as LtiError).status).toBe(status)
  return err as LtiError
}

afterEach(() => {
  delete process.env.LTI_API_BASE
})

describe('Dynamic Registration, tool side', () => {
  it('registers: asks the platform, stores a switched-off platform and writes history', async () => {
    const h = setup()
    expect(await h.go()).toEqual({ name: 'moodle (lms.example)', created: true })
    expect(h.db.platforms).toHaveLength(1)
    expect(h.db.platforms[0]).toMatchObject({
      name: 'moodle (lms.example)',
      issuer: 'https://lms.example',
      clientId: 'client-1',
      deploymentId: 'dep-1',
      authUrl: 'https://lms.example/auth',
      tokenUrl: 'https://lms.example/token',
      jwksUrl: 'https://lms.example/jwks',
      enabled: false,
      approvedAt: null,
    })
    expect(h.db.changes).toHaveLength(1)
    expect(h.db.changes[0]).toMatchObject({
      subjectId: h.db.platforms[0].id,
      action: 'created',
      userId: null,
    })
    // the registry cache has it, off: it cannot log in
    const found = await h.registry.forLogin('https://lms.example', 'client-1')
    expect(found).toMatchObject({ enabled: false })
  })

  it('sends this tool as a web tool with the score scope, authorised by the token', async () => {
    const h = setup()
    await h.go()
    const [cfg, reg] = h.calls
    expect(cfg.url).toBe(CONFIG_URL)
    expect(reg.url).toBe('https://lms.example/register')
    for (const c of h.calls) {
      expect(c.init?.redirect).toBe('error')
      expect(c.init?.signal).toBeDefined()
    }
    const headers = reg.init?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok-123')
    expect(reg.init?.method).toBe('POST')
    const body = JSON.parse(reg.init?.body as string)
    expect(body).toMatchObject({
      application_type: 'web',
      client_name: 'Interview Differently',
      response_types: ['id_token'],
      grant_types: ['implicit', 'client_credentials'],
      token_endpoint_auth_method: 'private_key_jwt',
      initiate_login_uri: 'https://id.example/api/lti/tool/login',
      redirect_uris: ['https://id.example/api/lti/tool/launch'],
      jwks_uri: 'https://id.example/api/lti/tool/jwks',
      scope: 'openid https://purl.imsglobal.org/spec/lti-ags/scope/score',
    })
    expect(body[TOOL_CONFIG_CLAIM]).toMatchObject({
      domain: 'id.example',
      target_link_uri: 'https://id.example/api/lti/tool/launch',
      messages: [{ type: 'LtiResourceLinkRequest' }],
    })
  })

  it('never stores the registration token', async () => {
    const h = setup()
    await h.go({ registration_token: 'super-secret-token' })
    expect(JSON.stringify([h.db.platforms, h.db.changes])).not.toContain('super-secret-token')
  })

  describe('the configuration URL', () => {
    let nodeEnv: string | undefined
    beforeEach(() => {
      // outside production a local development host is allowed; production is what must refuse it
      nodeEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
    })
    afterEach(() => {
      process.env.NODE_ENV = nodeEnv
    })
    it.each([
      'http://lms.example/config',
      'https://localhost/config',
      'https://127.0.0.1/config',
      'https://10.0.0.5/config',
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]/config',
      'https://[::ffff:10.0.0.1]/config',
      'https://metadata.internal/config',
      'https://user:pw@lms.example/config',
      'ftp://lms.example/config',
      'javascript:alert(1)',
      'not a url',
    ])('refuses %s without fetching anything', async (u) => {
      const h = setup()
      await refused(h.go({ openid_configuration: u }), 400)
      expect(h.calls).toHaveLength(0)
      expect(h.db.platforms).toHaveLength(0)
    })

    it('allows http://localhost only outside production', async () => {
      const h = setup()
      h.svc.fetchImpl = (async (url: string) => {
        if (url.endsWith('/config'))
          return json(
            config({
              issuer: 'http://localhost:3000',
              authorization_endpoint: 'http://localhost:3000/auth',
              token_endpoint: 'http://localhost:3000/token',
              jwks_uri: 'http://localhost:3000/jwks',
              registration_endpoint: 'http://localhost:3000/register',
            })
          )
        return json(answer())
      }) as never
      const q = { openid_configuration: 'http://localhost:3000/config', registration_token: 't' }
      process.env.NODE_ENV = 'test'
      expect((await h.svc.register(q, 'a')).created).toBe(true)
      process.env.NODE_ENV = 'production'
      await refused(h.svc.register(q, 'b'), 400)
    })

    it('needs both parameters, and keeps them short and printable', async () => {
      const h = setup()
      await refused(h.go({ registration_token: undefined }))
      await refused(h.go({ openid_configuration: undefined }))
      await refused(h.go({ registration_token: 'has space' }))
      await refused(h.go({ registration_token: 'line\r\nInjected: header' }))
      await refused(h.go({ registration_token: 'x'.repeat(3000) }))
      await refused(h.go({ openid_configuration: `https://lms.example/${'a'.repeat(3000)}` }))
      expect(h.calls).toHaveLength(0)
    })
  })

  describe('a hostile configuration cannot point the tool elsewhere', () => {
    it.each([
      'issuer',
      'authorization_endpoint',
      'token_endpoint',
      'jwks_uri',
      'registration_endpoint',
    ])('refuses %s on another site, and posts nothing', async (field) => {
      const h = setup({ config: () => json(config({ [field]: 'https://evil.example/x' })) })
      await refused(h.go())
      expect(h.calls.map((c) => c.url)).toEqual([CONFIG_URL])
      expect(h.db.platforms).toHaveLength(0)
    })

    it.each([
      ['registration_endpoint', 'https://169.254.169.254/register'],
      ['registration_endpoint', 'https://localhost/register'],
      ['token_endpoint', 'https://10.1.2.3/token'],
      ['jwks_uri', 'http://lms.example/jwks'],
      ['authorization_endpoint', 'javascript:alert(1)'],
      ['issuer', 'https://lms.example@evil.example'],
      ['issuer', 'https://lms.example.evil.example'],
      ['registration_endpoint', 'https://lms.example:8443/register'],
    ])('refuses %s = %s', async (field, value) => {
      const h = setup({ config: () => json(config({ [field]: value })) })
      await refused(h.go())
      expect(h.calls).toHaveLength(1)
      expect(h.db.platforms).toHaveLength(0)
    })

    it.each([
      'issuer',
      'authorization_endpoint',
      'token_endpoint',
      'jwks_uri',
      'registration_endpoint',
    ])('refuses a missing or non-string %s', async (field) => {
      for (const v of [undefined, 5, ['https://lms.example/x'], { a: 1 }, null]) {
        const h = setup({ config: () => json(config({ [field]: v })) })
        await refused(h.go())
        expect(h.db.platforms).toHaveLength(0)
      }
    })

    it('refuses a platform that cannot do private_key_jwt or RS256', async () => {
      for (const over of [
        { token_endpoint_auth_methods_supported: ['client_secret_post'] },
        { id_token_signing_alg_values_supported: ['HS256'] },
      ]) {
        const h = setup({ config: () => json(config(over)) })
        await refused(h.go())
        expect(h.db.platforms).toHaveLength(0)
      }
    })
  })

  describe('what the platform sends back', () => {
    it('refuses a redirect (fetch is told to error on one)', async () => {
      const h = setup({
        config: () => {
          throw new TypeError('fetch failed: redirect')
        },
      })
      const err = await refused(h.go(), 502)
      expect(err.message).not.toContain('redirect')
      expect(h.calls[0].init?.redirect).toBe('error')
    })

    it('refuses an oversized configuration and an oversized registration answer', async () => {
      const big = JSON.stringify(config({ pad: 'x'.repeat(100_000) }))
      const a = setup({ config: () => new Response(big) })
      await refused(a.go(), 502)
      expect(a.calls).toHaveLength(1)
      const b = setup({
        register: () => new Response(JSON.stringify(answer({ pad: 'x'.repeat(100_000) }))),
      })
      await refused(b.go(), 502)
      expect(b.db.platforms).toHaveLength(0)
    })

    it.each([
      ['not json', 'nope'],
      ['an array', '[]'],
      ['null', 'null'],
      ['a number', '5'],
    ])('refuses a configuration that is %s', async (_n, text) => {
      const h = setup({ config: () => new Response(text) })
      await refused(h.go())
      expect(h.db.platforms).toHaveLength(0)
    })

    it('says only the status when the platform refuses, never what it said', async () => {
      const a = setup({ config: () => new Response('<script>alert(1)</script>', { status: 500 }) })
      const e1 = await refused(a.go(), 502)
      expect(e1.message).toContain('500')
      expect(e1.message).not.toContain('script')
      const b = setup({ register: () => new Response('token tok-123 rejected', { status: 401 }) })
      const e2 = await refused(b.go(), 502)
      expect(e2.message).toContain('401')
      expect(e2.message).not.toContain('tok-123')
    })

    it.each([
      ['no client_id', answer({ client_id: undefined })],
      ['numeric client_id', answer({ client_id: 5 })],
      ['empty client_id', answer({ client_id: ' ' })],
      ['long client_id', answer({ client_id: 'c'.repeat(201) })],
      ['control character in client_id', answer({ client_id: 'a\u0000b' })],
      ['no deployment_id', { client_id: 'c' }],
      ['numeric deployment_id', answer({ [TOOL_CONFIG_CLAIM]: { deployment_id: 1 } })],
      ['long deployment_id', answer({ [TOOL_CONFIG_CLAIM]: { deployment_id: 'd'.repeat(201) } })],
      ['tool config not an object', answer({ [TOOL_CONFIG_CLAIM]: 'x' })],
      ['an array', []],
    ])('refuses an answer with %s', async (_n, body) => {
      const h = setup({ register: () => json(body) })
      await refused(h.go(), 502)
      expect(h.db.platforms).toHaveLength(0)
      expect(h.db.changes).toHaveLength(0)
    })

    it('cleans the name the platform gives itself', async () => {
      const family = `evil${String.fromCharCode(0x202e, 0x200b, 7)}\n${'x'.repeat(200)}`
      const h = setup({
        config: () => json(config({ [PLATFORM_CONFIG_CLAIM]: { product_family_code: family } })),
      })
      const { name } = await h.go()
      expect(name.length).toBeLessThanOrEqual(80)
      expect(name).not.toMatch(/[\p{Cc}\p{Cf}]/u)
      const g = setup({
        config: () => json(config({ [PLATFORM_CONFIG_CLAIM]: { product_family_code: 5 } })),
      })
      expect((await g.go()).name).toBe('lms.example')
    })
  })

  describe('registering again', () => {
    it('the same issuer and client id stays one platform, and is never switched on', async () => {
      const h = setup()
      await h.go()
      expect((await h.go()).created).toBe(false)
      expect(h.db.platforms).toHaveLength(1)
      expect(h.db.changes).toHaveLength(1)
      // approved by an admin, then registered again by the platform: still as the admin left it
      const id = h.db.platforms[0].id as string
      await h.registry.setEnabled({ userId: 'u1', userName: 'Boss' }, id, true)
      h.db.platforms[0].deploymentId = 'edited'
      const again = await h.go()
      expect(again.created).toBe(false)
      expect(h.db.platforms[0]).toMatchObject({ enabled: true, deploymentId: 'edited' })
      expect(h.db.changes.map((c) => c.action)).toEqual(['created', 'enabled'])
    })

    it('survives a concurrent registration winning the unique key', async () => {
      const h = setup()
      await h.go()
      const real = h.db.ltiPlatform.findUnique
      let calls = 0
      // the first look says "free"; the create then hits the unique key; the second look finds it
      h.db.ltiPlatform.findUnique = (async (a: never) => (calls++ === 0 ? null : real(a))) as never
      const second = await h.go()
      expect(second.created).toBe(false)
      expect(h.db.platforms).toHaveLength(1)
      expect(h.db.changes).toHaveLength(1)
    })

    it('the same client id from two issuers is two platforms', async () => {
      const a = setup()
      await a.go()
      a.svc.fetchImpl = (async (url: string) => {
        if (url.endsWith('/config'))
          return json(
            config({
              issuer: 'https://other.example',
              authorization_endpoint: 'https://other.example/auth',
              token_endpoint: 'https://other.example/token',
              jwks_uri: 'https://other.example/jwks',
              registration_endpoint: 'https://other.example/register',
            })
          )
        return json(answer()) // the same client_id
      }) as never
      const r = await a.svc.register(
        { openid_configuration: 'https://other.example/config', registration_token: 't' },
        'ip'
      )
      expect(r.created).toBe(true)
      expect(a.db.platforms.map((p) => [p.issuer, p.clientId])).toEqual([
        ['https://lms.example', 'client-1'],
        ['https://other.example', 'client-1'],
      ])
      expect((await a.registry.forLogin('https://other.example', 'client-1'))?.id).toBe(
        a.db.platforms[1].id
      )
    })
  })

  describe('abuse limits', () => {
    it('limits registrations per address', async () => {
      const h = setup()
      for (let i = 0; i < 10; i++) await h.go({}, '9.9.9.9')
      await refused(h.go({}, '9.9.9.9'), 429)
      await h.go({}, '8.8.8.8') // another address is unaffected
    })

    it('stops taking registrations while too many wait for approval', async () => {
      const h = setup()
      for (let i = 0; i < MAX_PENDING; i++)
        h.db.platforms.push({
          id: `x${i}`,
          name: 'n',
          issuer: `https://p${i}.example`,
          clientId: 'c',
          enabled: false,
          createdAt: new Date(),
        })
      await h.registry.load()
      await refused(h.go(), 429)
      expect(h.calls).toHaveLength(0)
    })
  })
})
