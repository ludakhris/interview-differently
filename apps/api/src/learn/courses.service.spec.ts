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
  courseItem: {
    findUnique: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
  },
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

describe('CoursesService native assessments', () => {
  const quiz = { prompt: 'Q?', options: ['a', 'b'], correctIndex: 0 }

  it('refuses to add a new native assessment item', async () => {
    prisma.courseModule.findUnique.mockResolvedValue({ id: 'm1', courseId: 'c1' })
    const add = service.addItem('u', 'agency-admin', 'm1', {
      type: 'assessment',
      title: 'Pre',
      label: 'pre',
      config: { questions: [quiz] },
    })
    await expect(add).rejects.toThrow(BadRequestException)
    await expect(add).rejects.toThrow('Add an Interview Differently assessment instead')
    expect(prisma.courseItem.create).not.toHaveBeenCalled()
  })

  it('still adds a connected assessment tool item', async () => {
    prisma.courseModule.findUnique.mockResolvedValue({ id: 'm1', courseId: 'c1' })
    prisma.courseItem.aggregate.mockResolvedValue({ _max: { position: 0 } })
    await service.addItem('u', 'agency-admin', 'm1', {
      type: 'tool',
      title: 'Pre',
      label: 'pre',
      config: { toolId: 'id-assessment', ref: 'ma-pre' },
    })
    expect(prisma.courseItem.create.mock.calls[0][0].data).toMatchObject({
      type: 'tool',
      label: 'pre',
      config: { toolId: 'id-assessment', ref: 'ma-pre', maxAttempts: 1 },
    })
  })

  it('still saves an existing native assessment item', async () => {
    prisma.courseItem.findUnique.mockResolvedValue({
      id: 'i1',
      type: 'assessment',
      module: { courseId: 'c1' },
    })
    await service.updateItem('u', 'agency-admin', 'i1', {
      type: 'assessment',
      title: 'Pre',
      label: 'pre',
      config: { questions: [quiz] },
    })
    expect(prisma.courseItem.update.mock.calls[0][0].data).toMatchObject({
      type: 'assessment',
      label: 'pre',
    })
  })
})

describe('CoursesService preview image', () => {
  const KEY = 'learn-images/0b9d1c64-3f0e-4d58-9c11-6a1f2f6a9d10.png'
  const link = (config: object) => ({
    id: 'i1',
    type: 'external_link',
    config,
    module: { courseId: 'c1' },
  })

  it('adds the image key to an external course item and keeps its other settings', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(
      link({ url: 'https://www.udemy.com/course/x/', summary: 'About' })
    )
    await service.setItemImage('u', 'agency-admin', 'i1', KEY)
    expect(prisma.courseItem.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { config: { url: 'https://www.udemy.com/course/x/', summary: 'About', imageKey: KEY } },
    })
  })

  it('removes the image key when cleared', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(
      link({ url: 'https://www.udemy.com/course/x/', imageKey: KEY })
    )
    await service.setItemImage('u', 'agency-admin', 'i1', null)
    expect(prisma.courseItem.update.mock.calls[0][0].data.config).toEqual({
      url: 'https://www.udemy.com/course/x/',
    })
  })

  it('refuses any other kind of item', async () => {
    prisma.courseItem.findUnique.mockResolvedValue({ ...link({}), type: 'lesson' })
    await expect(service.setItemImage('u', 'agency-admin', 'i1', KEY)).rejects.toThrow(
      BadRequestException
    )
    expect(prisma.courseItem.update).not.toHaveBeenCalled()
  })

  it('shows authors where the saved image is served from', async () => {
    prisma.courseModule.findMany.mockResolvedValue([
      {
        id: 'm1',
        title: 'M',
        position: 1,
        items: [
          {
            id: 'i1',
            moduleId: 'm1',
            type: 'external_link',
            title: 'Course',
            position: 1,
            label: null,
            config: { url: 'https://www.udemy.com/course/x/', imageKey: KEY },
          },
        ],
      },
    ])
    const detail = await service.detail('u', 'agency-admin', 'c1')
    expect(detail.modules[0].items[0].config.imageUrl).toEqual(expect.stringContaining(KEY))
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
