import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { AddressInfo } from 'node:net'
import { ClerkService } from '../auth/clerk.service'
import { LearnGuard } from '../auth/learn.guard'
import { PrismaService } from '../prisma/prisma.service'
import { LTI_STORE, MemoryLtiStore } from './lti-store'
import { limitRegistrationBody } from './registration-limit'
import { registeredTools, toolById } from './platform/lti-platform-config'
import { RegistrationController } from './platform/registration.controller'
import { RegistrationService } from './platform/registration.service'
import { ToolRegistryController } from './platform/tool-registry.controller'
import { ToolRegistryService } from './platform/tool-registry.service'
import { resetToDefaults } from './platform/tool-test-helpers'

// A tool registering itself with the platform, over real HTTP: the admin starts it, the "tool"
// (this test) reads the platform's configuration and posts its own, and the registry ends up with a
// connection and a switched-off tool. Only the database is a stand-in.

type Row = Record<string, unknown>

function fakePrisma() {
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
    changes,
    ltiConnection: table(connections),
    ltiTool: {
      ...table(tools),
      findMany: async () =>
        tools.map((t) => ({ ...t, connection: connections.find((c) => c.id === t.connectionId) })),
    },
    ltiRegistryChange: table(changes),
    institution: { findMany: async () => [] },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  }
}

