import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import type { AddressInfo } from 'net'
import { ClerkService } from '../auth/clerk.service'
import { AdminGuard } from '../auth/admin.guard'
import { PrismaService } from '../prisma/prisma.service'
import { UsageController } from './usage.controller'
import { UsageService } from './usage.service'

// Real AdminGuard + controller over HTTP; Clerk, Prisma and the service are faked.
const TOKENS: Record<string, { userId: string; role: string | null }> = {
  'tok-admin': { userId: 'admin1', role: 'admin' },
  'tok-inst': { userId: 'ia1', role: 'institution-admin' },
  'tok-student': { userId: 'stu1', role: null },
}
const clerk = {
  verifyBearerToken: async (t: string) => TOKENS[t]?.userId ?? null,
  getRole: async (id: string) => Object.values(TOKENS).find((t) => t.userId === id)?.role ?? null,
}
const prisma = { membership: { findMany: async () => [{ institutionId: 'i1' }] } }
const report = jest.fn(async () => ({ ok: true }))

let app: INestApplication
let base: string

beforeAll(async () => {
  const mod = await Test.createTestingModule({
    controllers: [UsageController],
    providers: [AdminGuard],
  })
    .useMocker((token) => {
      if (token === ClerkService) return clerk
      if (token === PrismaService) return prisma
      if (token === UsageService) return { report }
      return {}
    })
    .compile()
  app = mod.createNestApplication()
  await app.listen(0)
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`
})
afterAll(() => app.close())
beforeEach(() => jest.clearAllMocks())

const get = (path: string, token?: string) =>
  fetch(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} })

describe('GET /admin/usage', () => {
  it.each([
    ['no token', undefined, 401],
    ['garbage token', 'nope', 401],
    ['signed-in student', 'tok-student', 403],
    ['institution-admin (platform-wide data is full-admin only)', 'tok-inst', 403],
  ])('%s (token %s) → %i and computes nothing', async (_n, token, status) => {
    expect((await get('/admin/usage', token)).status).toBe(status)
    expect(report).not.toHaveBeenCalled()
  })

  it('full admin → 200, defaulting to 30d and excluding admins', async () => {
    const res = await get('/admin/usage', 'tok-admin')
    expect(res.status).toBe(200)
    expect(report).toHaveBeenCalledWith({ range: '30d', includeAdmins: false, tzOffsetMinutes: 0 })
  })

  it('passes range, includeAdmins and tz through', async () => {
    await get('/admin/usage?range=7d&includeAdmins=true&tz=300', 'tok-admin')
    expect(report).toHaveBeenCalledWith({ range: '7d', includeAdmins: true, tzOffsetMinutes: 300 })
  })

  it.each(['/admin/usage?range=1y', '/admin/usage?tz=abc', '/admin/usage?tz=99999'])(
    'rejects bad input %s with 400',
    async (path) => {
      expect((await get(path, 'tok-admin')).status).toBe(400)
      expect(report).not.toHaveBeenCalled()
    }
  )
})
