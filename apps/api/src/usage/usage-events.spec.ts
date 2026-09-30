import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import type { AddressInfo } from 'net'
import { ClerkService } from '../auth/clerk.service'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import { PrismaService } from '../prisma/prisma.service'
import { UsageEventsController } from './usage-events.controller'
import { UsageEventsService } from './usage-events.service'

// Real guard + controller + service over HTTP; only Clerk and Prisma are faked.
const clerk = {
  verifyBearerToken: async (t: string) => (t.startsWith('tok-') ? t.slice(4) : null),
}
const create = jest.fn(async () => ({}))
const prisma = { usageEvent: { create, deleteMany: jest.fn() } }

let app: INestApplication
let base: string

beforeAll(async () => {
  const mod = await Test.createTestingModule({
    controllers: [UsageEventsController],
    providers: [AuthenticatedGuard, UsageEventsService],
  })
    .useMocker((token) => (token === ClerkService ? clerk : token === PrismaService ? prisma : {}))
    .compile()
  app = mod.createNestApplication()
  await app.listen(0)
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`
})
afterAll(() => app.close())
beforeEach(() => jest.clearAllMocks())

const post = (body: unknown, token?: string) =>
  fetch(`${base}/me/usage-events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

describe('POST /me/usage-events', () => {
  it('rejects unauthenticated requests', async () => {
    expect((await post({ path: '/dashboard' })).status).toBe(401)
    expect((await post({ path: '/dashboard' }, 'bogus')).status).toBe(401)
    expect(create).not.toHaveBeenCalled()
  })

  it('stores the route pattern for the token user, never the raw path or a body userId', async () => {
    const res = await post(
      {
        path: '/tools/assessments/attempt/SECRET-ID/result?x=1',
        userId: 'victim',
        route: 'forged',
      },
      'tok-alice'
    )
    expect(res.status).toBe(204)
    const data = (create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data
    expect(data).toEqual({ userId: 'alice', route: '/tools/assessments/result', refId: null })
  })

  it('keeps the scenario id for scenario routes', async () => {
    await post({ path: '/scenario/biz-1/briefing' }, 'tok-alice')
    const data = (create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data
    expect(data).toMatchObject({ route: '/scenario/:id/briefing', refId: 'biz-1' })
  })

  it.each([{}, { path: 5 }, { path: '' }, { path: 'x'.repeat(400) }])(
    '400 for bad body %j',
    async (body) => {
      expect((await post(body, 'tok-alice')).status).toBe(400)
      expect(create).not.toHaveBeenCalled()
    }
  )

  it('rate-limits a flooding user (30/min) without affecting others, still answering 204', async () => {
    for (let i = 0; i < 40; i++)
      expect((await post({ path: '/dashboard' }, 'tok-flood')).status).toBe(204)
    expect(create).toHaveBeenCalledTimes(30)
    await post({ path: '/dashboard' }, 'tok-someone-else')
    expect(create).toHaveBeenCalledTimes(31)
  })
})
