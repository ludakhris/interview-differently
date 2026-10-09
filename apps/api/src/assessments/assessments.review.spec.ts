import { AssessmentsService, reviewEnabled } from './assessments.service'

/** Learners review their answers after a post assessment, not a pre (the bank is reused). */

describe('reviewEnabled', () => {
  it('defaults on for post labels and off for everything else', () => {
    expect(reviewEnabled({ label: 'post', showReview: null })).toBe(true)
    expect(reviewEnabled({ label: ' Post-test ', showReview: null })).toBe(true)
    expect(reviewEnabled({ label: 'pre', showReview: null })).toBe(false)
    expect(reviewEnabled({ label: 'midterm', showReview: null })).toBe(false)
  })

  it('lets an explicit choice override the label', () => {
    expect(reviewEnabled({ label: 'pre', showReview: true })).toBe(true)
    expect(reviewEnabled({ label: 'post', showReview: false })).toBe(false)
  })
})

function setup(delivery: { label: string; showReview: boolean | null }) {
  const attempt = {
    id: 'a1',
    userId: 'u1',
    deliveryId: 'd1',
    submittedAt: new Date(),
    drawnQuestionIds: ['1.2', '1.1'],
    answers: { '1.1': 'B' },
    sectionScores: [
      {
        sectionId: 's1',
        title: 'S',
        correct: 1,
        total: 2,
        questions: [
          { id: '1.2', type: 'mc', correct: false },
          { id: '1.1', type: 'mc', correct: true },
        ],
      },
    ],
    delivery: {
      ...delivery,
      assessment: {
        title: 'T',
        sections: [
          {
            id: 's1',
            number: 1,
            title: 'S',
            draw: null,
            questions: ['1.1', '1.2', '1.3'].map((id) => ({
              id,
              type: 'mc',
              prompt: `q ${id}`,
              options: [
                { key: 'A', text: 'a' },
                { key: 'B', text: 'b' },
              ],
              answer: 'B',
            })),
          },
        ],
      },
    },
  }
  const prisma = {
    assessmentAttempt: { findUnique: jest.fn(async () => attempt) },
    user: { findUnique: jest.fn(async () => ({ email: 'ana@x.test', displayName: 'Ana' })) },
  }
  return new AssessmentsService(prisma as never, {} as never, {} as never)
}

describe('AssessmentsService.getResult review', () => {
  it('includes the review for a post assessment, in paper order, drawn questions only', async () => {
    const r = await setup({ label: 'post', showReview: null }).getResult('u1', 'a1')
    expect(r.review).toHaveLength(1)
    expect(r.review![0].questions).toEqual([
      expect.objectContaining({ id: '1.2', answer: '', correct: false, correctAnswer: 'B' }),
      expect.objectContaining({ id: '1.1', answer: 'B', correct: true, correctAnswer: 'B' }),
    ])
  })

  it('omits the review for a pre assessment', async () => {
    const r = await setup({ label: 'pre', showReview: null }).getResult('u1', 'a1')
    expect(r).not.toHaveProperty('review')
  })

  it('honours an explicit setting', async () => {
    expect(await setup({ label: 'pre', showReview: true }).getResult('u1', 'a1')).toHaveProperty(
      'review'
    )
    expect(
      await setup({ label: 'post', showReview: false }).getResult('u1', 'a1')
    ).not.toHaveProperty('review')
  })

  it('admin attempt review ignores the learner setting', async () => {
    const r = await setup({ label: 'pre', showReview: false }).attemptReview('d1', 'a1')
    expect(r.review[0].questions).toHaveLength(2)
    expect(r.overall).toEqual({ correct: 1, total: 2, percent: 50 })
    expect(r.sections).toEqual([{ sectionId: 's1', title: 'S', correct: 1, total: 2 }])
  })

  it('admin attempt review rejects an attempt from another delivery', async () => {
    await expect(
      setup({ label: 'pre', showReview: null }).attemptReview('other', 'a1')
    ).rejects.toThrow('not found')
  })

  it('an LTI review session shows the review even though the delivery setting is off', async () => {
    const svc = setup({ label: 'lti:item1', showReview: null })
    expect(await svc.getResult('u1', 'a1', 'd1')).not.toHaveProperty('review')
    expect(await svc.getResult('u1', 'a1', 'd1', true)).toHaveProperty('review')
  })

  it('names the learner only when asked (a staff review)', async () => {
    const svc = setup({ label: 'lti:item1', showReview: null })
    expect(await svc.getResult('u1', 'a1', 'd1', true)).not.toHaveProperty('learner')
    expect(await svc.getResult('u1', 'a1', 'd1', true, true)).toMatchObject({ learner: 'Ana' })
  })
})
