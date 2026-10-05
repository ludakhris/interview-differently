import { BadRequestException } from '@nestjs/common'
import { gradeQuiz, publicQuestions } from './grade-quiz'

const qs = [
  { prompt: 'Pulse?', options: ['20', '70', '200'], correctIndex: 1 },
  { prompt: 'IDs?', options: ['One', 'Two'], correctIndex: 1 },
  { prompt: 'Hands?', options: ['Wash', 'Skip'], correctIndex: 0 },
]

describe('gradeQuiz', () => {
  it('scores the share of correct answers and reveals the key', () => {
    expect(gradeQuiz(qs, [1, 1, 1])).toEqual({
      score: 67,
      correct: [true, true, false],
      correctIndexes: [1, 1, 0],
    })
    expect(gradeQuiz(qs, [1, 1, 0]).score).toBe(100)
    expect(gradeQuiz(qs, [0, 0, 1]).score).toBe(0)
  })

  it('rejects missing, extra or out-of-range answers', () => {
    expect(() => gradeQuiz(qs, [1, 1])).toThrow(BadRequestException)
    expect(() => gradeQuiz(qs, [1, 1, 5])).toThrow(BadRequestException)
    expect(() => gradeQuiz(qs, [1, 1, '0'])).toThrow(BadRequestException)
    expect(() => gradeQuiz(qs, 'nope')).toThrow(BadRequestException)
    expect(() => gradeQuiz([], [])).toThrow(BadRequestException)
  })
})

describe('publicQuestions', () => {
  it('strips the answer key', () => {
    expect(publicQuestions(qs)[0]).toEqual({ prompt: 'Pulse?', options: ['20', '70', '200'] })
    expect(JSON.stringify(publicQuestions(qs))).not.toContain('correctIndex')
  })
})
