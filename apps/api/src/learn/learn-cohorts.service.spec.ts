import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service'
import { LearnCohortsService } from './learn-cohorts.service'
import type { LearnService } from './learn.service'
import type { LearnerService } from './learner.service'
import type { DataAccessLogService } from './data-access-log.service'
import type { ProviderAccessService } from './provider-access.service'
import { ParticipantNotesService } from './talent/participant-notes.service'

const prisma = {
  institution: { findFirst: jest.fn(), findMany: jest.fn() },
  course: { findMany: jest.fn(), findUnique: jest.fn() },
  cohort: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  enrollment: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  courseItem: { findUnique: jest.fn() },
  itemProgress: { findUnique: jest.fn() },
  membership: { upsert: jest.fn() },
  joinRequest: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
  user: { findUnique: jest.fn() },
  participantNote: { groupBy: jest.fn() },
  attendanceMark: { groupBy: jest.fn() },
  supportItem: { groupBy: jest.fn() },
  courseOffer: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
}
const learn = { assertRole: jest.fn(), assertWorkspace: jest.fn() }
const learner = { recomputeCompletion: jest.fn(), attemptLogOf: jest.fn() }
const access = { assertProviderStaff: jest.fn(), scopeForCohort: jest.fn() }
const service = new LearnCohortsService(
  prisma as unknown as PrismaService,
  learn as unknown as LearnService,
  learner as unknown as LearnerService,
  new ParticipantNotesService(
    prisma as unknown as PrismaService,
    access as unknown as ProviderAccessService,
    {} as unknown as DataAccessLogService
  )
)

const ws = { id: 'w1', name: 'Harbor Point', kind: 'provider', subdomain: 'harborpoint' }
const runnable = [{ id: 'c1', title: 'MA', lengthWeeks: 16, provider: { name: 'Harbor Point' } }]
const future = new Date('2099-01-01T00:00:00Z')

function cohortRow(over: object = {}) {
  return {
    id: 'k1',
    name: 'MA 2099',
    joinKey: 'ABCD2345',
    startsAt: future,
    endsAt: new Date('2099-04-23T00:00:00Z'),
    delivery: 'online',
    institution: { id: 'w1', name: 'Harbor Point', subdomain: 'harborpoint' },
    course: {
      id: 'c1',
      title: 'MA',
      providerId: 'w1',
      lengthWeeks: 16,
      modules: [{ _count: { items: 5 } }],
    },
    ...over,
  }
}

beforeEach(() => {
  jest.resetAllMocks()
  prisma.institution.findFirst.mockResolvedValue(ws)
  prisma.course.findMany.mockResolvedValue(runnable)
  prisma.cohort.findFirst.mockResolvedValue(null) // join key free
  prisma.cohort.findUnique.mockResolvedValue(null)
  prisma.enrollment.findMany.mockResolvedValue([])
  prisma.joinRequest.count.mockResolvedValue(0)
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma))
})

