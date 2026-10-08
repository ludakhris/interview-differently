import { ForbiddenException, NotFoundException } from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service'
import { LearnService } from './learn.service'
import { ProviderAccessService } from './provider-access.service'

// Two providers (P1, P2), an organization (O1) that runs P1's course, and an agency (A1) over all of them.
const institutions = [
  { id: 'A1', kind: 'agency', subdomain: 'agency', parentId: null },
  { id: 'P1', kind: 'provider', subdomain: 'prov-one', parentId: 'A1' },
  { id: 'P2', kind: 'provider', subdomain: 'prov-two', parentId: 'A1' },
  { id: 'O1', kind: 'organization', subdomain: 'org-one', parentId: 'A1' },
]
// Workspace-level memberships (cohortId null) and a learner's cohort membership.
const memberships = [
  { userId: 'staff-p1', institutionId: 'P1', cohortId: null },
  { userId: 'staff-p2', institutionId: 'P2', cohortId: null },
  { userId: 'staff-o1', institutionId: 'O1', cohortId: null },
  // An agency admin who was also given a membership on the provider: the role still excludes them.
  { userId: 'agency-1', institutionId: 'P1', cohortId: null },
  { userId: 'learner-1', institutionId: 'O1', cohortId: 'C1' },
]
// C1 runs P1's course and is hosted by O1.
const cohorts = [
  {
    id: 'C1',
    delivery: 'live',
    courseId: 'course-1',
    institution: { id: 'O1', subdomain: 'org-one' },
    course: { id: 'course-1', providerId: 'P1' },
  },
  {
    id: 'C0',
    delivery: 'online',
    courseId: null,
    institution: { id: 'O1', subdomain: 'org-one' },
    course: null,
  },
]
const enrollments = [{ id: 'E1', cohortId: 'C1', userId: 'learner-1', providerId: 'P1' }]

const prisma = {
  membership: {
    findFirst: jest.fn(
      async ({ where }) =>
        memberships.find(
          (m) =>
            m.userId === where.userId &&
            m.institutionId === where.institutionId &&
            m.cohortId === where.cohortId &&
            where.institution.kind.in.includes(
              institutions.find((i) => i.id === m.institutionId)?.kind
            )
        ) ?? null
    ),
  },
  cohort: {
    findUnique: jest.fn(async ({ where }) => cohorts.find((c) => c.id === where.id) ?? null),
  },
  enrollment: {
    findFirst: jest.fn(
      async ({ where }) =>
        enrollments.find(
          (e) =>
            e.userId === where.userId &&
            where.cohort.OR.some(
              (c: { course?: { providerId: string }; institutionId?: string }) =>
                c.course
                  ? e.providerId === c.course.providerId
                  : cohorts.find((k) => k.id === e.cohortId)?.institution.id === c.institutionId
            )
        ) ?? null
    ),
    findUnique: jest.fn(
      async ({ where }) =>
        enrollments.find(
          (e) =>
            e.cohortId === where.cohortId_userId.cohortId &&
            e.userId === where.cohortId_userId.userId
        ) ?? null
    ),
  },
} as unknown as PrismaService

const learn = new LearnService(prisma)
// What each person may open, as LearnService.workspaces decides it (tested in learn.service.spec.ts).
jest.spyOn(learn, 'workspaces').mockImplementation(async (userId, role) => {
  const all = institutions.map((i) => ({ ...i, name: i.id, featuredDemo: false }))
  if (role === 'agency-admin' || role === 'system-admin') return all
  const mine = memberships.filter((m) => m.userId === userId && m.cohortId === null)
  return all.filter((i) => mine.some((m) => m.institutionId === i.id))
})
const access = new ProviderAccessService(prisma, learn)

describe('assertProviderStaff', () => {
  it('lets staff of the provider in', async () => {
    await expect(
      access.assertProviderStaff('staff-p1', 'provider-admin', 'P1')
    ).resolves.toBeUndefined()
  })
  it('lets a system admin in without a membership', async () => {
    await expect(access.assertProviderStaff('root', 'system-admin', 'P1')).resolves.toBeUndefined()
    await expect(access.assertProviderStaff('root', 'system-admin', 'P2')).resolves.toBeUndefined()
  })
  it('refuses staff of another provider', async () => {
    await expect(access.assertProviderStaff('staff-p2', 'provider-admin', 'P1')).rejects.toThrow(
      ForbiddenException
    )
  })
  it('lets organization staff in on their own organization, and refuses them on the provider whose course they run', async () => {
    await expect(
      access.assertProviderStaff('staff-o1', 'provider-admin', 'O1')
    ).resolves.toBeUndefined()
    await expect(access.assertProviderStaff('staff-o1', 'provider-admin', 'P1')).rejects.toThrow(
      ForbiddenException
    )
  })
  it('refuses provider staff on an organization they run a course for', async () => {
    await expect(access.assertProviderStaff('staff-p1', 'provider-admin', 'O1')).rejects.toThrow(
      ForbiddenException
    )
  })
  it('refuses an agency admin, even one with a membership on the provider', async () => {
    await expect(access.assertProviderStaff('agency-1', 'agency-admin', 'P1')).rejects.toThrow(
      ForbiddenException
    )
    await expect(access.assertProviderStaff('other-agency', 'agency-admin', 'P1')).rejects.toThrow(
      ForbiddenException
    )
  })
  it('refuses a case manager, even with a membership', async () => {
    memberships.push({ userId: 'cm', institutionId: 'P1', cohortId: null })
    await expect(access.assertProviderStaff('cm', 'case-manager', 'P1')).rejects.toThrow(
      ForbiddenException
    )
    memberships.pop()
  })
  it('refuses a learner (no role), and a learner who happens to be a member', async () => {
    await expect(access.assertProviderStaff('learner-1', undefined, 'P1')).rejects.toThrow(
      ForbiddenException
    )
    memberships.push({ userId: 'learner-1', institutionId: 'P1', cohortId: null })
    await expect(access.assertProviderStaff('learner-1', undefined, 'P1')).rejects.toThrow(
      ForbiddenException
    )
    memberships.pop()
  })
  it('does not accept a cohort-level membership as workspace staff', async () => {
    memberships.push({ userId: 'staff-x', institutionId: 'P1', cohortId: 'C1' })
    await expect(access.assertProviderStaff('staff-x', 'provider-admin', 'P1')).rejects.toThrow(
      ForbiddenException
    )
    memberships.pop()
  })
  it('does not accept a membership on an agency', async () => {
    memberships.push({ userId: 'staff-a1', institutionId: 'A1', cohortId: null })
    await expect(access.assertProviderStaff('staff-a1', 'provider-admin', 'A1')).rejects.toThrow(
      ForbiddenException
    )
    memberships.pop()
  })
})

