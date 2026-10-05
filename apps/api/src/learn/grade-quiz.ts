import { BadRequestException } from '@nestjs/common'
import type { KnowledgeCheckQuestion, QuizResult } from '@id/types'

/** Grades answers (one chosen option index per question) against the answer key. */
export function gradeQuiz(questions: KnowledgeCheckQuestion[], answers: unknown): QuizResult {
  if (questions.length === 0) throw new BadRequestException('This quiz has no questions yet')
  if (!Array.isArray(answers) || answers.length !== questions.length) {
    throw new BadRequestException('Answer every question')
  }
  const correct = questions.map((q, i) => {
    const a = answers[i]
    if (typeof a !== 'number' || !Number.isInteger(a) || a < 0 || a >= q.options.length) {
      throw new BadRequestException(`Choose an answer for question ${i + 1}`)
    }
    return a === q.correctIndex
  })
  const right = correct.filter(Boolean).length
  return {
    score: Math.round((right / questions.length) * 100),
    correct,
    correctIndexes: questions.map((q) => q.correctIndex),
  }
}

/** The questions without the answer key, safe to send to a learner. */
export function publicQuestions(questions: KnowledgeCheckQuestion[]) {
  return questions.map((q) => ({ prompt: q.prompt, options: q.options }))
}