describe('create', () => {
  const body = { courseId: 'c1', name: 'Fall', startsAt: '2099-01-01' }

  it('rejects a course this workspace cannot run', async () => {
    prisma.course.findMany.mockResolvedValue([])
    await expect(service.create('u', 'agency-admin', 'harborpoint', body)).rejects.toThrow(
      BadRequestException
    )
  })

  it('needs a course length, since a cohort lasts exactly that long', async () => {
    prisma.course.findMany.mockResolvedValue([{ ...runnable[0], lengthWeeks: null }])
    await expect(service.create('u', 'agency-admin', 'harborpoint', body)).rejects.toThrow(/length/)
  })

  it('sets the end from the start and course length, and generates a join code', async () => {
    prisma.cohort.create.mockResolvedValue({ id: 'k1' })
    prisma.cohort.findUnique.mockResolvedValue(cohortRow())
    await service.create('u', 'agency-admin', 'harborpoint', body)
    const data = prisma.cohort.create.mock.calls[0][0].data
    expect(data.institutionId).toBe('w1')
    expect(data.endsAt.toISOString()).toBe('2099-04-23T00:00:00.000Z')
    expect(data.joinKey).toMatch(/^[A-Z2-9]{8}$/)
  })

  it('stores the size limit, and checks codes without regard to case', async () => {
    prisma.cohort.create.mockResolvedValue({ id: 'k1' })
    prisma.cohort.findUnique.mockResolvedValue(cohortRow())
    await service.create('u', 'agency-admin', 'harborpoint', { ...body, maxLearners: 30 })
    expect(prisma.cohort.create.mock.calls[0][0].data.maxLearners).toBe(30)
    expect(prisma.cohort.findFirst.mock.calls[0][0].where.joinKey.mode).toBe('insensitive')
  })

  it('defaults delivery to online, and stores live or hybrid when asked (#69)', async () => {
    prisma.cohort.create.mockResolvedValue({ id: 'k1' })
    prisma.cohort.findUnique.mockResolvedValue(cohortRow())
    await service.create('u', 'agency-admin', 'harborpoint', body)
    expect(prisma.cohort.create.mock.calls[0][0].data.delivery).toBe('online')
    await service.create('u', 'agency-admin', 'harborpoint', { ...body, delivery: 'hybrid' })
    expect(prisma.cohort.create.mock.calls[1][0].data.delivery).toBe('hybrid')
    await expect(
      service.create('u', 'agency-admin', 'harborpoint', { ...body, delivery: 'teleport' })
    ).rejects.toThrow(/Delivery/)
  })

  it('does not let an agency run cohorts', async () => {
    prisma.institution.findFirst.mockResolvedValue({ ...ws, kind: 'agency' })
    await expect(service.create('u', 'agency-admin', 'harborpoint', body)).rejects.toThrow(
      BadRequestException
    )
  })
})

describe('update', () => {
  it('moves the end with the start while the cohort has not started', async () => {
    prisma.cohort.findUnique.mockResolvedValue(cohortRow())
    await service.update('u', 'agency-admin', 'k1', { startsAt: '2099-02-01' })
    expect(prisma.cohort.update.mock.calls[0][0].data.endsAt.toISOString()).toBe(
      '2099-05-24T00:00:00.000Z'
    )
  })

  it('refuses to move the start of a cohort that is running', async () => {
    prisma.cohort.findUnique.mockResolvedValue(
      cohortRow({
        startsAt: new Date('2020-01-01T00:00:00Z'),
        endsAt: new Date('2099-01-01T00:00:00Z'),
      })
    )
    await expect(
      service.update('u', 'agency-admin', 'k1', { startsAt: '2099-02-01' })
    ).rejects.toThrow(ConflictException)
  })
})

describe('addLearner', () => {
  beforeEach(() => prisma.cohort.findUnique.mockResolvedValue(cohortRow()))

  it('explains that the person must sign in first and offers the join code', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    await expect(
      service.addLearner('u', 'agency-admin', 'k1', { email: 'ann@example.com' })
    ).rejects.toThrow(/ABCD2345/)
  })

  it('looks up the email among LearnDifferently users only', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    await service
      .addLearner('u', 'agency-admin', 'k1', { email: 'Ann@Example.com' })
      .catch(() => undefined)
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email_source: { email: 'ann@example.com', source: 'learn' } },
    })
  })

  it('rejects someone already enrolled, and re-enrolls someone who withdrew', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'l1' })
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1', status: 'enrolled' })
    await expect(
      service.addLearner('u', 'agency-admin', 'k1', { email: 'ann@example.com' })
    ).rejects.toThrow(ConflictException)
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1', status: 'withdrawn' })
    await service.addLearner('u', 'agency-admin', 'k1', { email: 'ann@example.com' })
    expect(prisma.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { status: 'enrolled' },
    })
  })
})

describe('recompute', () => {
  it('recomputes the learner after checking the staff member may manage the cohort', async () => {
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1', cohortId: 'k1' })
    prisma.cohort.findUnique.mockResolvedValue(cohortRow())
    learner.recomputeCompletion.mockResolvedValue({ change: 'reopened' })
    const out = await service.recompute('u', 'agency-admin', 'e1')
    expect(learner.recomputeCompletion).toHaveBeenCalledWith('e1')
    expect(out.change).toBe('reopened')
    expect(out.cohort.id).toBe('k1')
  })

  it('refuses an enrollment that does not exist, and does not recompute it', async () => {
    learner.recomputeCompletion.mockClear()
    prisma.enrollment.findUnique.mockResolvedValue(null)
    await expect(service.recompute('u', 'agency-admin', 'nope')).rejects.toThrow(NotFoundException)
    expect(learner.recomputeCompletion).not.toHaveBeenCalled()
  })
})

