import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service'
import { CoursesService } from './courses.service'
import type { LearnService } from './learn.service'

const prisma = {
  course: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
  courseModule: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    aggregate: jest.fn(),
    update: jest.fn(),
  },
  courseItem: { findUnique: jest.fn(), delete: jest.fn(), update: jest.fn() },
  cohort: { count: jest.fn() },
  itemProgress: { count: jest.fn() },
  institution: { findFirst: jest.fn() },
  $transaction: jest.fn(),
}
const learn = {
  assertRole: jest.fn(),
  assertWorkspace: jest.fn(),
}
const service = new CoursesService(
  prisma as unknown as PrismaService,
  learn as unknown as LearnService
)

const provider = { id: 'p1', name: 'Harbor Point', subdomain: 'harborpoint' }
const course = {
  id: 'c1',
  slug: 'ma',
  title: 'MA',
  summary: null,
  sector: null,
  credential: null,
  lengthWeeks: 16,
  targetScore: 75,
  readinessThreshold: 70,
  status: 'draft',
  provider,
}

beforeEach(() => {
  jest.resetAllMocks()
  prisma.course.findUnique.mockResolvedValue(course)
  prisma.courseModule.findMany.mockResolvedValue([])
  prisma.cohort.count.mockResolvedValue(0)
})

describe('CoursesService access', () => {
  it('stops callers without a managing role before touching data', async () => {
    learn.assertRole.mockImplementation(() => {
      throw new ForbiddenException('Insufficient role')
    })
    await expect(service.detail('u', 'case-manager', 'c1')).rejects.toThrow(ForbiddenException)
    expect(prisma.course.findUnique).not.toHaveBeenCalled()
  })

  it('checks the caller can open the provider that owns the course', async () => {
    learn.assertWorkspace.mockRejectedValue(new ForbiddenException('No access to this workspace'))
    await expect(service.detail('u', 'provider-admin', 'c1')).rejects.toThrow(ForbiddenException)
    expect(learn.assertWorkspace).toHaveBeenCalledWith('u', 'provider-admin', 'harborpoint')
  })
})

describe('CoursesService create', () => {
  it('adds a numeric suffix when the slug is taken and starts as a draft', async () => {
    prisma.institution.findFirst.mockResolvedValue(provider)
    prisma.course.findUnique
      .mockResolvedValueOnce({ id: 'x' }) // "medical-assistant" taken
      .mockResolvedValueOnce(null) // "medical-assistant-2" free
      .mockResolvedValue(course) // detail lookup
    prisma.course.create.mockResolvedValue({ id: 'c1' })
    await service.create('u', 'agency-admin', 'harborpoint', { title: 'Medical Assistant' })
    expect(prisma.course.create.mock.calls[0][0].data).toMatchObject({
      providerId: 'p1',
      slug: 'medical-assistant-2',
      status: 'draft',
      title: 'Medical Assistant',
    })
  })
})

describe('CoursesService deletes', () => {
  it('refuses to delete a course that has cohorts', async () => {
    prisma.cohort.count.mockResolvedValue(2)
    await expect(service.remove('u', 'agency-admin', 'c1')).rejects.toThrow(ConflictException)
    expect(prisma.course.delete).not.toHaveBeenCalled()
  })

  it('refuses to delete an item that learners have results on', async () => {
    prisma.courseItem.findUnique.mockResolvedValue({ id: 'i1', module: { courseId: 'c1' } })
    prisma.itemProgress.count.mockResolvedValue(3)
    await expect(service.removeItem('u', 'agency-admin', 'i1')).rejects.toThrow(ConflictException)
    expect(prisma.courseItem.delete).not.toHaveBeenCalled()
  })
})

describe('CoursesService reorder', () => {
  beforeEach(() => {
    prisma.courseModule.findMany.mockResolvedValue([
      { id: 'm1', items: [{ id: 'i1' }, { id: 'i2' }] },
      { id: 'm2', items: [{ id: 'i3' }] },
    ])
  })

  it('applies a new order, including moving an item to another module', async () => {
    prisma.$transaction.mockResolvedValue([])
    await service.reorder('u', 'agency-admin', 'c1', {
      moduleIds: ['m2', 'm1'],
      itemIds: { m2: ['i3', 'i1'], m1: ['i2'] },
    })
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.courseItem.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { moduleId: 'm2', position: 2 },
    })
  })

  it('rejects an order that drops or adds items', async () => {
    await expect(
      service.reorder('u', 'agency-admin', 'c1', {
        moduleIds: ['m1', 'm2'],
        itemIds: { m1: ['i1'], m2: ['i3'] },
      })
    ).rejects.toThrow(BadRequestException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
