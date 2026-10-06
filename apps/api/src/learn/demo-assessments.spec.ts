import { questionsFor } from '../../scripts/seed-learn-content'
import { planItem, toolConfig } from './assessment-migration'

// The demo seed (scripts/seed-learn-demo.ts) turns each program's question bank into an Interview
// Differently assessment with this helper; every bank must come out valid with its answers intact.
const KEYS = [
  'harbor-point',
  'tidewater',
  'lantern-hill',
  'cedar-mill',
  'open-road',
  'bayline',
  'marsh-creek',
  'ridgeline',
]

describe('demo assessment banks', () => {
  it.each(KEYS)('%s becomes a valid bank with the right answers', (key) => {
    const questions = questionsFor(key)
    const slug = `demo-assessment-${key}`
    const plan = planItem({ id: slug, title: 'Assessment', config: { questions } }, slug)
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.slug).toBe(slug)
    expect(plan.parsed.warnings).toEqual([])
    const parsed = plan.parsed.sections[0].questions
    expect(parsed).toHaveLength(questions.length)
    questions.forEach((q, i) => {
      const p = parsed[i]
      if (p.type !== 'mc') throw new Error('expected a multiple-choice question')
      expect(p.prompt).toBe(q.prompt)
      expect(p.options.find((o) => o.key === p.answer)?.text).toBe(q.options[q.correctIndex])
    })
  })

  it('the pre and post items launch the bank as a one-attempt assessment tool', () => {
    expect(toolConfig('demo-assessment-tidewater')).toEqual({
      toolId: 'id-assessment',
      ref: 'demo-assessment-tidewater',
      maxAttempts: 1,
    })
  })
})