describe('attempts', () => {
  const toolItem = { id: 'i1', type: 'tool', label: null, config: {}, module: { courseId: 'c1' } }
  beforeEach(() => {
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1', cohortId: 'k1' })
    prisma.cohort.findUnique.mockResolvedValue(cohortRow())
    prisma.courseItem.findUnique.mockResolvedValue(toolItem)
    prisma.itemProgress.findUnique.mockResolvedValue({ attempts: 4 })
    learner.attemptLogOf.mockResolvedValue({ attemptLog: [], attemptsBeforeLog: 4 })
  })

  it('returns the learner log after the same staff checks as recompute', async () => {
    const out = await service.attempts('u', 'agency-admin', 'e1', 'i1')
    expect(learn.assertRole).toHaveBeenCalled()
    expect(learn.assertWorkspace).toHaveBeenCalledWith('u', 'agency-admin', 'harborpoint')
    expect(learner.attemptLogOf).toHaveBeenCalledWith('e1', toolItem, 4, null)
    expect(out).toEqual({ attempts: [], attemptsBeforeLog: 4 })
  })

  it('refuses staff of another workspace, reading nothing', async () => {
    learn.assertWorkspace.mockRejectedValue(new ForbiddenException())
    await expect(service.attempts('u', 'agency-admin', 'e1', 'i1')).rejects.toThrow(
      ForbiddenException
    )
    expect(learner.attemptLogOf).not.toHaveBeenCalled()
  })

  it('refuses a role that may not manage cohorts', async () => {
    learn.assertRole.mockImplementation(() => {
      throw new ForbiddenException()
    })
    await expect(service.attempts('u', 'learner', 'e1', 'i1')).rejects.toThrow(ForbiddenException)
    expect(learner.attemptLogOf).not.toHaveBeenCalled()
  })

  it('refuses an unknown enrollment, a missing itemId, and an item outside the course or not a tool', async () => {
    prisma.enrollment.findUnique.mockResolvedValueOnce(null)
    await expect(service.attempts('u', 'agency-admin', 'x', 'i1')).rejects.toThrow(
      NotFoundException
    )
    await expect(service.attempts('u', 'agency-admin', 'e1', undefined)).rejects.toThrow(
      BadRequestException
    )
    prisma.courseItem.findUnique.mockResolvedValueOnce({ ...toolItem, module: { courseId: 'c9' } })
    await expect(service.attempts('u', 'agency-admin', 'e1', 'i1')).rejects.toThrow(
      NotFoundException
    )
    prisma.courseItem.findUnique.mockResolvedValueOnce({ ...toolItem, type: 'lesson' })
    await expect(service.attempts('u', 'agency-admin', 'e1', 'i1')).rejects.toThrow(
      NotFoundException
    )
  })
})

describe('unoffer', () => {
  it('will not take a course back from an organization that has cohorts of it', async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: 'c1',
      provider: { id: 'w1', subdomain: 'harborpoint', parentId: 'a1' },
    })
    prisma.institution.findFirst.mockResolvedValue({ id: 'o1' })
    prisma.cohort.count.mockResolvedValue(1)
    await expect(service.unoffer('u', 'agency-admin', 'c1', 'wilmington')).rejects.toThrow(
      ConflictException
    )
    expect(prisma.courseOffer.deleteMany).not.toHaveBeenCalled()
  })

  it('reports an unknown organization', async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: 'c1',
      provider: { id: 'w1', subdomain: 'harborpoint', parentId: 'a1' },
    })
    prisma.institution.findFirst.mockResolvedValue(null)
    await expect(service.unoffer('u', 'agency-admin', 'c1', 'nope')).rejects.toThrow(
      NotFoundException
    )
  })
})

