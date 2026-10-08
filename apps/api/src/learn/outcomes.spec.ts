import { agencyOutcomes, gradebook, measures, type EnrollmentRow } from './outcomes'
import { exitFileCsv } from './exit-file'

const NOW = new Date('2026-10-04T12:00:00Z')
const FINISHED = new Date('2026-08-01T00:00:00Z')
const RUNNING = new Date('2026-12-01T00:00:00Z')

function row(over: Partial<EnrollmentRow>): EnrollmentRow {
  return {
    enrollmentId: 'e',
    userId: 'u',
    name: 'Ann Lee',
    status: 'enrolled',
    completedAt: null,
    cohortId: 'c1',
    cohortName: 'MA 2026-A',
    startsAt: new Date('2026-04-01T00:00:00Z'),
    endsAt: FINISHED,
    hostId: 'h1',
    hostName: 'Harbor Point',
    courseId: 'co1',
    program: 'Medical Assistant',
    credential: 'CCMA',
    readinessThreshold: 70,
    targetScore: 80,
    providerId: 'p1',
    providerName: 'Harbor Point',
    pre: null,
    post: null,
    interviewBest: null,
    interviewAttempts: 0,
    itemsDone: 0,
    itemsTotal: 10,
    lastActivity: null,
    ...over,
  }
}

describe('measures', () => {
  it('averages scores, gain over learners with both, and readiness against the threshold', () => {
    const m = measures(
      [
        row({ enrollmentId: 'a', status: 'completed', pre: 50, post: 80, interviewBest: 70 }),
        row({ enrollmentId: 'b', status: 'completed', pre: 60, post: 70, interviewBest: 69 }),
        row({ enrollmentId: 'c', status: 'withdrawn', pre: 40 }),
        row({ enrollmentId: 'd', status: 'withdrawn' }),
      ],
      NOW
    )
    expect(m.enrolled).toBe(4)
    expect(m.avgPre).toBe(50)
    expect(m.avgPost).toBe(75)
    expect(m.avgGain).toBe(20) // (30 + 10) / 2, learner c has no post
    expect(m.interviewReady).toBe(1) // 70 meets the threshold, 69 does not
    expect(m.readyRate).toBe(0.25)
    expect(m.completionRate).toBe(0.5)
  })

  it('counts learners who reach the course target score; the rate covers finished cohorts only', () => {
    const m = measures(
      [
        row({ enrollmentId: 'a', status: 'completed', post: 80 }), // meets the target exactly
        row({ enrollmentId: 'b', status: 'completed', post: 79 }),
        row({ enrollmentId: 'c', status: 'withdrawn' }),
        row({ enrollmentId: 'd', endsAt: RUNNING, post: 95 }), // running: counted, not in the rate
      ],
      NOW
    )
    expect(m.reachedTarget).toBe(2)
    expect(m.targetRate).toBe(0.333) // 1 of the 3 learners in finished cohorts
  })

  it("uses each course's own readiness threshold", () => {
    const m = measures([row({ interviewBest: 75, readinessThreshold: 80 })], NOW)
    expect(m.interviewReady).toBe(0)
  })

  it('reports no completion rate while every cohort is still running', () => {
    const m = measures([row({ endsAt: RUNNING, status: 'enrolled' })], NOW)
    expect(m.completionRate).toBeNull()
  })

  it('returns nulls, not NaN, for an empty set', () => {
    const m = measures([], NOW)
    expect(m).toMatchObject({ enrolled: 0, avgPre: null, avgGain: null, readyRate: null })
  })
})

