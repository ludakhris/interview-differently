import { NotFoundException } from '@nestjs/common'
import { CohortsService } from './cohorts.service'
import type { PrismaService } from '../prisma/prisma.service'
import type { ClerkService } from '../auth/clerk.service'

const prisma = {
  cohort: { findUnique: jest.fn() },
  user: { findUnique: jest.fn(), create: jest.fn() },
  membership: { create: jest.fn() },
}
const clerk = { getUserProfile: jest.fn() }
const service = new CohortsService(
  prisma as unknown as PrismaService,
  clerk as unknown as ClerkService
)

describe('CohortsService.addMember user source', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.membership.create.mockResolvedValue({ id: 'm1' })
  })

  it('looks an Interview Differently cohort member up among interview users', async () => {
    prisma.cohort.findUnique.mockResolvedValue({ id: 'c1', institutionId: 'i1', courseId: null })
    prisma.user.findUnique.mockResolvedValue({ id: 'user_id1' })
    await service.addMember('c1', { email: ' Ann@Example.com ' })
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email_source: { email: 'ann@example.com', source: 'interview' } },
    })
  })

  it('looks a LearnDifferently cohort member up among learn users', async () => {
    prisma.cohort.findUnique.mockResolvedValue({ id: 'c2', institutionId: 'i2', courseId: 'course1' })
    prisma.user.findUnique.mockResolvedValue({ id: 'user_ld1' })
    await service.addMember('c2', { email: 'ann@example.com' })
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email_source: { email: 'ann@example.com', source: 'learn' } },
    })
  })

  it('does not match the same email on the other app', async () => {
    prisma.cohort.findUnique.mockResolvedValue({ id: 'c2', institutionId: 'i2', courseId: 'course1' })
    prisma.user.findUnique.mockResolvedValue(null)
    await expect(service.addMember('c2', { email: 'ann@example.com' })).rejects.toThrow(
      NotFoundException
    )
  })

  it('backfills a missing user from the Clerk instance matching the cohort', async () => {
    prisma.cohort.findUnique.mockResolvedValue({ id: 'c2', institutionId: 'i2', courseId: 'course1' })
    prisma.user.findUnique.mockResolvedValue(null)
    clerk.getUserProfile.mockResolvedValue({ email: 'ann@example.com', displayName: 'Ann' })
    await service.addMember('c2', { userId: 'user_ld1' })
    expect(clerk.getUserProfile).toHaveBeenCalledWith('user_ld1', 'learn')
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { id: 'user_ld1', source: 'learn', email: 'ann@example.com', displayName: 'Ann' },
    })
  })
})
