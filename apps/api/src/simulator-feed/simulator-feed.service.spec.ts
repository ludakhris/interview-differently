import { SimulatorFeedService } from './simulator-feed.service'

const when = new Date('2026-10-09T12:00:00Z')

function setup(tools: { toolKey: string; enabled: boolean }[] = []) {
  const assessments = {
    cohortActivity: jest.fn(async () => ({
      generatedAt: when,
      cohort: { id: 'k1', name: 'Cohort' },
      deliveries: [
        {
          id: 'd1',
          label: 'lti:item1',
          assessmentTitle: 'Bank',
          opensAt: when,
          closesAt: null,
          timeLimitMinutes: 30,
          counts: { notStarted: 0, inProgress: 1, submitted: 0 },
          students: [
            {
              userId: 'u1',
              name: 'Ana',
              email: 'a@x.test',
              status: 'in_progress',
              answeredCount: 2,
              questionCount: 4,
              startedAt: when,
              submittedAt: null,
              lastActivityAt: when,
            },
          ],
        },
      ],
    })),
  }
  const assessmentsExtra = {
    cohortDeliveryResults: jest.fn(async () => ({
      delivery: { expectedMinutes: 10, medianMinutes: 12 },
      sections: [{ id: 's1', title: 'Basics' }],
      attempts: [
        {
          userId: 'u1',
          submittedAt: when,
          submittedLate: true,
          minutes: 12,
          overall: { correct: 3, total: 4, percent: 75 },
          sectionScores: [
            { sectionId: 's1', title: 'Basics', correct: 3, total: 4, questions: [{ id: '1.1' }] },
          ],
        },
        {
          userId: 'u2',
          submittedAt: null,
          submittedLate: false,
          minutes: null,
          overall: null,
          sectionScores: null,
        },
      ],
    })),
  }
  const toolsSvc = {
    sandboxActivity: jest.fn(async () => ({
      cohort: { id: 'k1', name: 'Cohort' },
      retentionDays: 30,
      generatedAt: when.toISOString(),
      students: [],
      unassigned: [{ userId: 'x' }],
    })),
    listForCohort: jest.fn(async () => tools),
  }
  return {
    svc: new SimulatorFeedService(
      { ...assessments, ...assessmentsExtra } as never,
      toolsSvc as never
    ),
    assessments,
    assessmentsExtra,
    toolsSvc,
  }
}

describe('SimulatorFeedService', () => {
  it('hands over assessment progress with dates as ISO strings', async () => {
    const { svc, assessments } = setup()
    const out = await svc.assessmentMonitor('inst1', 'k1')
    expect(assessments.cohortActivity).toHaveBeenCalledWith('inst1', 'k1')
    expect(out.generatedAt).toBe('2026-10-09T12:00:00.000Z')
    expect(out.deliveries[0]).toMatchObject({
      label: 'lti:item1',
      tags: [],
      opensAt: '2026-10-09T12:00:00.000Z',
      closesAt: null,
      timeLimitMinutes: 30,
    })
    expect(out.deliveries[0].students[0]).toMatchObject({
      status: 'in_progress',
      answeredCount: 2,
      questionCount: 4,
      submittedAt: null,
      lastActivityAt: '2026-10-09T12:00:00.000Z',
    })
  })

  it('reports whether the cohort uses the SQL sandbox, and leaves out members with no cohort', async () => {
    expect(
      (await setup([{ toolKey: 'sql-sandbox', enabled: true }]).svc.sqlMonitor('k1')).enabled
    ).toBe(true)
    expect(
      (await setup([{ toolKey: 'sql-sandbox', enabled: false }]).svc.sqlMonitor('k1')).enabled
    ).toBe(false)
    const out = await setup().svc.sqlMonitor('k1')
    expect(out.enabled).toBe(false)
    expect(out).not.toHaveProperty('unassigned')
  })

  it('hands over graded results without the answer key or per-question detail', async () => {
    const { svc, assessmentsExtra } = setup()
    const r = await svc.assessmentResults('k1', 'd1')
    expect(assessmentsExtra.cohortDeliveryResults).toHaveBeenCalledWith('k1', 'd1')
    expect(r).toMatchObject({ deliveryId: 'd1', expectedMinutes: 10, medianMinutes: 12 })
    expect(r.attempts[0]).toEqual({
      userId: 'u1',
      status: 'submitted',
      submittedAt: '2026-10-09T12:00:00.000Z',
      late: true,
      minutes: 12,
      overall: { correct: 3, total: 4, percent: 75 },
      sections: [{ sectionId: 's1', title: 'Basics', correct: 3, total: 4 }], // no `questions`
    })
    expect(r.attempts[1]).toMatchObject({ status: 'in_progress', overall: null, sections: [] })
  })
})
