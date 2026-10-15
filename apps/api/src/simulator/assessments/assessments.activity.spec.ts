import { NotFoundException } from '@nestjs/common'
import { AssessmentsService } from './assessments.service'

const user = (email: string) => ({ email, displayName: null })

function setup(cohortExists = true) {
  const prisma = {
    cohort: {
      findFirst: jest.fn(async () => (cohortExists ? { id: 'c1', name: 'Cohort 1' } : null)),
    },
    assessmentDelivery: {
      findMany: jest.fn(async () => [
        {
          id: 'd1',
          label: 'pre',
          opensAt: null,
          closesAt: null,
          timeLimitMinutes: null,
          assessment: { title: 'Bank' },
          attempts: [
            {
              userId: 'u1',
              drawnQuestionIds: ['q1', 'q2', 'q3'],
              answers: { q1: 'A', q2: '  ', q3: 'SELECT 1' },
              startedAt: new Date(),
              submittedAt: null,
              updatedAt: new Date(),
            },
            {
              userId: 'u2',
              drawnQuestionIds: ['q1'],
              answers: { q1: 'B' },
              startedAt: new Date(),
              submittedAt: new Date(),
              updatedAt: new Date(),
            },
            // Left the cohort after starting.
            {
              userId: 'u4',
              drawnQuestionIds: ['q1'],
              answers: {},
              startedAt: new Date(),
              submittedAt: null,
              updatedAt: new Date(),
            },
          ],
        },
      ]),
    },
    membership: {
      findMany: jest.fn(async () => [
        { userId: 'u1', user: user('u1@x.test') },
        { userId: 'u2', user: user('u2@x.test') },
        { userId: 'u3', user: user('u3@x.test') },
      ]),
    },
    user: {
      findMany: jest.fn(async () => [{ id: 'u4', email: 'u4@x.test', displayName: null }]),
    },
  }
  const service = new AssessmentsService(prisma as never, {} as never, {} as never)
  return { service, prisma }
}

describe('cohortActivity', () => {
  it('reports not started / in progress (answered of drawn) / submitted per student', async () => {
    const { service } = setup()
    const out = await service.cohortActivity('i1', 'c1')
    const d = out.deliveries[0]
    expect(d.counts).toEqual({ notStarted: 1, inProgress: 2, submitted: 1 })
    const by = Object.fromEntries(d.students.map((s) => [s.userId, s]))
    expect(by.u1).toMatchObject({ status: 'in_progress', answeredCount: 2, questionCount: 3 })
    expect(by.u2).toMatchObject({ status: 'submitted', answeredCount: 1, questionCount: 1 })
    expect(by.u3).toMatchObject({ status: 'not_started', answeredCount: 0, questionCount: 0 })
    expect(by.u4.status).toBe('in_progress')
    expect(d.students.map((x) => x.status)).toEqual([
      'in_progress',
      'in_progress',
      'not_started',
      'submitted',
    ])
  })

  it('returns no scores', async () => {
    const { service } = setup()
    const out = await service.cohortActivity('i1', 'c1')
    expect(JSON.stringify(out)).not.toMatch(/score/i)
  })

  it('404s for a cohort outside the institution', async () => {
    const { service } = setup(false)
    await expect(service.cohortActivity('i1', 'c1')).rejects.toBeInstanceOf(NotFoundException)
  })
})
