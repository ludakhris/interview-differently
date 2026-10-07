import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { AdminGuard } from '../auth/admin.guard'
import { ClerkService } from '../auth/clerk.service'
import { LearnGuard } from '../auth/learn.guard'
import { InterviewEngineService } from '../interview-engine/interview-engine.service'
import { PrismaService } from '../prisma/prisma.service'
import { LTI_STORE, MemoryLtiStore } from './lti-store'
import { limitRegistrationBody } from './registration-limit'
import { RegistrationController } from './platform/registration.controller'
import { RegistrationService } from './platform/registration.service'
import { ToolRegistryController } from './platform/tool-registry.controller'
import { ToolRegistryService } from './platform/tool-registry.service'
import { resetToDefaults } from './platform/tool-test-helpers'
import { LtiToolController } from './tool/lti-tool.controller'
import { LtiToolService } from './tool/lti-tool.service'
import { PlatformRegistryService } from './tool/platform-registry.service'
import { fakePlatformDb } from './tool/platform-test-helpers'
import { PlatformsController } from './tool/platforms.controller'
import { ToolRegistrationController } from './tool/registration.controller'
import { ToolRegistrationService } from './tool/registration.service'

// Interview Differently registering itself with LearnDifferently, over real HTTP and in one
// process: LearnDifferently's platform side (as admin-started registration) and Interview
// Differently's tool side. Only the databases and the identity provider are stand-ins.

type Row = Record<string, unknown>

function ldTables() {
  const connections: Row[] = []
  const tools: Row[] = []
  const changes: Row[] = []
  const table = (rows: Row[]) => ({
    create: async ({ data }: { data: Row }) => {
      const row = { createdAt: new Date(), ...data }
      rows.push(row)
      return row
    },
    findMany: async () => rows,
  })
  return {
    connections,
    tools,
    ltiConnection: table(connections),
    ltiTool: {
      ...table(tools),
      findMany: async () =>
        tools.map((t) => ({ ...t, connection: connections.find((c) => c.id === t.connectionId) })),
    },
    ltiRegistryChange: table(changes),
    institution: { findMany: async () => [] },
  }
}

