import { ForbiddenException, NotFoundException } from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service'
import { AccessService } from './access/access.service'
import { LearnService } from './learn.service'

const findMany = jest.fn()
const cohortFindMany = jest.fn()
const groupBy = jest.fn()
const membershipFindMany = jest.fn()
const institutionFindFirst = jest.fn()
const prisma = {
  institution: { findMany, findFirst: institutionFindFirst },
  cohort: { findMany: cohortFindMany },
  course: { groupBy },
  membership: { findMany: membershipFindMany },
} as unknown as PrismaService
const access = new AccessService(prisma)
const service = new LearnService(prisma, access)

const delaware = {
  id: 'a1',
  name: 'Delaware DoL',
  kind: 'agency',
  subdomain: 'delaware',
  parentId: null,
  featuredDemo: false,
}

const member = (institutionId: string, role: string, kind = 'agency') => ({
  institutionId,
  cohortId: null,
  role,
  institution: { kind, parentId: null, subdomain: null },
})

describe('LearnService workspaces', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    membershipFindMany.mockResolvedValue([])
  })

  it('gives a member the institutions they hold a role in, with that role', async () => {
    membershipFindMany.mockResolvedValue([member('a1', 'agency-admin')])
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([delaware])
    await expect(service.workspaces('u1', undefined)).resolves.toEqual([
      { ...delaware, role: 'agency-admin' },
    ])
  })

  it('gives a system admin every agency and the institutions under one', async () => {
    findMany.mockResolvedValue([delaware])
    await expect(service.workspaces('u1', 'system-admin')).resolves.toEqual([
      { ...delaware, role: 'system-admin' },
    ])
    expect(findMany.mock.calls[0][0].where).toEqual({
      subdomain: { not: null },
      OR: [{ kind: 'agency' }, { parent: { kind: 'agency' } }],
    })
    expect(findMany.mock.calls[0][0].select.featuredDemo).toBe(true)
  })

  it('gives someone with no role nothing, and reads no institutions', async () => {
    await expect(service.workspaces('u2', undefined)).resolves.toEqual([])
    expect(findMany).not.toHaveBeenCalled()
  })

  it('allows a workspace the caller holds a role in and rejects one they do not', async () => {
    membershipFindMany.mockResolvedValue([member('a1', 'agency-admin')])
    institutionFindFirst.mockResolvedValueOnce({ id: 'a1', parentId: null })
    await expect(service.assertWorkspace('u1', undefined, 'delaware')).resolves.toBeUndefined()
    institutionFindFirst.mockResolvedValueOnce({ id: 'a2', parentId: null })
    await expect(service.assertWorkspace('u1', undefined, 'other')).rejects.toThrow(
      ForbiddenException
    )
    institutionFindFirst.mockResolvedValueOnce(null)
    await expect(service.assertWorkspace('u1', undefined, 'nope')).rejects.toThrow(
      ForbiddenException
    )
  })
})

