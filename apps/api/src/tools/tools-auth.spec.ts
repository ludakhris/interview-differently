import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import type { AddressInfo } from 'net'
import { ClerkService } from '../auth/clerk.service'
import { AdminGuard } from '../auth/admin.guard'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import { InstitutionScope } from '../auth/scope'
import { PrismaService } from '../prisma/prisma.service'
import {
  SandboxActivityController,
  ToolsAdminController,
  ToolsMeController,
} from './tools.controller'
import { ToolsService } from './tools.service'

// Real guards + scope + controllers over HTTP; only Clerk and Prisma are faked.
const TOKENS: Record<string, { userId: string; role: string | null }> = {
  'tok-admin': { userId: 'admin1', role: 'admin' },
  'tok-inst1': { userId: 'ia1', role: 'institution-admin' },
  'tok-inst2': { userId: 'ia2', role: 'institution-admin' },
  'tok-student': { userId: 'stu1', role: null },
  'tok-fakeadmin': { userId: 'stu2', role: 'student' },
}
const INSTITUTIONS_OF: Record<string, string[]> = { ia1: ['i1'], ia2: ['i2'] }

const clerk = {
  verifyBearerToken: async (t: string) => TOKENS[t]?.userId ?? null,
  getRole: async (userId: string) =>
    Object.values(TOKENS).find((t) => t.userId === userId)?.role ?? null,
  isAdmin: async () => false,
}
const prisma = {
  membership: {
    findMany: jest.fn(
      async (args: { where: { userId?: string }; select: Record<string, unknown> }) => {
        if ('institutionId' in args.select) {
          return (INSTITUTIONS_OF[args.where.userId ?? ''] ?? []).map((institutionId) => ({
            institutionId,
          }))
        }
        if ('user' in args.select) return [] // sandboxActivity: institution members with no cohort
        return [{ cohortId: 'c1', cohort: { datasets: [] } }] // logSandboxQuery
      }
    ),
  },
  cohort: {
    // cohort c1 belongs to institution i1
    findUnique: jest.fn(async (args: { where: { id: string } }) =>
      args.where.id === 'c1'
        ? {
            id: 'c1',
            name: 'Cohort 1',
            institutionId: 'i1',
            memberships: [{ user: { id: 's1', email: 's1@x.com', displayName: 'S One' } }],
          }
        : null
    ),
  },
  sqlQueryLog: {
    findMany: jest.fn(async () => []),
    create: jest.fn(async () => ({})),
    deleteMany: jest.fn(),
  },
}

let app: INestApplication
let base: string

beforeAll(async () => {
  const mod = await Test.createTestingModule({
    controllers: [SandboxActivityController, ToolsAdminController, ToolsMeController],
    providers: [ToolsService, AdminGuard, AuthenticatedGuard, InstitutionScope],
  })
    .useMocker((token) => {
      if (token === ClerkService) return clerk
      if (token === PrismaService) return prisma
      return {}
    })
    .compile()
  app = mod.createNestApplication()
  await app.listen(0)
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`.replace(
    '/api',
    ''
  )
})
afterAll(() => app.close())
beforeEach(() => jest.clearAllMocks())

const get = (path: string, token?: string) =>
  fetch(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
const post = (path: string, body: unknown, token?: string) =>
  fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

describe('GET /admin/cohorts/:id/sandbox-activity', () => {
  const url = '/admin/cohorts/c1/sandbox-activity'

  it.each([
    ['no token', undefined, 401],
    ['garbage token', 'nope', 401],
    ['signed-in student (no role)', 'tok-student', 403],
    ['student with a non-admin role', 'tok-fakeadmin', 403],
    ['institution-admin of a different institution', 'tok-inst2', 403],
  ])('%s (token %s) → %i, reads no logs', async (_n, token, status) => {
    const res = await get(url, token)
    expect(res.status).toBe(status)
    expect(prisma.sqlQueryLog.findMany).not.toHaveBeenCalled()
  })

  it('institution-admin of the owning institution → 200', async () => {
    const res = await get(url, 'tok-inst1')
    expect(res.status).toBe(200)
    expect((await res.json()).students[0].userId).toBe('s1')
  })

  it('full admin → 200', async () => {
    expect((await get(url, 'tok-admin')).status).toBe(200)
  })

  it('unknown cohort → 404 for an institution-admin (no existence leak beyond that)', async () => {
    expect((await get('/admin/cohorts/nope/sandbox-activity', 'tok-inst1')).status).toBe(404)
  })
})

describe('POST /me/tools/sandbox-queries', () => {
  const body = { datasetSlug: 'ds', queryText: 'select 1', ok: true }

  it('rejects unauthenticated writes', async () => {
    expect((await post('/me/tools/sandbox-queries', body)).status).toBe(401)
    expect(prisma.sqlQueryLog.create).not.toHaveBeenCalled()
  })

  it('attributes the row to the token user; ignores userId/cohortId in the body', async () => {
    const res = await post(
      '/me/tools/sandbox-queries',
      { ...body, userId: 'victim', cohortId: 'other' },
      'tok-student'
    )
    expect(res.status).toBe(204)
    const data = (
      prisma.sqlQueryLog.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }]
    )[0].data
    expect(data.userId).toBe('stu1')
    expect(data.cohortId).toBe('c1')
  })
})