describe('agencyOutcomes', () => {
  const rows = [
    row({ enrollmentId: 'a', status: 'completed', pre: 50, post: 80, interviewBest: 90 }),
    row({ enrollmentId: 'b', cohortId: 'c2', cohortName: 'MA 2026-B', endsAt: RUNNING, pre: 55 }),
    row({
      enrollmentId: 'c',
      providerId: 'p2',
      providerName: 'Tidewater',
      cohortId: 'c3',
      pre: 60,
      post: 70,
    }),
  ]
  const out = agencyOutcomes({ id: 'ag', name: 'DoL' }, rows, NOW)

  it('groups by provider and cohort', () => {
    expect(out.providers.map((p) => p.provider)).toEqual(['Harbor Point', 'Tidewater'])
    expect(out.providers[0].cohorts).toBe(2)
    expect(out.cohorts.map((c) => c.cohortId).sort()).toEqual(['c1', 'c2', 'c3'])
    expect(out.cohorts.find((c) => c.cohortId === 'c2')?.status).toBe('running')
    expect(out.cohorts.find((c) => c.cohortId === 'c1')?.status).toBe('completed')
  })

  it('builds the funnel from finished cohorts only', () => {
    // Row b is in a running cohort, so it is left out.
    expect(out.funnel.map((f) => [f.key, f.count])).toEqual([
      ['enrolled', 2],
      ['preAssessed', 2],
      ['interviewed', 1],
      ['postAssessed', 2],
      ['completed', 1],
    ])
  })
})

describe('agencyOutcomes provider program', () => {
  const provider = (rows: EnrollmentRow[]) =>
    agencyOutcomes({ id: 'ag', name: 'DoL' }, rows, NOW).providers[0]

  it('shows the program name and credential for a single program', () => {
    const p = provider([row({ enrollmentId: 'a' }), row({ enrollmentId: 'b', cohortId: 'c2' })])
    expect(p.program).toBe('Medical Assistant')
    expect(p.credential).toBe('CCMA')
  })

  it('shows a count and no credential for two programs', () => {
    const p = provider([
      row({ enrollmentId: 'a' }),
      row({ enrollmentId: 'b', courseId: 'co2', program: 'Pharmacy Tech', credential: 'CPhT' }),
    ])
    expect(p.program).toBe('2 programs')
    expect(p.credential).toBeNull()
  })

  it('counts three programs', () => {
    const p = provider([
      row({ enrollmentId: 'a' }),
      row({ enrollmentId: 'b', courseId: 'co2', program: 'Pharmacy Tech' }),
      row({ enrollmentId: 'c', courseId: 'co3', program: 'Phlebotomy' }),
      row({ enrollmentId: 'd', courseId: 'co3', program: 'Phlebotomy' }),
    ])
    expect(p.program).toBe('3 programs')
  })
})

describe('gradebook', () => {
  it('lists learners with gain and readiness, sorted by name, and is null for an unknown cohort', () => {
    const rows = [
      row({
        enrollmentId: 'a',
        name: 'Zed Young',
        pre: 50,
        post: 80,
        interviewBest: 72,
        interviewAttempts: 2,
      }),
      row({ enrollmentId: 'b', name: 'Amy Banks', pre: 60 }),
    ]
    const book = gradebook('c1', rows, NOW)
    expect(book?.learners.map((l) => l.name)).toEqual(['Amy Banks', 'Zed Young'])
    expect(book?.learners[1]).toMatchObject({
      gain: 30,
      interviewReady: true,
      interviewAttempts: 2,
    })
    expect(book?.learners[0]).toMatchObject({ gain: null, interviewReady: false })
    expect(gradebook('nope', rows, NOW)).toBeNull()
  })
})

describe('exitFileCsv', () => {
  it('writes a header and one row per participant', () => {
    const csv = exitFileCsv([
      row({
        name: 'Ann Lee',
        status: 'completed',
        completedAt: new Date('2026-07-20T00:00:00Z'),
        pre: 50,
        post: 80,
        interviewBest: 75,
        itemsDone: 10,
      }),
    ])
    const [header, line] = csv.trim().split('\r\n')
    expect(header.startsWith('participant_id,participant_name,training_provider')).toBe(true)
    expect(line).toBe(
      'u,Ann Lee,Harbor Point,Medical Assistant,CCMA,MA 2026-A,2026-04-01,2026-08-01,completed,2026-07-20,50,80,30,80,yes,75,yes,10,10'
    )
  })

  it('quotes cells that contain commas or quotes', () => {
    const csv = exitFileCsv([row({ name: 'Lee, "Ann"' })])
    expect(csv).toContain('"Lee, ""Ann"""')
  })
})
