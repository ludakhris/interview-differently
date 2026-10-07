import { AssessmentsService } from './assessments.service'

/**
 * Grading a SQL answer runs the learner's query and the answer key's on one database. A learner's
 * statement can end the runner's transaction (`COMMIT; DELETE ...`) and change what later queries
 * see, so every reference query must run before any learner query.
 */

const sqlQuestion = (id: string, referenceSql: string) => ({
  id,
  type: 'sql',
  prompt: 'p',
  referenceSql,
  ordered: false,
  strictColumns: false,
})

const result = (rows: unknown[][]) => ({
  ok: true as const,
  result: { columns: ['x'], rows, rowCount: rows.length, command: 'SELECT' },
})

function setup(answers: Record<string, string>) {
  const attempt = {
    id: 'a1',
    userId: 'u1',
    deliveryId: 'd1',
    submittedAt: null,
    startedAt: new Date(),
    drawnQuestionIds: ['q1', 'q2'],
    answers,
    delivery: {
      timeLimitMinutes: null,
      assessment: {
        dataset: { setupSql: 'create table t(x int);' },
        sections: [
          {
            id: 's1',
            number: 1,
            title: 'S',
            draw: null,
            questions: [
              sqlQuestion('q1', 'select 1 /*ref1*/'),
              sqlQuestion('q2', 'select 2 /*ref2*/'),
            ],
          },
        ],
      },
    },
  }
  const prisma = {
    assessmentAttempt: {
      findUnique: jest.fn(async () => attempt),
      update: jest.fn(async () => attempt),
    },
  }
  const executeMany = jest.fn(async (_setup: string, queries: string[]) =>
    queries.map(() => result([[1]]))
  )
  const svc = new AssessmentsService(prisma as never, {} as never, { executeMany } as never)
  return { svc, executeMany, prisma }
}

describe('AssessmentsService.submit with SQL questions', () => {
  it('runs every reference query before any learner query', async () => {
    const { svc, executeMany } = setup({ q1: 'learner one', q2: 'learner two' })
    await svc.submit('u1', 'a1')
    expect(executeMany).toHaveBeenCalledWith('create table t(x int);', [
      'select 1 /*ref1*/',
      'select 2 /*ref2*/',
      'learner one',
      'learner two',
    ])
  })

  it('pairs each learner query with its own reference when grading', async () => {
    const { svc, executeMany, prisma } = setup({ q1: 'learner one', q2: 'learner two' })
    // q1: reference [1], learner [1] -> correct; q2: reference [2], learner [1] -> wrong
    executeMany.mockResolvedValue([result([[1]]), result([[2]]), result([[1]]), result([[1]])])
    await svc.submit('u1', 'a1')
    const saved = (
      prisma.assessmentAttempt.update.mock.calls[0] as unknown as [
        { data: { sectionScores: { questions: { id: string; correct: boolean }[] }[] } },
      ]
    )[0].data.sectionScores
    expect(saved[0].questions.map((q) => [q.id, q.correct])).toEqual([
      ['q1', true],
      ['q2', false],
    ])
  })
})
