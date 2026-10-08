import type { PrismaService } from '../prisma/prisma.service'
import { AttentionService } from './attention.service'
import type { LearnService } from './learn.service'

const NOW = new Date('2026-10-07T15:00:00Z')

// Workspaces: W1 (provider, Cedar Mill) and W2 (organization). "me" may open only W1.
const institutions = [
  { id: 'W1', name: 'Cedar Mill Training', subdomain: 'cedar-mill', kind: 'provider' },
  { id: 'W2', name: 'Harbor Works', subdomain: 'harbor-works', kind: 'organization' },
]
const cohorts = [
  { id: 'C1', name: 'Electrical Fall', institutionId: 'W1' },
  { id: 'C2', name: 'Plumbing Fall', institutionId: 'W2' },
  { id: 'C3', name: 'Quiet Cohort', institutionId: 'W1' },
]
const joinRequests = [
  { cohortId: 'C1', status: 'pending' },
  { cohortId: 'C1', status: 'pending' },
  { cohortId: 'C1', status: 'approved' },
  { cohortId: 'C2', status: 'pending' },
]
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const supportItems = [
  // The person's own: overdue, due today, due tomorrow, resolved, no date
  { providerId: 'W1', assigneeId: 'me', status: 'open', dueDate: day('2026-10-01') },
  { providerId: 'W1', assigneeId: 'me', status: 'in_progress', dueDate: day('2026-10-07') },
  { providerId: 'W1', assigneeId: 'me', status: 'open', dueDate: day('2026-10-08') },
  { providerId: 'W1', assigneeId: 'me', status: 'resolved', dueDate: day('2026-10-01') },
  { providerId: 'W1', assigneeId: 'me', status: 'open', dueDate: null },
  // Someone else's, and one in an institution "me" is not staff of
  { providerId: 'W1', assigneeId: 'other', status: 'open', dueDate: day('2026-10-01') },
  { providerId: 'W2', assigneeId: 'me', status: 'open', dueDate: day('2026-10-01') },
  { providerId: 'W2', assigneeId: 'root', status: 'open', dueDate: day('2026-10-05') },
]
// Workspaces a person may open (LearnService.workspaces) and institutions they hold a staff membership in.
const workspacesOf: Record<string, string[]> = { me: ['W1'], solo: ['W2'], root: ['W1', 'W2'] }
const staffOf: Record<string, string[]> = { me: ['W1'] }

type Where = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const prisma = {
  joinRequest: {
    groupBy: jest.fn(async ({ where }: { where: Where }) => {
      const ids: string[] = where.cohort.institutionId.in
      const byCohort = new Map<string, number>()
      for (const r of joinRequests) {
        const c = cohorts.find((x) => x.id === r.cohortId)!
        if (r.status === where.status && ids.includes(c.institutionId))
          byCohort.set(r.cohortId, (byCohort.get(r.cohortId) ?? 0) + 1)
      }
      return [...byCohort].map(([cohortId, n]) => ({ cohortId, _count: { _all: n } }))
    }),
  },
  cohort: {
    findMany: jest.fn(async ({ where }: { where: Where }) =>
      cohorts
        .filter((c) => where.id.in.includes(c.id))
        .map((c) => ({
          id: c.id,
          name: c.name,
          institution: { subdomain: institutions.find((i) => i.id === c.institutionId)!.subdomain },
        }))
    ),
  },
  supportItem: {
    groupBy: jest.fn(async ({ where }: { where: Where }) => {
      const restricted = 'provider' in where
      const byProvider = new Map<string, number>()
      for (const s of supportItems) {
        if (s.assigneeId !== where.assigneeId || !where.status.in.includes(s.status)) continue
        if (!s.dueDate || s.dueDate >= where.dueDate.lt) continue
        if (restricted && !(staffOf[where.assigneeId] ?? []).includes(s.providerId)) continue
        byProvider.set(s.providerId, (byProvider.get(s.providerId) ?? 0) + 1)
      }
      return [...byProvider].map(([providerId, n]) => ({ providerId, _count: { _all: n } }))
    }),
  },
  institution: {
    findMany: jest.fn(async ({ where }: { where: Where }) =>
      institutions.filter((i) => where.id.in.includes(i.id))
    ),
  },
  ltiPlatform: { count: jest.fn(async () => 2) },
  enrollment: { findMany: jest.fn() },
  talentProfile: { findUnique: jest.fn() },
}
const learn = {
  workspaces: jest.fn(async (userId: string) =>
    institutions.filter((i) => (workspacesOf[userId] ?? []).includes(i.id))
  ),
}
const service = new AttentionService(
  prisma as unknown as PrismaService,
  learn as unknown as LearnService
)