describe('LearnService reports', () => {
  const authorize = jest.fn()
  const instructorCohortsIn = jest.fn()
  const reports = new LearnService(prisma, {
    authorize,
    instructorCohortsIn,
  } as unknown as AccessService)
  const actor = { userId: 'u1', role: 'agency-admin' }
  beforeEach(() => {
    jest.clearAllMocks()
    authorize.mockResolvedValue(undefined)
    instructorCohortsIn.mockResolvedValue(null)
    institutionFindFirst.mockResolvedValue({ id: 'a1', name: 'Delaware DoL', kind: 'agency' })
  })

  it('asks for outcomes.read, gradebook.read and exit-file.read in the named workspace', async () => {
    jest.spyOn(reports, 'enrollmentRows').mockResolvedValue([])
    await reports.outcomes(actor, 'delaware')
    await reports.exitFile(actor, 'delaware')
    await expect(reports.gradebook(actor, 'delaware', 'c1')).rejects.toThrow(NotFoundException)
    expect(authorize.mock.calls).toEqual([
      [actor, 'outcomes.read', { workspace: 'delaware' }],
      [actor, 'exit-file.read', { workspace: 'delaware' }],
      [actor, 'gradebook.read', { workspace: 'delaware' }],
    ])
  })

  it('reads nothing when the check refuses', async () => {
    authorize.mockRejectedValue(new ForbiddenException('Insufficient role'))
    await expect(reports.outcomes(actor, 'delaware')).rejects.toThrow(ForbiddenException)
    await expect(reports.gradebook(actor, 'delaware', 'c1')).rejects.toThrow(ForbiddenException)
    await expect(reports.exitFile(actor, 'delaware')).rejects.toThrow(ForbiddenException)
    expect(institutionFindFirst).not.toHaveBeenCalled()
  })

  it('refuses an unknown workspace before reading it', async () => {
    authorize.mockRejectedValue(new ForbiddenException('No access to this workspace'))
    await expect(reports.outcomes(actor, 'nope')).rejects.toThrow(ForbiddenException)
  })

  it('limits an instructor to the gradebook of a cohort they teach', async () => {
    instructorCohortsIn.mockResolvedValue(['c1'])
    jest.spyOn(reports, 'enrollmentRows').mockResolvedValue([])
    await expect(reports.gradebook(actor, 'delaware', 'c2')).rejects.toThrow(ForbiddenException)
    await expect(reports.gradebook(actor, 'delaware', 'c1')).rejects.toThrow(NotFoundException)
  })
})

describe('LearnService workspaceSummaries', () => {
  const provider = {
    id: 'p1',
    name: 'Lantern Hill',
    kind: 'provider',
    subdomain: 'lanternhill',
    parentId: 'a1',
    featuredDemo: true,
  }
  const org = {
    id: 'o1',
    name: 'Wilmington',
    kind: 'organization',
    subdomain: 'wilmington',
    parentId: 'a1',
    featuredDemo: false,
  }
  const cohort = (institutionId: string, providerId: string | null, learners: number) => ({
    institutionId,
    institution: { parentId: 'a1' },
    course: providerId ? { providerId, provider: { parentId: 'a1' } } : null,
    _count: { enrollments: learners },
  })

  beforeEach(() => {
    jest.clearAllMocks()
    membershipFindMany.mockResolvedValue([member('a1', 'agency-admin')])
    groupBy.mockResolvedValue([{ providerId: 'p1', _count: { _all: 3 } }])
    cohortFindMany.mockResolvedValue([
      cohort('p1', 'p1', 10), // run by the provider itself
      cohort('o1', 'p1', 5), // run by the organization on the provider's course
      cohort('o1', null, 2), // the organization's own cohort, no course
    ])
  })

  it('counts a provider by its courses, an organization by the cohorts it runs, an agency by all of them', async () => {
    findMany
      .mockResolvedValueOnce([]) // agencies' children (AccessService.workspaceRoles)
      .mockResolvedValueOnce([delaware, provider, org]) // workspaces()
      .mockResolvedValueOnce([{ id: 'a1', name: 'Delaware DoL' }]) // parents
      .mockResolvedValueOnce([
        { id: 'p1', parentId: 'a1', kind: 'provider' },
        { id: 'o1', parentId: 'a1', kind: 'organization' },
      ]) // children
    const [agency, prov, organization] = await service.workspaceSummaries('u1', 'agency-admin')
    expect(agency).toMatchObject({
      courses: 3,
      cohorts: 3,
      learners: 17,
      providers: 1,
      organizations: 1,
      parentName: null,
    })
    expect(prov).toMatchObject({
      courses: 3,
      cohorts: 2,
      learners: 15,
      providers: 0,
      organizations: 0,
      parentName: 'Delaware DoL',
    })
    expect(organization).toMatchObject({
      courses: 0,
      cohorts: 2,
      learners: 7,
      providers: 0,
      organizations: 0,
    })
  })

  it('returns nothing, and reads nothing else, for someone with no workspaces', async () => {
    membershipFindMany.mockResolvedValue([])
    await expect(service.workspaceSummaries('u3', undefined)).resolves.toEqual([])
    expect(cohortFindMany).not.toHaveBeenCalled()
  })
})
