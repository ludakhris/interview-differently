import { buildUsage, type UsageInput } from './usage.aggregate'

const NOW = new Date('2026-09-30T12:00:00Z')
const daysAgo = (d: number, hour = 12) => {
  const t = new Date(NOW.getTime() - d * 86_400_000)
  t.setUTCHours(hour, 0, 0, 0)
  return t
}

function base(over: Partial<UsageInput> = {}): UsageInput {
  return {
    now: NOW,
    range: '30d',
    tzOffsetMinutes: 0,
    excludedUserIds: new Set(),
    users: [
      { id: 'u1', email: 'one@x.com', displayName: 'One' },
      { id: 'u2', email: 'two@x.com', displayName: null },
      { id: 'admin', email: 'boss@x.com', displayName: 'Boss' },
    ],
    scenarios: [
      { scenarioId: 'hot', status: 'published', title: 'Hot One', track: 'business', mode: null },
      { scenarioId: 'cold', status: 'published', title: 'Cold One', track: 'business', mode: null },
    ],
    simAttempts: [],
    simResults: [],
    immersive: [],
    assessments: [],
    assessmentAttempts: [],
    sqlLogs: [],
    cohorts: [],
    ...over,
  }
}

describe('buildUsage', () => {
  it('lists never-used scenarios with zero starts (the "cold" ones)', () => {
    const r = buildUsage(
      base({ simAttempts: [{ userId: 'u1', scenarioId: 'hot', startedAt: daysAgo(1) }] })
    )
    const cold = r.scenarios.find((s) => s.scenarioId === 'cold')
    expect(cold).toMatchObject({
      starts: 0,
      uniqueUsers: 0,
      completionRate: null,
      lastUsedAt: null,
    })
    expect(r.scenarios[0].scenarioId).toBe('hot') // hot first
  })

  it('excludes admin/test users from every number', () => {
    const attempts = [
      { userId: 'u1', scenarioId: 'hot', startedAt: daysAgo(1) },
      { userId: 'admin', scenarioId: 'hot', startedAt: daysAgo(1) },
      { userId: 'admin', scenarioId: 'hot', startedAt: daysAgo(2) },
    ]
    const withAdmin = buildUsage(base({ simAttempts: attempts }))
    const without = buildUsage(base({ simAttempts: attempts, excludedUserIds: new Set(['admin']) }))
    expect(withAdmin.scenarios[0].starts).toBe(3)
    expect(without.scenarios[0]).toMatchObject({ starts: 1, uniqueUsers: 1 })
    expect(without.overview.rangeActiveUsers).toBe(1)
    expect(without.users.map((u) => u.userId)).toEqual(['u1'])
  })

  it('computes completion rate, average score, and unique users; caps rate at 100', () => {
    const r = buildUsage(
      base({
        simAttempts: [
          { userId: 'u1', scenarioId: 'hot', startedAt: daysAgo(3) },
          { userId: 'u1', scenarioId: 'hot', startedAt: daysAgo(2) }, // refresh = new row
          { userId: 'u2', scenarioId: 'hot', startedAt: daysAgo(2) },
        ],
        simResults: [
          {
            userId: 'u1',
            scenarioId: 'hot',
            scenarioTitle: 'Hot One',
            completedAt: daysAgo(2),
            overallScore: 80,
          },
          {
            userId: 'u2',
            scenarioId: 'hot',
            scenarioTitle: 'Hot One',
            completedAt: daysAgo(2),
            overallScore: 60,
          },
        ],
      })
    )
    expect(r.scenarios[0]).toMatchObject({
      starts: 3,
      uniqueUsers: 2,
      completions: 2,
      completionRate: 67,
      avgScore: 70,
    })
  })

  it('counts a result with no attempt row as activity, without double counting', () => {
    const r = buildUsage(
      base({
        simAttempts: [{ userId: 'u1', scenarioId: 'hot', startedAt: daysAgo(2) }],
        simResults: [
          {
            userId: 'u1',
            scenarioId: 'hot',
            scenarioTitle: 'Hot One',
            completedAt: daysAgo(2),
            overallScore: 90,
          },
          {
            userId: 'u2',
            scenarioId: 'hot',
            scenarioTitle: 'Hot One',
            completedAt: daysAgo(4),
            overallScore: 50,
          }, // legacy: no attempt
        ],
      })
    )
    expect(r.overview.eventsBySource.scenario).toBe(2) // u1 attempt + u2 legacy result
    expect(r.overview.rangeActiveUsers).toBe(2)
  })

  it('includes scenario ids that appear in activity but not in the Scenario table', () => {
    const r = buildUsage(
      base({
        simResults: [
          {
            userId: 'u1',
            scenarioId: 'gone',
            scenarioTitle: 'Deleted Case',
            completedAt: daysAgo(1),
            overallScore: 70,
          },
        ],
      })
    )
    expect(r.scenarios.find((s) => s.scenarioId === 'gone')).toMatchObject({
      title: 'Deleted Case',
      status: 'unknown',
    })
  })

  it('filters by range and reports the previous period for trend', () => {
    const r = buildUsage(
      base({
        range: '7d',
        simAttempts: [
          { userId: 'u1', scenarioId: 'hot', startedAt: daysAgo(2) }, // in range
          { userId: 'u1', scenarioId: 'hot', startedAt: daysAgo(10) }, // previous 7d window
          { userId: 'u2', scenarioId: 'hot', startedAt: daysAgo(40) }, // outside both
        ],
      })
    )
    expect(r.scenarios[0]).toMatchObject({ starts: 1, prevStarts: 1 })
    // active-user windows ignore the range filter
    expect(r.overview.activeUsers).toMatchObject({ d7: 1, d30: 1, d90: 2, all: 2 })
  })

  it('splits new vs returning users within the range', () => {
    const r = buildUsage(
      base({
        range: '7d',
        simAttempts: [
          { userId: 'u1', scenarioId: 'hot', startedAt: daysAgo(30) }, // seen long ago
          { userId: 'u1', scenarioId: 'hot', startedAt: daysAgo(1) },
          { userId: 'u2', scenarioId: 'hot', startedAt: daysAgo(1) }, // first ever, in range
        ],
      })
    )
    expect(r.overview).toMatchObject({ rangeActiveUsers: 2, newUsers: 1, returningUsers: 1 })
  })

  it('buckets the heatmap and daily series in the admin local timezone', () => {
    // 02:00 UTC Wed. Admin is UTC-5 (offset +300) → Tue 21:00 local.
    const at = new Date('2026-09-30T02:00:00Z')
    const r = buildUsage(
      base({
        tzOffsetMinutes: 300,
        simAttempts: [{ userId: 'u1', scenarioId: 'hot', startedAt: at }],
      })
    )
    expect(r.overview.heatmap[2][21]).toBe(1) // Tuesday, 21h
    expect(r.overview.heatmap[3][2]).toBe(0)
    expect(r.overview.perDay.find((d) => d.date === '2026-09-29')?.events).toBe(1)
    expect(r.overview.perDay).toHaveLength(30)
  })

  it('flags cohorts with a tool enabled but no use, attributing by membership', () => {
    const r = buildUsage(
      base({
        sqlLogs: [
          { userId: 'u1', datasetSlug: 'retail', ok: true, createdAt: daysAgo(1) },
          { userId: 'u1', datasetSlug: 'retail', ok: false, createdAt: daysAgo(1) },
          { userId: 'u2', datasetSlug: 'hr', ok: true, createdAt: daysAgo(2) },
        ],
        cohorts: [
          {
            id: 'c1',
            name: 'Active',
            institutionName: 'I',
            memberIds: ['u1'],
            toolsEnabled: { 'sql-sandbox': true, assessments: false },
          },
          {
            id: 'c2',
            name: 'Idle',
            institutionName: 'I',
            memberIds: ['u9'],
            toolsEnabled: { 'sql-sandbox': true, assessments: false },
          },
          {
            id: 'c3',
            name: 'No tool',
            institutionName: 'I',
            memberIds: ['u1'],
            toolsEnabled: { 'sql-sandbox': false, assessments: false },
          },
        ],
      })
    )
    const sql = r.tools.find((t) => t.key === 'sql-sandbox')!
    expect(sql).toMatchObject({
      enabledCohorts: 2,
      cohortsWithUse: 1,
      activeUsers: 2,
      events: 3,
      errorRate: 33,
    })
    expect(sql.cohorts.map((c) => [c.cohort, c.events])).toEqual([
      ['Active', 2],
      ['Idle', 0],
    ])
    expect(sql.datasets[0]).toEqual({ slug: 'retail', events: 2, users: 1 })
  })

  it('summarises assessments: started, submitted, rates, avg score', () => {
    const r = buildUsage(
      base({
        assessments: [
          { id: 'a1', title: 'Pre', deliveryIds: ['d1'] },
          { id: 'a2', title: 'Never Used', deliveryIds: ['d2'] },
        ],
        assessmentAttempts: [
          {
            userId: 'u1',
            deliveryId: 'd1',
            startedAt: daysAgo(2),
            submittedAt: daysAgo(2),
            submittedLate: false,
            scorePercent: 80,
          },
          {
            userId: 'u2',
            deliveryId: 'd1',
            startedAt: daysAgo(2),
            submittedAt: daysAgo(1),
            submittedLate: true,
            scorePercent: 60,
          },
          {
            userId: 'admin',
            deliveryId: 'd1',
            startedAt: daysAgo(2),
            submittedAt: null,
            submittedLate: false,
            scorePercent: null,
          },
        ],
        excludedUserIds: new Set(['admin']),
      })
    )
    expect(r.assessments[0]).toMatchObject({
      title: 'Pre',
      started: 2,
      submitted: 2,
      completionRate: 100,
      avgScorePercent: 70,
      lateRate: 50,
      uniqueUsers: 2,
    })
    expect(r.assessments[1]).toMatchObject({
      title: 'Never Used',
      started: 0,
      completionRate: null,
    })
  })

  it('ranks users by activity with a per-source breakdown and readable top items', () => {
    const r = buildUsage(
      base({
        simAttempts: [
          { userId: 'u1', scenarioId: 'hot', startedAt: daysAgo(1) },
          { userId: 'u1', scenarioId: 'hot', startedAt: daysAgo(2) },
        ],
        sqlLogs: [
          { userId: 'u1', datasetSlug: 'retail', ok: true, createdAt: daysAgo(1) },
          { userId: 'u2', datasetSlug: 'retail', ok: true, createdAt: daysAgo(1) },
        ],
      })
    )
    expect(r.users.map((u) => u.userId)).toEqual(['u1', 'u2'])
    expect(r.users[0]).toMatchObject({ name: 'One', total: 3, scenario: 2, sql: 1, activeDays: 2 })
    expect(r.users[0].topScenarios).toEqual([{ label: 'Hot One', count: 2 }])
    expect(r.users[1].name).toBe('two@x.com') // falls back to email when no displayName
  })
})