describe('size limit', () => {
  beforeEach(() => prisma.cohort.findUnique.mockResolvedValue(cohortRow({ maxLearners: 2 })))

  it('will not add a learner to a full cohort', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'l1' })
    prisma.enrollment.findUnique.mockResolvedValue(null)
    prisma.enrollment.count.mockResolvedValue(2)
    await expect(
      service.addLearner('u', 'agency-admin', 'k1', { email: 'a@b.co' })
    ).rejects.toThrow(/full/)
    expect(prisma.enrollment.create).not.toHaveBeenCalled()
  })

  it('adds a learner while there is room, counting only people who have not withdrawn', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'l1' })
    prisma.enrollment.findUnique.mockResolvedValue(null)
    prisma.enrollment.count.mockResolvedValue(1)
    await service.addLearner('u', 'agency-admin', 'k1', { email: 'a@b.co' })
    expect(prisma.enrollment.count).toHaveBeenCalledWith({
      where: { cohortId: 'k1', status: { not: 'withdrawn' } },
    })
    expect(prisma.enrollment.create).toHaveBeenCalled()
  })

  it('will not lower the limit below the people already in', async () => {
    prisma.enrollment.count.mockResolvedValue(5)
    await expect(service.update('u', 'agency-admin', 'k1', { maxLearners: 3 })).rejects.toThrow(
      /5 learners/
    )
    expect(prisma.cohort.update).not.toHaveBeenCalled()
  })

  it('lets the limit be cleared', async () => {
    await service.update('u', 'agency-admin', 'k1', { maxLearners: null })
    expect(prisma.cohort.update.mock.calls[0][0].data.maxLearners).toBeNull()
  })
})

