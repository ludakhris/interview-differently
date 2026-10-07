import { BadRequestException, ForbiddenException } from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service'
import { DataAccessLogService } from './data-access-log.service'
import type { ProviderAccessService } from './provider-access.service'
import { LearnService } from './learn.service'
import { ProviderAccessService as RealAccess } from './provider-access.service'

const create = jest.fn()
const findMany = jest.fn()
const userFindUnique = jest.fn()
const userFindMany = jest.fn()
const membershipFindFirst = jest.fn()
const prisma = {
  dataAccessLog: { create, findMany },
  user: { findUnique: userFindUnique, findMany: userFindMany },
  membership: { findFirst: membershipFindFirst },
} as unknown as PrismaService
// The real access rules over a fake membership table: only 'staff-p1' belongs to P1.
membershipFindFirst.mockImplementation(async ({ where }) =>
  where.userId === 'staff-p1' && where.institutionId === 'P1' && where.cohortId === null
    ? { id: 'm' }
    : null
)
const access: ProviderAccessService = new RealAccess(prisma, new LearnService(prisma))
const log = new DataAccessLogService(prisma, access)

beforeEach(() => {
  jest.clearAllMocks()
  membershipFindFirst.mockImplementation(async ({ where }) =>
    where.userId === 'staff-p1' && where.institutionId === 'P1' && where.cohortId === null
      ? { id: 'm' }
      : null
  )
  findMany.mockResolvedValue([])
  userFindMany.mockResolvedValue([])
})

describe('DataAccessLogService.record', () => {
  it('writes one row, looking the actor name up when it is not given', async () => {
    userFindUnique.mockResolvedValue({ displayName: 'Dana Reyes', email: 'd@x.org' })
    await log.record({
      actorId: 'staff-p1',
      providerId: 'P1',
      subjectUserId: 'learner-1',
      resource: 'note',
      action: 'read',
    })
    expect(create).toHaveBeenCalledWith({
      data: {
        actorId: 'staff-p1',
        actorName: 'Dana Reyes',
        providerId: 'P1',
        subjectUserId: 'learner-1',
        resource: 'note',
        action: 'read',
        detail: null,
      },
    })
  })
  it('keeps a given actor name, allows a bulk row with no subject, and trims detail to 200', async () => {
    await log.record({
      actorId: 'a',
      actorName: 'Given',
      providerId: 'P1',
      resource: 'talent_profile',
      action: 'export',
      detail: 'x'.repeat(500),
    })
    const data = create.mock.calls[0][0].data
    expect(data.actorName).toBe('Given')
    expect(data.subjectUserId).toBeNull()
    expect(data.detail).toHaveLength(200)
    expect(userFindUnique).not.toHaveBeenCalled()
  })
  it('refuses an unknown resource or action rather than writing a row nobody can read', async () => {
    await expect(
      log.record({
        actorId: 'a',
        actorName: 'A',
        providerId: 'P1',
        resource: 'oops' as never,
        action: 'read',
      })
    ).rejects.toThrow()
    await expect(
      log.record({
        actorId: 'a',
        actorName: 'A',
        providerId: 'P1',
        resource: 'note',
        action: 'oops' as never,
      })
    ).rejects.toThrow()
    expect(create).not.toHaveBeenCalled()
  })
  it('fails when the write fails, so a read cannot go ahead untraced', async () => {
    create.mockRejectedValueOnce(new Error('db down'))
    await expect(
      log.record({
        actorId: 'a',
        actorName: 'A',
        providerId: 'P1',
        resource: 'note',
        action: 'read',
      })
    ).rejects.toThrow('db down')
  })
})

describe('DataAccessLogService.list', () => {
  it('lets provider staff read their own provider log', async () => {
    await expect(log.list('staff-p1', 'provider-admin', { providerId: 'P1' })).resolves.toEqual({
      rows: [],
      nextBefore: null,
    })
    expect(findMany.mock.calls[0][0].where).toEqual({ providerId: 'P1' })
  })
  it('lets a system admin read any provider, or all of them', async () => {
    await log.list('root', 'system-admin', { providerId: 'P2' })
    await log.list('root', 'system-admin', {})
    expect(findMany.mock.calls[0][0].where).toEqual({ providerId: 'P2' })
    expect(findMany.mock.calls[1][0].where).toEqual({})
  })
  it('refuses a learner, organization staff, an agency admin and another provider staff', async () => {
    await expect(log.list('learner-1', undefined, { providerId: 'P1' })).rejects.toThrow(
      ForbiddenException
    )
    await expect(log.list('staff-o1', 'provider-admin', { providerId: 'P1' })).rejects.toThrow(
      ForbiddenException
    )
    await expect(log.list('agency-1', 'agency-admin', { providerId: 'P1' })).rejects.toThrow(
      ForbiddenException
    )
    await expect(log.list('staff-p2', 'provider-admin', { providerId: 'P1' })).rejects.toThrow(
      ForbiddenException
    )
    expect(findMany).not.toHaveBeenCalled()
  })
  it('makes provider staff name a provider', async () => {
    await expect(log.list('staff-p1', 'provider-admin', {})).rejects.toThrow(BadRequestException)
  })
  it('pages newest first and names the participants', async () => {
    const row = (id: string, at: string) => ({
      id,
      actorId: 'staff-p1',
      actorName: 'Dana',
      providerId: 'P1',
      subjectUserId: 'learner-1',
      resource: 'compensation',
      action: 'read',
      detail: null,
      createdAt: new Date(at),
    })
    findMany.mockResolvedValue([
      row('3', '2026-10-03T00:00:00Z'),
      row('2', '2026-10-02T00:00:00Z'),
      row('1', '2026-10-01T00:00:00Z'),
    ])
    userFindMany.mockResolvedValue([{ id: 'learner-1', displayName: 'Lee', email: null }])
    const out = await log.list('staff-p1', 'provider-admin', { providerId: 'P1', limit: 2 })
    expect(findMany.mock.calls[0][0].take).toBe(3)
    expect(out.rows.map((r) => r.id)).toEqual(['3', '2'])
    expect(out.rows[0].subjectName).toBe('Lee')
    expect(out.nextBefore).toBe('2026-10-02T00:00:00.000Z')
  })
  it('rejects a bad cursor or resource filter', async () => {
    await expect(log.list('root', 'system-admin', { before: 'not a date' })).rejects.toThrow(
      BadRequestException
    )
    await expect(log.list('root', 'system-admin', { resource: 'oops' })).rejects.toThrow(
      BadRequestException
    )
  })
})
