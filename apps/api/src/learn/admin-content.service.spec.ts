import { BadRequestException, ForbiddenException } from '@nestjs/common'
import type { PracticeContentView, PracticePort } from '../core/practice-port'
import type { LessonContentView, SparkPort } from '../core/spark-port'
import { AdminContentService } from './admin-content.service'
import { AccessService } from './access/access.service'
import { SYSTEM_ADMIN } from './access/permissions'

// Content review: a system admin approves AI-written content for reuse, through the Simulator's and Spark's ports.

const tokens = { input: 10, output: 5, cacheRead: 0, cacheWrite: null }
const practiceView: PracticeContentView = {
  id: 'p1',
  bankSlug: 'bank',
  skill: 'Joins',
  status: 'approved',
  intro: 'You mix up joins.',
  tasks: ['List orders with customers'],
  model: 'm',
  promptVersion: 'v1',
  tokens,
  createdAt: '2026-10-14T09:00:00.000Z',
  reviewedAt: null,
  reviewedBy: null,
  usedBy: [
    { userId: 'u1', itemId: 'i1', at: '2026-10-14T10:00:00.000Z' },
    { userId: 'u1', itemId: 'i2', at: '2026-10-14T11:00:00.000Z' },
    { userId: 'u2', itemId: 'i1', at: '2026-10-14T12:00:00.000Z' },
  ],
}
const lessonView: LessonContentView = {
  id: 'l1',
  skill: 'Joins',
  level: 'some SQL',
  status: 'approved',
  title: 'Joining two tables',
  scenes: [
    { heading: 'Why', narration: 'Two tables share a key.', visual: { kind: 'title', sub: '' } },
  ],
  model: 'm',
  promptVersion: 'v2',
  tokens,
  createdAt: '2026-10-14T09:00:00.000Z',
  reviewedAt: '2026-10-14T13:00:00.000Z',
  reviewedBy: 'admin-1',
  usedBy: [],
}

function setup() {
  const practice = {
    library: jest.fn(async () => ({ rows: [practiceView], total: 240 })),
    curate: jest.fn(async () => ({ ...practiceView, reviewedBy: 'admin-1' })),
  }
  const spark = {
    lessonLibrary: jest.fn(async () => ({ rows: [lessonView], total: 1 })),
    curateLesson: jest.fn(async () => lessonView),
    previewLink: jest.fn(async () => 'https://spark.example.test/lesson#token=t'),
  }
  const prisma = {
    user: {
      findMany: jest.fn(async () => [{ id: 'admin-1', displayName: 'Ada Admin', email: null }]),
    },
  }
  const service = new AdminContentService(
    prisma as never,
    new AccessService({} as never),
    practice as unknown as PracticePort,
    spark as unknown as SparkPort
  )
  return { service, practice, spark, prisma }
}

describe('AdminContentService', () => {
  it('refuses everyone but system admins, before reaching either port', async () => {
    const { service, practice, spark } = setup()
    for (const role of [undefined, 'agency-admin', 'provider-admin', 'instructor']) {
      await expect(service.library(role, 'all')).rejects.toThrow(ForbiddenException)
      await expect(service.curate('u1', role, 'practice', 'p1', true)).rejects.toThrow(
        ForbiddenException
      )
    }
    expect(practice.library).not.toHaveBeenCalled()
    expect(practice.curate).not.toHaveBeenCalled()
    expect(spark.lessonLibrary).not.toHaveBeenCalled()
    expect(spark.curateLesson).not.toHaveBeenCalled()
  })

  it('lists both libraries for the filter, needing review by default', async () => {
    const { service, practice, spark } = setup()
    const out = await service.library(SYSTEM_ADMIN, undefined)
    expect(practice.library).toHaveBeenCalledWith('needs-review')
    expect(spark.lessonLibrary).toHaveBeenCalledWith('needs-review')
    expect(out.practice[0]).toMatchObject({
      kind: 'practice',
      title: 'You mix up joins.',
      bankSlug: 'bank',
      reusable: false,
      parts: [{ heading: null, text: 'List orders with customers' }],
      uses: 3,
      learners: 2,
    })
    expect(out.lessons[0]).toMatchObject({
      kind: 'lesson',
      level: 'some SQL',
      reusable: true,
      reviewedBy: 'Ada Admin',
      parts: [{ heading: 'Why', text: 'Two tables share a key.' }],
      uses: 0,
    })
    // how many match in all, past the newest 200 listed
    expect(out.total).toEqual({ practice: 240, lessons: 1 })
  })

  it('refuses an unknown filter', async () => {
    const { service } = setup()
    await expect(service.library(SYSTEM_ADMIN, 'everything')).rejects.toThrow(BadRequestException)
  })

  it('curates through the port that owns the content, as the admin', async () => {
    const { service, practice, spark } = setup()
    const p = await service.curate('admin-1', SYSTEM_ADMIN, 'practice', 'p1', true)
    expect(practice.curate).toHaveBeenCalledWith('p1', true, 'admin-1')
    expect(p).toMatchObject({ kind: 'practice', reviewedBy: 'Ada Admin' })
    await service.curate('admin-1', SYSTEM_ADMIN, 'lesson', 'l1', false)
    expect(spark.curateLesson).toHaveBeenCalledWith('l1', false, 'admin-1')
  })

  it('links a system admin, and only a system admin, to watch a lesson', async () => {
    const { service, spark } = setup()
    for (const role of [undefined, 'agency-admin', 'provider-admin', 'instructor'])
      await expect(service.previewLesson('u1', role, 'l1')).rejects.toThrow(ForbiddenException)
    expect(spark.previewLink).not.toHaveBeenCalled()
    await expect(service.previewLesson('admin-1', SYSTEM_ADMIN, 'l1')).resolves.toEqual({
      url: 'https://spark.example.test/lesson#token=t',
    })
    expect(spark.previewLink).toHaveBeenCalledWith('l1', 'admin-1')
  })

  it('refuses an unknown kind or a missing decision', async () => {
    const { service, practice } = setup()
    await expect(service.curate('admin-1', SYSTEM_ADMIN, 'video', 'p1', true)).rejects.toThrow(
      BadRequestException
    )
    await expect(
      service.curate('admin-1', SYSTEM_ADMIN, 'practice', 'p1', undefined)
    ).rejects.toThrow(BadRequestException)
    expect(practice.curate).not.toHaveBeenCalled()
  })
})