describe('join requests (#68)', () => {
  const request = { id: 'r1', cohortId: 'k1', userId: 'l1', status: 'pending' }
  beforeEach(() => {
    prisma.cohort.findUnique.mockResolvedValue(cohortRow())
    prisma.joinRequest.findUnique.mockResolvedValue(request)
    prisma.joinRequest.updateMany.mockResolvedValue({ count: 1 })
    prisma.enrollment.findUnique.mockResolvedValue(null)
    prisma.enrollment.count.mockResolvedValue(0)
  })

  it('lists pending requests only, with name and email', async () => {
    prisma.joinRequest.findMany.mockResolvedValue([
      {
        id: 'r1',
        userId: 'l1',
        createdAt: new Date('2026-10-07T12:00:00Z'),
        user: { displayName: 'Ann', email: 'a@b.co' },
      },
    ])
    const out = await service.joinRequests('u', 'agency-admin', 'k1')
    expect(prisma.joinRequest.findMany.mock.calls[0][0].where).toEqual({
      cohortId: 'k1',
      status: 'pending',
    })
    expect(out).toEqual([
      {
        id: 'r1',
        userId: 'l1',
        name: 'Ann',
        email: 'a@b.co',
        requestedAt: '2026-10-07T12:00:00.000Z',
      },
    ])
  })

  it('approve enrolls, adds the membership and marks the request, in one transaction', async () => {
    await service.approveRequest('u', 'agency-admin', 'r1')
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.joinRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', status: 'pending' },
      data: { status: 'approved', decidedAt: expect.any(Date), decidedBy: 'u' },
    })
    expect(prisma.enrollment.create).toHaveBeenCalledWith({
      data: { cohortId: 'k1', userId: 'l1' },
    })
    expect(prisma.membership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { userId: 'l1', institutionId: 'w1', cohortId: 'k1' },
      })
    )
  })

  it('approve revives a withdrawn enrollment instead of creating another', async () => {
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1', status: 'withdrawn' })
    await service.approveRequest('u', 'agency-admin', 'r1')
    expect(prisma.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { status: 'enrolled' },
    })
    expect(prisma.enrollment.create).not.toHaveBeenCalled()
  })

  it('approve fails with 409 when the cohort is full', async () => {
    prisma.cohort.findUnique.mockResolvedValue(cohortRow({ maxLearners: 2 }))
    prisma.enrollment.count.mockResolvedValue(2)
    await expect(service.approveRequest('u', 'agency-admin', 'r1')).rejects.toThrow(/full/)
    expect(prisma.enrollment.create).not.toHaveBeenCalled()
    expect(prisma.membership.upsert).not.toHaveBeenCalled()
  })

  it('approving twice: the second is a 409 and creates nothing', async () => {
    // Both calls saw a pending request; only the first wins the claim.
    prisma.joinRequest.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
    const [a, b] = await Promise.allSettled([
      service.approveRequest('u', 'agency-admin', 'r1'),
      service.approveRequest('u', 'agency-admin', 'r1'),
    ])
    expect(a.status).toBe('fulfilled')
    expect(b.status).toBe('rejected')
    expect((b as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException)
    expect(prisma.enrollment.create).toHaveBeenCalledTimes(1)
  })

  it('approve or decline of an already decided request is a 409, an unknown one a 404', async () => {
    prisma.joinRequest.findUnique.mockResolvedValue({ ...request, status: 'declined' })
    await expect(service.approveRequest('u', 'agency-admin', 'r1')).rejects.toThrow(
      ConflictException
    )
    await expect(service.declineRequest('u', 'agency-admin', 'r1')).rejects.toThrow(
      ConflictException
    )
    prisma.joinRequest.findUnique.mockResolvedValue(null)
    await expect(service.approveRequest('u', 'agency-admin', 'nope')).rejects.toThrow(
      NotFoundException
    )
  })

  it('decline keeps the record and creates no enrollment', async () => {
    await service.declineRequest('u', 'agency-admin', 'r1')
    expect(prisma.joinRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', status: 'pending' },
      data: { status: 'declined', decidedAt: expect.any(Date), decidedBy: 'u' },
    })
    expect(prisma.enrollment.create).not.toHaveBeenCalled()
    expect(prisma.membership.upsert).not.toHaveBeenCalled()
  })

  it('refuses staff of another workspace, as for adding a learner', async () => {
    learn.assertWorkspace.mockRejectedValue(new ForbiddenException('No access to this workspace'))
    await expect(service.approveRequest('u', 'agency-admin', 'r1')).rejects.toThrow(
      ForbiddenException
    )
    await expect(service.declineRequest('u', 'agency-admin', 'r1')).rejects.toThrow(
      ForbiddenException
    )
    await expect(service.joinRequests('u', 'agency-admin', 'k1')).rejects.toThrow(
      ForbiddenException
    )
    expect(prisma.joinRequest.updateMany).not.toHaveBeenCalled()
  })

  it('pending requests are not on the roster or in the enrolled count', async () => {
    prisma.joinRequest.count.mockResolvedValue(3)
    const d = await service.detail('u', 'agency-admin', 'k1')
    expect(d.pendingRequests).toBe(3)
    expect(d.roster).toEqual([])
    expect(d.enrolled).toBe(0)
  })
})

describe('delivery (#69)', () => {
  it('changes on update, is refused when unknown, and is carried on the detail', async () => {
    prisma.cohort.findUnique.mockResolvedValue(cohortRow({ delivery: 'live' }))
    await service.update('u', 'agency-admin', 'k1', { delivery: 'live' })
    expect(prisma.cohort.update.mock.calls[0][0].data.delivery).toBe('live')
    await expect(service.update('u', 'agency-admin', 'k1', { delivery: 'x' })).rejects.toThrow(
      BadRequestException
    )
    expect((await service.detail('u', 'agency-admin', 'k1')).delivery).toBe('live')
  })

  it('leaves delivery alone when an update does not mention it', async () => {
    prisma.cohort.findUnique.mockResolvedValue(cohortRow())
    await service.update('u', 'agency-admin', 'k1', { name: 'Renamed' })
    expect(prisma.cohort.update.mock.calls[0][0].data).not.toHaveProperty('delivery')
  })
})

