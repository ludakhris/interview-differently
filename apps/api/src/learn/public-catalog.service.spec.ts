import { NotFoundException } from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service'
import { PublicCatalogService } from './public-catalog.service'

const prisma = {
  institution: { findFirst: jest.fn() },
  course: { findMany: jest.fn(), findFirst: jest.fn() },
}
const service = new PublicCatalogService(prisma as unknown as PrismaService)

const FUTURE = new Date('2099-03-01T00:00:00Z')
const LATER = new Date('2099-06-01T00:00:00Z')
const PAST = new Date('2020-01-01T00:00:00Z')
const course = {
  id: 'c1',
  title: 'Medical Assistant',
  summary: null,
  sector: 'Healthcare',
  credential: 'CCMA',
  lengthWeeks: 16,
  outcomes: ['Take vital signs'],
  targetRoles: ['Medical assistant'],
  provider: { name: 'Harbor Point' },
  cohorts: [
    { startsAt: PAST, endsAt: new Date('2020-06-01T00:00:00Z') }, // finished
    { startsAt: LATER, endsAt: new Date('2099-09-01T00:00:00Z') },
    { startsAt: FUTURE, endsAt: new Date('2099-06-20T00:00:00Z') },
  ],
}

beforeEach(() => {
  jest.resetAllMocks()
  prisma.institution.findFirst.mockResolvedValue({ id: 'ag1' })
})

describe('catalog', () => {
  it('lists published courses of providers under the agency, with the next start', async () => {
    prisma.course.findMany.mockResolvedValue([course])
    const out = await service.catalog('delaware')
    expect(prisma.course.findMany.mock.calls[0][0].where).toMatchObject({
      status: 'published',
      provider: { parentId: 'ag1' },
    })
    expect(out[0]).toMatchObject({
      title: 'Medical Assistant',
      provider: 'Harbor Point',
      openCohorts: 2,
      nextStart: FUTURE.toISOString(),
    })
  })

  it('filters by a search term across title, sector, credential and provider', async () => {
    prisma.course.findMany.mockResolvedValue([])
    await service.catalog('delaware', ' nurse ')
    expect(prisma.course.findMany.mock.calls[0][0].where.OR).toHaveLength(4)
  })

  it('404s for a tenant that is not an agency', async () => {
    prisma.institution.findFirst.mockResolvedValue(null)
    await expect(service.catalog('nope')).rejects.toThrow(NotFoundException)
  })
})

describe('offering', () => {
  it('shows the outline and joinable cohorts, never join codes', async () => {
    prisma.course.findFirst.mockResolvedValue({
      ...course,
      cohorts: course.cohorts.map((k, i) => ({
        ...k,
        name: `Cohort ${i}`,
        joinKey: 'SECRET123',
        maxLearners: i === 1 ? 10 : null,
        _count: { enrollments: i === 1 ? 4 : 0 },
      })),
      modules: [{ title: 'Start here', _count: { items: 1 } }],
    })
    const out = await service.offering('delaware', 'c1')
    expect(out.modules).toEqual([{ title: 'Start here', items: 1 }])
    expect(out.cohorts).toHaveLength(2) // the finished cohort is left out
    expect(out.cohorts.map((k) => k.seatsLeft)).toEqual([6, null])
    expect(out.outcomes).toEqual(['Take vital signs'])
    expect(out.targetRoles).toEqual(['Medical assistant'])
    expect(JSON.stringify(out)).not.toContain('SECRET123')
  })

  it('404s for an unpublished or foreign course', async () => {
    prisma.course.findFirst.mockResolvedValue(null)
    await expect(service.offering('delaware', 'x')).rejects.toThrow(NotFoundException)
  })
})