describe('LTI Dynamic Registration over HTTP', () => {
  let app: INestApplication
  let base: string
  const db = fakePrisma()
  const clerk = {
    verifyLearnToken: async (t: string) =>
      t === 'admin-token' ? 'u1' : t === 'agency-token' ? 'u2' : null,
    getRole: async (id: string) => (id === 'u1' ? 'system-admin' : 'agency-admin'),
    getUserProfile: async () => ({ email: 'boss@example.com', displayName: 'Boss Person' }),
  }
  const admin = { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' }
  const json = { 'Content-Type': 'application/json' }

  const toolBody = {
    application_type: 'web',
    response_types: ['id_token'],
    grant_types: ['implicit', 'client_credentials'],
    token_endpoint_auth_method: 'private_key_jwt',
    client_name: 'Acme Labs',
    initiate_login_uri: 'https://acme.example/lti/login',
    redirect_uris: ['https://acme.example/lti/launch'],
    jwks_uri: 'https://acme.example/jwks',
    scope: 'openid https://purl.imsglobal.org/spec/lti-ags/scope/score',
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [RegistrationController, ToolRegistryController],
      providers: [
        RegistrationService,
        ToolRegistryService,
        LearnGuard,
        { provide: LTI_STORE, useValue: new MemoryLtiStore() },
        { provide: PrismaService, useValue: db },
        { provide: ClerkService, useValue: clerk },
      ],
    }).compile()
    app = mod.createNestApplication()
    app.setGlobalPrefix('api')
    limitRegistrationBody(app)
    await app.listen(0, '127.0.0.1')
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`
    process.env.LTI_API_BASE = base
    await app.init()
  })
  afterAll(async () => {
    delete process.env.LTI_API_BASE
    resetToDefaults()
    await app.close()
  })

  it('registers a tool from its link: connection and a switched-off tool, then one use only', async () => {
    const config = await fetch(`${base}/lti/platform/openid-configuration`)
    expect(config.status).toBe(200)
    expect((await config.json()).registration_endpoint).toBe(`${base}/lti/platform/registration`)

    // The admin pastes the tool's link; the platform answers with the link to open.
    const start = await fetch(`${base}/learn/tools/registrations`, {
      method: 'POST',
      headers: admin,
      body: JSON.stringify({ initiationUrl: 'https://acme.example/lti/register' }),
    })
    expect(start.status).toBe(201)
    const link = new URL((await start.json()).url)
    expect(link.origin + link.pathname).toBe('https://acme.example/lti/register')
    const token = link.searchParams.get('registration_token') as string

    // The tool reads the platform's configuration, then posts its own.
    const platform = await (
      await fetch(link.searchParams.get('openid_configuration') as string)
    ).json()
    const registered = await fetch(platform.registration_endpoint, {
      method: 'POST',
      headers: { ...json, Authorization: `Bearer ${token}` },
      body: JSON.stringify(toolBody),
    })
    expect(registered.status).toBe(201)
    const out = await registered.json()
    expect(out.client_id).toMatch(/^ld-/)
    expect(out.client_name).toBe('Acme Labs')
    expect(out['https://purl.imsglobal.org/spec/lti-tool-configuration'].deployment_id).toMatch(
      /^[0-9a-f]{12}$/
    )

    // The registry has the connection and a tool that is off, so it cannot be launched yet.
    expect(db.connections).toHaveLength(1)
    expect(db.connections[0]).toMatchObject({ clientId: out.client_id, jwksUrl: toolBody.jwks_uri })
    expect(db.tools).toHaveLength(1)
    expect(db.tools[0]).toMatchObject({ enabled: false, name: 'Acme Labs' })
    expect(toolById(db.tools[0].toolId)).toBeUndefined()
    expect(registeredTools().some((t) => t.clientId === out.client_id)).toBe(false)
    const listed = await (await fetch(`${base}/learn/tools`, { headers: admin })).json()
    expect(listed.connections.map((c: Row) => c.clientId)).toContain(out.client_id)
    expect(listed.tools.find((t: Row) => t.name === 'Acme Labs')).toMatchObject({ enabled: false })

    // The history says who, and how.
    expect(db.changes.map((c) => [c.subject, c.userName])).toEqual([
      ['connection', 'Boss Person (tool registration link)'],
      ['tool', 'Boss Person (tool registration link)'],
    ])

    // A link works once.
    const again = await fetch(platform.registration_endpoint, {
      method: 'POST',
      headers: { ...json, Authorization: `Bearer ${token}` },
      body: JSON.stringify(toolBody),
    })
    expect(again.status).toBe(401)
    expect(db.connections).toHaveLength(1)
  })

  it('refuses to register without a valid token, and a non-admin cannot start one', async () => {
    const noToken = await fetch(`${base}/lti/platform/registration`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify(toolBody),
    })
    expect(noToken.status).toBe(401)
    const wrongToken = await fetch(`${base}/lti/platform/registration`, {
      method: 'POST',
      headers: { ...json, Authorization: 'Bearer not-a-real-token' },
      body: JSON.stringify(toolBody),
    })
    expect(wrongToken.status).toBe(401)
    const agency = await fetch(`${base}/learn/tools/registrations`, {
      method: 'POST',
      headers: { ...admin, Authorization: 'Bearer agency-token' },
      body: JSON.stringify({ initiationUrl: 'https://acme.example/lti/register' }),
    })
    expect(agency.status).toBe(403)
    const anonymous = await fetch(`${base}/learn/tools/registrations`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ initiationUrl: 'https://acme.example/lti/register' }),
    })
    expect(anonymous.status).toBe(401)
  })

  it('answers 400 for a registration the platform cannot serve, and the link survives', async () => {
    const before = db.connections.length
    const start = await (
      await fetch(`${base}/learn/tools/registrations`, {
        method: 'POST',
        headers: admin,
        body: JSON.stringify({ initiationUrl: 'https://acme.example/lti/register' }),
      })
    ).json()
    const token = new URL(start.url).searchParams.get('registration_token') as string
    const post = (b: object) =>
      fetch(`${base}/lti/platform/registration`, {
        method: 'POST',
        headers: { ...json, Authorization: `Bearer ${token}` },
        body: JSON.stringify(b),
      })
    expect((await post({ ...toolBody, jwks_uri: 'https://169.254.169.254/jwks' })).status).toBe(400)
    expect(
      (await post({ ...toolBody, token_endpoint_auth_method: 'client_secret_post' })).status
    ).toBe(400)
    expect(db.connections).toHaveLength(before)
    expect((await post(toolBody)).status).toBe(201)
    expect(db.connections).toHaveLength(before + 1)
  })

  it('refuses an oversized registration body with 413 before reading it, whatever the token', async () => {
    const res = await fetch(`${base}/lti/platform/registration`, {
      method: 'POST',
      headers: { ...json, Authorization: 'Bearer anything' },
      body: JSON.stringify({ ...toolBody, padding: 'x'.repeat(40 * 1024) }),
    })
    expect(res.status).toBe(413)
    // a normal-sized body still reaches the handler (and is refused there for its token)
    const normal = await fetch(`${base}/lti/platform/registration`, {
      method: 'POST',
      headers: { ...json, Authorization: 'Bearer anything' },
      body: JSON.stringify(toolBody),
    })
    expect(normal.status).toBe(401)
  })

  it('rejects a registration link that is not public https', async () => {
    const res = await fetch(`${base}/learn/tools/registrations`, {
      method: 'POST',
      headers: admin,
      body: JSON.stringify({ initiationUrl: 'http://acme.example/lti/register' }),
    })
    expect(res.status).toBe(400)
  })
})
