import { BadRequestException } from '@nestjs/common'
import { MeService } from './me.service'

describe('MeService.join input checks', () => {
  it.each([
    ['a number joinKey', { joinKey: 123 }],
    ['an object institutionId', { institutionId: { not: 'x' } }],
    ['an over-long joinKey', { joinKey: 'k'.repeat(201) }],
  ])('refuses %s with a 400 before touching data', async (_n, body) => {
    const prisma = { user: { upsert: jest.fn() }, membership: { create: jest.fn() } }
    const clerk = { getUserProfile: jest.fn() }
    const svc = new MeService(prisma as never, clerk as never)
    await expect(svc.join('u1', body as never)).rejects.toBeInstanceOf(BadRequestException)
    expect(clerk.getUserProfile).not.toHaveBeenCalled()
    expect(prisma.membership.create).not.toHaveBeenCalled()
  })
})