describe('profile requirement (#69)', () => {
  const body = { courseId: 'c1', name: 'MA', startsAt: '2099-01-05' }
  it('defaults to not required with no refresh, and stores both on create', async () => {
    prisma.cohort.create.mockResolvedValue({ id: 'k1' })
    prisma.cohort.findUnique.mockResolvedValue(cohortRow())
    await service.create('u', 'agency-admin', 'harborpoint', body)
    expect(prisma.cohort.create.mock.calls[0][0].data).toMatchObject({
      requiresProfile: false,
      profileRefreshMonths: null,
    })
    await service.create('u', 'agency-admin', 'harborpoint', {
      ...body,
      requiresProfile: true,
      profileRefreshMonths: 12,
    })
    expect(prisma.cohort.create.mock.calls[1][0].data).toMatchObject({
      requiresProfile: true,
      profileRefreshMonths: 12,
    })
    await expect(
      service.create('u', 'agency-admin', 'harborpoint', { ...body, profileRefreshMonths: 12 })
    ).rejects.toThrow(/Require the profile/)
  })
  it('changes on update, clears the period when the requirement goes off, and is carried on the detail and list', async () => {
    prisma.cohort.findUnique.mockResolvedValue(
      cohortRow({ requiresProfile: true, profileRefreshMonths: 6 })
    )
    await service.update('u', 'agency-admin', 'k1', { profileRefreshMonths: 3 })
    expect(prisma.cohort.update.mock.calls[0][0].data).toMatchObject({ profileRefreshMonths: 3 })
    await service.update('u', 'agency-admin', 'k1', { requiresProfile: false })
    expect(prisma.cohort.update.mock.calls[1][0].data).toMatchObject({
      requiresProfile: false,
      profileRefreshMonths: null,
    })
    await expect(
      service.update('u', 'agency-admin', 'k1', { profileRefreshMonths: 99 })
    ).rejects.toThrow(BadRequestException)
    expect(await service.detail('u', 'agency-admin', 'k1')).toMatchObject({
      requiresProfile: true,
      profileRefreshMonths: 6,
    })
  })
  it('leaves both alone when an update does not mention them', async () => {
    prisma.cohort.findUnique.mockResolvedValue(cohortRow())
    await service.update('u', 'agency-admin', 'k1', { name: 'Renamed' })
    const data = prisma.cohort.update.mock.calls[0][0].data
    expect(data).not.toHaveProperty('requiresProfile')
    expect(data).not.toHaveProperty('profileRefreshMonths')
  })
})

describe('approval setting (#68)', () => {
  beforeEach(() => prisma.cohort.findUnique.mockResolvedValue(cohortRow()))
  const stored = { requiresApproval: false, joinContact: null }

  it('requires a contact when approval is turned on', async () => {
    prisma.cohort.findUnique.mockResolvedValue(cohortRow(stored))
    await expect(
      service.update('u', 'agency-admin', 'k1', { requiresApproval: true })
    ).rejects.toThrow(BadRequestException)
    await expect(
      service.update('u', 'agency-admin', 'k1', { requiresApproval: true, joinContact: '  ' })
    ).rejects.toThrow(/contact/i)
    expect(prisma.cohort.update).not.toHaveBeenCalled()
  })

  it('refuses a contact over 200 characters and clearing the contact while approval is on', async () => {
    await expect(
      service.update('u', 'agency-admin', 'k1', { joinContact: 'x'.repeat(201) })
    ).rejects.toThrow(BadRequestException)
    prisma.cohort.findUnique.mockResolvedValue(
      cohortRow({ requiresApproval: true, joinContact: 'Dana' })
    )
    await expect(service.update('u', 'agency-admin', 'k1', { joinContact: null })).rejects.toThrow(
      BadRequestException
    )
  })

  it('saves approval with a contact, and turning approval off needs none', async () => {
    prisma.cohort.findUnique.mockResolvedValue(cohortRow(stored))
    await service.update('u', 'agency-admin', 'k1', {
      requiresApproval: true,
      joinContact: ' Dana Reyes, dana@example.org ',
    })
    expect(prisma.cohort.update.mock.calls[0][0].data).toMatchObject({
      requiresApproval: true,
      joinContact: 'Dana Reyes, dana@example.org',
    })
    prisma.cohort.update.mockClear()
    prisma.cohort.findUnique.mockResolvedValue(
      cohortRow({ requiresApproval: true, joinContact: 'Dana' })
    )
    await service.update('u', 'agency-admin', 'k1', { requiresApproval: false })
    expect(prisma.cohort.update.mock.calls[0][0].data.requiresApproval).toBe(false)
  })
})

