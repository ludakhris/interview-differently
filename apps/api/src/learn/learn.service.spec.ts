import { ForbiddenException } from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service'
import { LearnService } from './learn.service'

const findMany = jest.fn()
const cohortFindMany = jest.fn()
const groupBy = jest.fn()
const prisma = {
  institution: { findMany },
  cohort: { findMany: cohortFindMany },
  course: { groupBy },
} as unknown as PrismaService
const service = new LearnService(prisma)

const delaware = {
  id: 'a1',
  name: 'Delaware DoL',
  kind: 'agency',
  subdomain: 'delaware',
  parentId: null,
  featuredDemo: false,
}

describe('LearnService workspaces', () => {
  beforeEach(() => jest.clearAllMocks())

  it('gives agency admins every agency and the institutions under one', async () => {
    findMany.mockResolvedValue([delaware])
    await expect(service.workspaces('u1', 'agency-admin')).resolves.toEqual([delaware])
    expect(findMany.mock.calls[0][0].where).toEqual({
      subdomain: { not: null },
      OR: [{ kind: 'agency' }, { parent: { kind: 'agency' } }],
    })
    expect(findMany.mock.calls[0][0].select.featuredDemo).toBe(true)
  })

  it('gives a system admin everything an agency admin has, and passes any role check', async () => {
    findMany.mockResolvedValue([delaware])
    await service.workspaces('u1', 'system-admin')
    expect(findMany.mock.calls[0][0].where).toEqual({
      subdomain: { not: null },
      OR: [{ kind: 'agency' }, { parent: { kind: 'agency' } }],
    })
    expect(() => service.assertRole('system-admin', ['provider-admin'])).not.toThrow()
    expect(() => service.assertRole('agency-admin', ['provider-admin'])).toThrow(ForbiddenException)
  })

  it('limits everyone else to institutions they are a member of', async () => {
    findMany.mockResolvedValue([])
    await service.workspaces('u2', 'provider-admin')
    expect(findMany.mock.calls[0][0].where).toEqual({
      subdomain: { not: null },
      memberships: { some: { userId: 'u2', cohortId: null } },
    })
  })

  it('allows a workspace in the list and rejects one that is not', async () => {
    findMany.mockResolvedValue([delaware])
    await expect(service.assertWorkspace('u1', 'agency-admin', 'delaware')).resolves.toBeUndefined()
    await expect(service.assertWorkspace('u1', 'agency-admin', 'other')).rejects.toThrow(
      ForbiddenException
    )
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
    groupBy.mockResolvedValue([{ providerId: 'p1', _count: { _all: 3 } }])
    cohortFindMany.mockResolvedValue([
      cohort('p1', 'p1', 10), // run by the provider itself
      cohort('o1', 'p1', 5), // run by the organization on the provider's course
      cohort('o1', null, 2), // the organization's own cohort, no course
    ])
  })

  it('counts a provider by its courses, an organization by the cohorts it runs, an agency by all of them', async () => {
    findMany
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
    findMany.mockResolvedValueOnce([])
    await expect(service.workspaceSummaries('u3', undefined)).resolves.toEqual([])
    expect(cohortFindMany).not.toHaveBeenCalled()
  })
})