describe('providerOfCohort', () => {
  it('names the course provider, not the workspace that hosts the cohort', async () => {
    await expect(access.providerOfCohort('C1')).resolves.toMatchObject({
      cohortId: 'C1',
      providerId: 'P1',
      hostId: 'O1',
      delivery: 'live',
    })
  })
  it('is not found for an unknown cohort or one with no course', async () => {
    await expect(access.providerOfCohort('nope')).rejects.toThrow(NotFoundException)
    await expect(access.providerOfCohort('C0')).rejects.toThrow(NotFoundException)
  })
})

describe('scopeForCohort', () => {
  const ctx = { providerId: 'P1', hostId: 'O1' }
  it('is the provider for provider staff, the host for organization staff, and null for others', async () => {
    await expect(access.scopeForCohort('staff-p1', 'provider-admin', ctx)).resolves.toBe('P1')
    await expect(access.scopeForCohort('staff-o1', 'provider-admin', ctx)).resolves.toBe('O1')
    await expect(access.scopeForCohort('staff-p2', 'provider-admin', ctx)).resolves.toBeNull()
    await expect(access.scopeForCohort('learner-1', undefined, ctx)).resolves.toBeNull()
    await expect(access.scopeForCohort('agency-1', 'agency-admin', ctx)).resolves.toBeNull()
  })
  it('gives a system admin the provider', async () => {
    await expect(access.scopeForCohort('root', 'system-admin', ctx)).resolves.toBe('P1')
  })
})

describe('assertCohortStaff (the roster guard)', () => {
  it('lets the host organization staff in', async () => {
    await expect(
      access.assertCohortStaff('staff-o1', 'provider-admin', 'C1')
    ).resolves.toMatchObject({
      providerId: 'P1',
    })
  })
  it('lets an agency admin in scope, and a system admin', async () => {
    await expect(access.assertCohortStaff('agency-1', 'agency-admin', 'C1')).resolves.toBeDefined()
    await expect(access.assertCohortStaff('root', 'system-admin', 'C1')).resolves.toBeDefined()
  })
  it('refuses staff of another provider and a learner', async () => {
    await expect(access.assertCohortStaff('staff-p2', 'provider-admin', 'C1')).rejects.toThrow(
      ForbiddenException
    )
    await expect(access.assertCohortStaff('learner-1', undefined, 'C1')).rejects.toThrow(
      ForbiddenException
    )
  })
  it('refuses a case manager, as the roster does', async () => {
    await expect(access.assertCohortStaff('staff-o1', 'case-manager', 'C1')).rejects.toThrow(
      ForbiddenException
    )
  })
})

describe('learner checks', () => {
  it('knows who is a participant of a provider, and never across providers', async () => {
    await expect(access.assertParticipantOfProvider('P1', 'learner-1')).resolves.toBeUndefined()
    await expect(access.assertParticipantOfProvider('P2', 'learner-1')).rejects.toThrow(
      NotFoundException
    )
  })
  it('counts the hosting organization of a cohort as an institution the learner is enrolled with', async () => {
    await expect(access.assertParticipantOfProvider('O1', 'learner-1')).resolves.toBeUndefined()
    await expect(access.assertLearnerOfProvider('learner-1', 'O1')).resolves.toBeUndefined()
  })
  it('lets a learner act only for providers they are enrolled with', async () => {
    await expect(access.assertLearnerOfProvider('learner-1', 'P1')).resolves.toBeUndefined()
    await expect(access.assertLearnerOfProvider('learner-1', 'P2')).rejects.toThrow(
      ForbiddenException
    )
    await expect(access.assertLearnerOfProvider('stranger', 'P1')).rejects.toThrow(
      ForbiddenException
    )
  })
  it('finds the learner own enrollment in a cohort and nobody else', async () => {
    await expect(access.assertLearnerOfCohort('learner-1', 'C1')).resolves.toBe('E1')
    await expect(access.assertLearnerOfCohort('stranger', 'C1')).rejects.toThrow(NotFoundException)
  })
})