describe('Interview Differently registers itself with a platform (end to end)', () => {
  let app: INestApplication
  let base: string
  let origin: string
  const ld = ldTables()
  const idDb = fakePlatformDb()
  const prisma = { ...ld, ...idDb, membership: { findMany: async () => [] } }
  const clerk = {
    verifyLearnToken: async (t: string) => (t === 'ld-admin' ? 'ld1' : null),
    verifyBearerToken: async (t: string) =>
      t === 'id-admin' ? 'a1' : t === 'inst-admin' ? 'a2' : null,
    getRole: async (id: string, source?: string) =>
      source === 'learn' ? 'system-admin' : id === 'a1' ? 'admin' : 'institution-admin',
    getUserProfile: async () => ({ email: 'boss@example.com', displayName: 'Boss Person' }),
  }
  const ldAdmin = { Authorization: 'Bearer ld-admin', 'Content-Type': 'application/json' }
  const idAdmin = { Authorization: 'Bearer id-admin', 'Content-Type': 'application/json' }
  let toolReg: ToolRegistrationService
  let hostile: Server
  let hostileBase: string

  const registerLink = async () => {
    const start = await fetch(`${base}/learn/tools/registrations`, {
      method: 'POST',
      headers: ldAdmin,
      body: JSON.stringify({ initiationUrl: `${base}/lti/tool/register` }),
    })
    expect(start.status).toBe(201)
    return (await start.json()).url as string
  }
  const html = async (res: Response) => ({
    status: res.status,
    headers: res.headers,
    text: await res.text(),
  })

  beforeAll(async () => {
    process.env.LTI_TOOL_SCORING = 'stub'
    const mod = await Test.createTestingModule({
      controllers: [
        RegistrationController,
        ToolRegistryController,
        ToolRegistrationController,
        PlatformsController,
        LtiToolController,
      ],
      providers: [
        RegistrationService,
        ToolRegistryService,
        ToolRegistrationService,
        PlatformRegistryService,
        LtiToolService,
        LearnGuard,
        AdminGuard,
        { provide: InterviewEngineService, useValue: { scoreAnswers: jest.fn() } },
        { provide: LTI_STORE, useValue: new MemoryLtiStore() },
        { provide: PrismaService, useValue: prisma },
        { provide: ClerkService, useValue: clerk },
      ],
    }).compile()
    app = mod.createNestApplication()
    app.setGlobalPrefix('api')
    limitRegistrationBody(app)
    await app.listen(0, '127.0.0.1')
    origin = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`
    base = `${origin}/api`
    process.env.LTI_API_BASE = base
    await app.init()
    toolReg = app.get(ToolRegistrationService)
    resetToDefaults()

    // a platform that lies: what it serves depends on the path
    hostile = createServer((req, res) => {
      const json = (b: unknown) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(b))
      }
      const own = (p: string) => `${hostileBase}${p}`
      const config = (over: Row = {}) => ({
        issuer: hostileBase,
        authorization_endpoint: own('/auth'),
        token_endpoint: own('/token'),
        jwks_uri: own('/jwks'),
        registration_endpoint: own('/register'),
        ...over,
      })
      switch (req.url) {
        case '/redirect':
          res.writeHead(302, { Location: `${base}/lti/platform/openid-configuration` })
          return res.end()
        case '/cross':
          return json(config({ registration_endpoint: `${base}/lti/platform/registration` }))
        case '/metadata':
          return json(config({ token_endpoint: 'http://169.254.169.254/latest/token' }))
        case '/huge':
          return res.end(JSON.stringify(config({ pad: 'x'.repeat(200_000) })))
        case '/hang':
          return undefined
        case '/redirect-register':
          return json(config({ registration_endpoint: own('/bounce') }))
        case '/bounce':
          res.writeHead(307, { Location: 'http://169.254.169.254/register' })
          return res.end()
        default:
          res.statusCode = 404
          return res.end()
      }
    })
    await new Promise<void>((r) => hostile.listen(0, '127.0.0.1', r))
    hostileBase = `http://127.0.0.1:${(hostile.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    delete process.env.LTI_API_BASE
    delete process.env.LTI_TOOL_SCORING
    resetToDefaults()
    hostile.closeAllConnections()
    hostile.close()
    await app.close()
  })

  it('registers, waits for approval, then is let in by an administrator', async () => {
    // LearnDifferently's admin starts it; the admin's browser opens the link on this tool
    const link = await registerLink()
    expect(new URL(link).pathname).toBe('/api/lti/tool/register')
    const res = await html(await fetch(link))
    expect(res.status).toBe(200)
    expect(res.text).toContain('waiting for approval')
    expect(res.text).toContain('org.imsglobal.lti.close')
    expect(res.headers.get('content-security-policy')).toMatch(
      /script-src 'sha256-[A-Za-z0-9+/=]+'/
    )
    expect(res.headers.get('cache-control')).toBe('no-store')

    // the platform made a switched-off tool; this tool stored a switched-off platform
    expect(ld.tools).toHaveLength(1)
    expect(ld.tools[0]).toMatchObject({ enabled: false, name: 'Interview Differently' })
    expect(idDb.platforms).toHaveLength(1)
    const stored = idDb.platforms[0]
    expect(stored).toMatchObject({
      enabled: false,
      issuer: origin,
      authUrl: `${base}/lti/platform/auth`,
      tokenUrl: `${base}/lti/platform/token`,
      jwksUrl: `${base}/lti/platform/jwks`,
    })
    expect(stored.clientId).toBe(ld.connections[0].clientId)
    expect(stored.deploymentId).toBe(ld.connections[0].deploymentId)
    expect(JSON.stringify(idDb)).not.toContain(
      new URL(link).searchParams.get('registration_token')!
    )

    // the link works once: a second visit shows an error and adds nothing
    const again = await html(await fetch(link))
    expect(again.status).toBe(502)
    expect(again.text).toContain('401')
    expect(idDb.platforms).toHaveLength(1)

    // not let in yet
    const params = new URLSearchParams({
      iss: origin,
      client_id: stored.clientId as string,
      login_hint: 'u1',
      lti_message_hint: 'mh',
      lti_deployment_id: stored.deploymentId as string,
    })
    const waiting = await html(
      await fetch(`${base}/lti/tool/login?${params}`, { redirect: 'manual' })
    )
    expect(waiting.status).toBe(403)
    expect(waiting.text).toContain('not been approved')

    // the administrator sees it, waiting for approval
    const list = await (await fetch(`${base}/lti/platforms`, { headers: idAdmin })).json()
    expect(Object.keys(list.endpoints).sort()).toEqual([
      'jwksUrl',
      'launchUrl',
      'loginUrl',
      'registrationUrl',
    ])
    const row = list.platforms.find((p: Row) => p.id === stored.id)
    expect(row).toMatchObject({
      name: `learndifferently (${new URL(origin).host})`,
      enabled: false,
      approvedAt: null,
      source: 'registered',
    })
    expect(list.platforms[0]).toMatchObject({ id: 'built-in', source: 'built-in', enabled: true })

    // approves it
    const on = await fetch(`${base}/lti/platforms/${stored.id}`, {
      method: 'PUT',
      headers: idAdmin,
      body: JSON.stringify({ enabled: true }),
    })
    expect(on.status).toBe(200)
    expect(await on.json()).toMatchObject({ enabled: true, approvedAt: expect.any(String) })
    const login = await fetch(`${base}/lti/tool/login?${params}`, { redirect: 'manual' })
    expect(login.status).toBe(302)
    const to = new URL(login.headers.get('location')!)
    expect(to.origin + to.pathname).toBe(`${base}/lti/platform/auth`)
    expect(to.searchParams.get('client_id')).toBe(stored.clientId)

    // and the history says what happened, newest first
    const hist = await (
      await fetch(`${base}/lti/platforms/history?subjectId=${stored.id}`, { headers: idAdmin })
    ).json()
    expect(hist.changes.map((c: Row) => [c.action, c.userName])).toEqual([
      ['enabled', 'Boss Person'],
      ['created', 'Dynamic registration (' + new URL(origin).host + ')'],
    ])
  })

  it('only a full administrator can read or change platforms', async () => {
    const id = idDb.platforms[0].id
    for (const headers of <Record<string, string>[]>[
      { 'Content-Type': 'application/json' },
      { Authorization: 'Bearer nobody', 'Content-Type': 'application/json' },
    ]) {
      expect((await fetch(`${base}/lti/platforms`, { headers })).status).toBe(401)
      expect((await fetch(`${base}/lti/platforms/history`, { headers })).status).toBe(401)
      expect(
        (
          await fetch(`${base}/lti/platforms/${id}`, {
            method: 'PUT',
            headers,
            body: '{"enabled":false}',
          })
        ).status
      ).toBe(401)
    }
    const inst = { ...idAdmin, Authorization: 'Bearer inst-admin' }
    expect((await fetch(`${base}/lti/platforms`, { headers: inst })).status).toBe(403)
    expect(
      (
        await fetch(`${base}/lti/platforms/${id}`, {
          method: 'PUT',
          headers: inst,
          body: '{"enabled":false}',
        })
      ).status
    ).toBe(403)
    // a LearnDifferently admin token is not an Interview Differently one
    expect(
      (await fetch(`${base}/lti/platforms`, { headers: { Authorization: 'Bearer ld-admin' } }))
        .status
    ).toBe(401)
    expect(idDb.platforms[0].enabled).toBe(true)
  })

  it('DELETE rejects only a never-approved registration, for full admins only', async () => {
    const del = (id: string, headers: Record<string, string> = idAdmin) =>
      fetch(`${base}/lti/platforms/${id}`, { method: 'DELETE', headers })
    const approved = idDb.platforms[0].id as string
    expect((await del(approved)).status).toBe(400)
    expect((await del('built-in')).status).toBe(400)
    expect((await del('nope')).status).toBe(404)
    expect((await del(approved, { 'Content-Type': 'application/json' })).status).toBe(401)
    expect((await del(approved, { ...idAdmin, Authorization: 'Bearer inst-admin' })).status).toBe(
      403
    )
    const pending = {
      id: 'pend1',
      name: 'Pending',
      issuer: 'https://pending.example',
      clientId: 'c',
      deploymentId: 'd',
      authUrl: 'https://pending.example/a',
      tokenUrl: 'https://pending.example/t',
      jwksUrl: 'https://pending.example/j',
      enabled: false,
      approvedAt: null,
      createdAt: new Date(),
    }
    idDb.platforms.push(pending)
    const res = await del('pend1')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(idDb.platforms.find((p) => p.id === 'pend1')).toBeUndefined()
    expect(idDb.changes[idDb.changes.length - 1]).toMatchObject({
      subjectId: 'pend1',
      action: 'rejected',
      userName: 'Boss Person',
    })
  })

  it('answers 400 for a bad body or the built-in platform, 404 for an unknown one', async () => {
    const put = (id: string, body: unknown) =>
      fetch(`${base}/lti/platforms/${id}`, {
        method: 'PUT',
        headers: idAdmin,
        body: JSON.stringify(body),
      })
    const id = idDb.platforms[0].id as string
    expect((await put(id, { enabled: 'yes' })).status).toBe(400)
    expect((await put(id, {})).status).toBe(400)
    expect((await put('built-in', { enabled: false })).status).toBe(400)
    expect((await put('nope', { enabled: true })).status).toBe(404)
    const before = idDb.changes.length
    expect((await put(id, { enabled: true })).status).toBe(200) // already on: no new history
    expect(idDb.changes).toHaveLength(before)
  })

  describe('a platform that lies', () => {
    const rows = () => idDb.platforms.length
    const visit = async (path: string) => {
      const before = rows()
      const q = new URLSearchParams({
        openid_configuration: `${hostileBase}${path}`,
        registration_token: 'tok',
      })
      const res = await html(await fetch(`${base}/lti/tool/register?${q}`))
      expect(rows()).toBe(before)
      return res
    }
    // each of these goes through the real fetch, so a followed redirect would really happen
    it('a configuration that redirects is not followed', async () => {
      expect((await visit('/redirect')).status).toBe(502)
    })
    it('a registration endpoint on another site is refused before anything is posted', async () => {
      const registrations = ld.connections.length
      const res = await visit('/cross')
      expect(res.status).toBe(400)
      expect(res.text).toContain('same site')
      expect(ld.connections).toHaveLength(registrations)
    })
    it('an endpoint pointing at the cloud metadata address is refused', async () => {
      expect((await visit('/metadata')).status).toBe(400)
    })
    it('an oversized configuration is refused', async () => {
      expect((await visit('/huge')).status).toBe(502)
    })
    it('a registration that redirects is not followed', async () => {
      expect((await visit('/redirect-register')).status).toBe(502)
    })
    it('a platform that never answers is given up on', async () => {
      toolReg.timeoutMs = 300
      try {
        expect((await visit('/hang')).status).toBe(502)
      } finally {
        toolReg.timeoutMs = 10_000
      }
    })
  })

  it('shows plain error pages and never echoes the request unescaped', async () => {
    const evil = '"><script>alert(1)</script>'
    const q = new URLSearchParams({ openid_configuration: evil, registration_token: evil })
    const res = await html(await fetch(`${base}/lti/tool/register?${q}`))
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.text).not.toContain('<script>alert')
    expect(res.headers.get('content-security-policy')).not.toContain('script-src')
    // repeated parameters are not strings, so they read as missing
    const arr = await html(
      await fetch(
        `${base}/lti/tool/register?openid_configuration=a&openid_configuration=b&registration_token=t`
      )
    )
    expect(arr.status).toBe(400)
    expect(arr.text).toContain('missing')
  })

  it('limits registrations per address (the tenth request of the minute is the last)', async () => {
    const res = await html(await fetch(`${base}/lti/tool/register`))
    expect(res.status).toBe(429)
  })
})