describe('roster note indicators', () => {
  const enrollment = (userId: string, name: string) => ({
    id: `e-${userId}`,
    userId,
    status: 'enrolled',
    enrolledAt: new Date('2099-01-02T00:00:00Z'),
    user: { displayName: name, email: `${userId}@x.org` },
    progress: [],
  })
  beforeEach(() => {
    // The scope is the course's provider when the caller is its staff (as the real service decides it).
    access.scopeForCohort.mockImplementation(
      async (u: string, r: string, ctx: { providerId: string }) => {
        try {
          await access.assertProviderStaff(u, r, ctx.providerId)
          return ctx.providerId
        } catch {
          return null
        }
      }
    )
    prisma.cohort.findUnique.mockResolvedValue(cohortRow())
    prisma.joinRequest.count.mockResolvedValue(0)
    prisma.enrollment.findMany.mockResolvedValue([
      enrollment('a', 'Ann'),
      enrollment('b', 'Bo'),
      enrollment('me', 'Staff Self'),
    ])
    prisma.participantNote.groupBy.mockResolvedValue([{ userId: 'a', _count: { _all: 2 } }])
    prisma.attendanceMark.groupBy.mockResolvedValue([
      { userId: 'a', _count: { _all: 1 } },
      { userId: 'b', _count: { _all: 1 } },
    ])
    prisma.supportItem.groupBy.mockResolvedValue([{ userId: 'b', _count: { _all: 1 } }])
  })

  it('counts notes (plus attendance notes in this cohort) and open follow-ups, one grouped query per kind', async () => {
    const d = await service.detail('me', 'provider-admin', 'k1')
    expect(access.assertProviderStaff).toHaveBeenCalledWith('me', 'provider-admin', 'w1')
    const by = Object.fromEntries(d.roster.map((r) => [r.userId, r.noteSummary]))
    expect(by.a).toEqual({ notes: 3, openFollowUps: 0 })
    expect(by.b).toEqual({ notes: 1, openFollowUps: 1 })
    expect(prisma.participantNote.groupBy).toHaveBeenCalledTimes(1)
    expect(prisma.attendanceMark.groupBy).toHaveBeenCalledTimes(1)
    expect(prisma.supportItem.groupBy).toHaveBeenCalledTimes(1)
    expect(prisma.supportItem.groupBy.mock.calls[0][0].where).toMatchObject({
      providerId: 'w1',
      status: { in: ['open', 'in_progress'] },
    })
    expect(prisma.attendanceMark.groupBy.mock.calls[0][0].where).toMatchObject({
      session: { cohortId: 'k1' },
    })
  })

  it('never shows a person their own counts', async () => {
    const d = await service.detail('me', 'provider-admin', 'k1')
    expect(d.roster.find((r) => r.userId === 'me')?.noteSummary).toBeNull()
    const ids = prisma.participantNote.groupBy.mock.calls[0][0].where.userId.in
    expect(ids).not.toContain('me')
  })

  it('is null on every row, with no counting, for cohort staff who are not provider staff', async () => {
    access.assertProviderStaff.mockRejectedValue(new ForbiddenException('No access'))
    const d = await service.detail('x', 'agency-admin', 'k1')
    expect(d.roster).toHaveLength(3)
    expect(d.roster.every((r) => r.noteSummary === null)).toBe(true)
    expect(prisma.participantNote.groupBy).not.toHaveBeenCalled()
    expect(prisma.attendanceMark.groupBy).not.toHaveBeenCalled()
    expect(prisma.supportItem.groupBy).not.toHaveBeenCalled()
  })

  it('carries counts only: no note text, titles or ids in the payload, and no bodies are selected', async () => {
    const d = await service.detail('me', 'provider-admin', 'k1')
    const json = JSON.stringify(d.roster)
    for (const row of d.roster) {
      expect(Object.keys(row.noteSummary ?? {}).sort()).toEqual(
        row.noteSummary ? ['notes', 'openFollowUps'] : []
      )
    }
    expect(json).not.toMatch(/body|title|details|note"/i)
    for (const m of [prisma.participantNote, prisma.attendanceMark, prisma.supportItem]) {
      expect(m.groupBy.mock.calls[0][0].by).toEqual(['userId'])
    }
  })
})
