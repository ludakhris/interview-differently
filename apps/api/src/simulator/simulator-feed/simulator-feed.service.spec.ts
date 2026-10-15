import { SimulatorFeedService } from './simulator-feed.service'

const when = new Date('2026-10-09T12:00:00Z')

function setup(tools: { toolKey: string; enabled: boolean }[] = [], prisma: unknown = {}) {
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
      toolsSvc as never,
      prisma as never
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

  describe('checkpoints (issue #90)', () => {
    const at = (m: number) => new Date(Date.UTC(2026, 9, 14, 9, m))
    const sections = [
      {
        id: 's1',
        questions: [
          {
            id: '1.1',
            type: 'sql',
            prompt: 'Who is in IL?',
            referenceSql: 'x',
            from: 'Dana · Support',
          },
          { id: '1.2', type: 'sql', prompt: 'Inactive products?', referenceSql: 'y' },
        ],
      },
    ]
    const events = [
      {
        kind: 'answer',
        userId: 'u1',
        itemId: 'i1',
        ref: '1.1',
        correct: false,
        passed: false,
        data: { sql: 'select 1', reason: 'expected 4 row(s), got 1', error: null },
        createdAt: at(1),
        delivery: { assessmentId: 'as1' },
      },
      {
        kind: 'help',
        userId: 'u1',
        itemId: 'i1',
        ref: '1.1',
        correct: null,
        passed: false,
        data: { kind: 'hint', text: 'Filter with WHERE.', exampleSql: null, source: 'rules' },
        createdAt: at(2),
        delivery: { assessmentId: 'as1' },
      },
      {
        kind: 'answer',
        userId: 'u1',
        itemId: 'i1',
        ref: '1.2',
        correct: false,
        passed: true,
        data: { sql: null, reason: null, error: null },
        createdAt: at(3),
        delivery: { assessmentId: 'as1' },
      },
      {
        kind: 'answer',
        userId: 'u1',
        itemId: 'i2',
        ref: 'gen:p1:0',
        correct: true,
        passed: false,
        data: { sql: 'select 2', reason: null, error: null },
        createdAt: at(5),
        delivery: { assessmentId: 'as1' },
      },
    ]
    const prisma = {
      practiceEvent: { findMany: jest.fn(async () => events) },
      practiceSetUse: {
        findMany: jest.fn(async () => [
          {
            itemId: 'i2',
            createdAt: at(4),
            practiceSet: {
              intro: 'You are close.',
              tasks: [{ prompt: 'Practice one', referenceSql: 'z', ordered: false }],
            },
          },
        ]),
      },
      assessment: { findMany: jest.fn(async () => [{ id: 'as1', sections }]) },
      practiceSet: {
        findMany: jest.fn(async () => [
          { id: 'p1', tasks: [{ prompt: 'Practice one', referenceSql: 'z', ordered: false }] },
        ]),
      },
    }

    it('hands over every answer and pass as evidence, oldest first', async () => {
      const { svc } = setup([], prisma)
      prisma.practiceEvent.findMany.mockResolvedValueOnce(events.filter((e) => e.kind === 'answer'))
      const out = await svc.checkpointEvidence('k1', ['u1'])
      expect(prisma.practiceEvent.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { cohortId: 'k1', kind: 'answer', userId: { in: ['u1'] } },
          orderBy: { createdAt: 'asc' },
        })
      )
      expect(out).toEqual([
        {
          userId: 'u1',
          itemId: 'i1',
          ref: '1.1',
          correct: false,
          passed: false,
          at: at(1).toISOString(),
        },
        {
          userId: 'u1',
          itemId: 'i1',
          ref: '1.2',
          correct: false,
          passed: true,
          at: at(3).toISOString(),
        },
        {
          userId: 'u1',
          itemId: 'i2',
          ref: 'gen:p1:0',
          correct: true,
          passed: false,
          at: at(5).toISOString(),
        },
      ])
      expect(await svc.checkpointEvidence('k1', [])).toEqual([])
    })

    it('replays what a learner saw and did, in order, with the wording from the bank or the practice', async () => {
      const { svc } = setup([], prisma)
      const out = await svc.checkpointHistory('k1', 'u1')
      expect(out.map((e) => e.kind)).toEqual(['answer', 'help', 'answer', 'practice', 'answer'])
      expect(out[0]).toEqual({
        kind: 'answer',
        at: at(1).toISOString(),
        itemId: 'i1',
        ref: '1.1',
        prompt: 'Who is in IL?',
        from: 'Dana · Support',
        sql: 'select 1',
        correct: false,
        passed: false,
        reason: 'expected 4 row(s), got 1',
      })
      expect(out[1]).toEqual({
        kind: 'help',
        at: at(2).toISOString(),
        itemId: 'i1',
        ref: '1.1',
        helpKind: 'hint',
        text: 'Filter with WHERE.',
        exampleSql: null,
      })
      expect(out[2]).toMatchObject({ ref: '1.2', from: null, sql: null, passed: true })
      expect(out[3]).toEqual({
        kind: 'practice',
        at: at(4).toISOString(),
        itemId: 'i2',
        intro: 'You are close.',
        tasks: ['Practice one'],
      })
      expect(out[4]).toMatchObject({
        ref: 'gen:p1:0',
        prompt: 'Practice one',
        from: null,
        correct: true,
      })
    })
  })
})