beforeEach(() => {
  jest.clearAllMocks()
  prisma.enrollment.findMany.mockResolvedValue([])
  prisma.talentProfile.findUnique.mockResolvedValue(null)
})

describe('AttentionService', () => {
  it('lists pending join requests only for cohorts in workspaces the person may open', async () => {
    const r = await service.forUser('me', 'provider-admin', NOW)
    expect(r.items.filter((i) => i.kind === 'join_requests')).toEqual([
      {
        kind: 'join_requests',
        title: '2 people are waiting to join Electrical Fall',
        count: 2,
        href: '/lms/cohorts/C1?site=cedar-mill',
      },
    ])
    expect(JSON.stringify(r)).not.toContain('Plumbing')
  })

  it('uses singular wording for one waiting person', async () => {
    const r = await service.forUser('solo', 'agency-admin', NOW)
    expect(r.items[0].title).toBe('1 person is waiting to join Plumbing Fall')
  })

  it('counts support follow-ups assigned to the person that are overdue or due today, with no titles or names', async () => {
    const r = await service.forUser('me', 'provider-admin', NOW)
    // Not the other assignee's, not another institution's, not tomorrow's, resolved or undated ones.
    expect(r.items.filter((i) => i.kind === 'support_followups')).toEqual([
      {
        kind: 'support_followups',
        title: '2 support follow-ups are due',
        detail: 'Cedar Mill Training',
        count: 2,
        href: '/lms/talent/support?site=cedar-mill',
      },
    ])
    expect(prisma.supportItem.groupBy.mock.calls[0][0].where.assigneeId).toBe('me')
  })

  it('gives a system admin their own assigned items in any institution, plus the pending platforms', async () => {
    const r = await service.forUser('root', 'system-admin', NOW)
    expect(r.items.find((i) => i.kind === 'support_followups')).toMatchObject({
      count: 1,
      href: '/lms/talent/support?site=harbor-works',
    })
    expect(r.items.find((i) => i.kind === 'platforms')).toEqual({
      kind: 'platforms',
      title: '2 platforms are waiting for approval',
      count: 2,
      href: '/lms/admin/tools',
    })
  })

  it('leaves out staff items and the platform item for other roles', async () => {
    for (const role of ['case-manager', undefined]) {
      expect(await service.forUser('me', role, NOW)).toEqual({ items: [], total: 0 })
    }
    const agency = await service.forUser('me', 'agency-admin', NOW)
    expect(agency.items.map((i) => i.kind)).toEqual(['join_requests'])
    const provider = await service.forUser('me', 'provider-admin', NOW)
    expect(provider.items.some((i) => i.kind === 'platforms')).toBe(false)
    expect(prisma.ltiPlatform.count).not.toHaveBeenCalled()
  })

  it('asks a learner to finish a required profile that is missing, and nothing else', async () => {
    prisma.enrollment.findMany.mockResolvedValue([
      { cohort: { requiresProfile: true, profileRefreshMonths: null } },
    ])
    const r = await service.forUser('learner', undefined, NOW)
    expect(r.items).toEqual([
      {
        kind: 'profile',
        title: 'Your course needs your profile',
        detail: 'Finish it so your course can continue.',
        href: '/lms/learning/profile',
      },
    ])
    expect(r.total).toBe(1)
    expect(prisma.joinRequest.groupBy).not.toHaveBeenCalled()
    expect(prisma.supportItem.groupBy).not.toHaveBeenCalled()
  })

  it('asks for a refresh when a complete profile is older than the cohort allows, and stays quiet when fresh', async () => {
    prisma.enrollment.findMany.mockResolvedValue([
      { cohort: { requiresProfile: true, profileRefreshMonths: 6 } },
    ])
    const complete = {
      completedAt: new Date('2026-01-01'),
      resumeKey: 'k',
      yearsExperience: 3,
      industries: ['x'],
      targetRoles: ['y'],
      _count: { educations: 1 },
    }
    prisma.talentProfile.findUnique.mockResolvedValue({
      ...complete,
      updatedAt: new Date('2026-01-01'),
    })
    const stale = await service.forUser('learner', undefined, NOW)
    expect(stale.items[0]).toMatchObject({ kind: 'profile', title: 'Time to refresh your profile' })
    prisma.talentProfile.findUnique.mockResolvedValue({
      ...complete,
      updatedAt: new Date('2026-09-20'),
    })
    expect((await service.forUser('learner', undefined, NOW)).items).toEqual([])
  })

  it('totals the counts, counting an item without one as 1', async () => {
    prisma.enrollment.findMany.mockResolvedValue([
      { cohort: { requiresProfile: true, profileRefreshMonths: null } },
    ])
    const r = await service.forUser('me', 'provider-admin', NOW)
    expect(r.total).toBe(2 + 2 + 1)
  })
})
