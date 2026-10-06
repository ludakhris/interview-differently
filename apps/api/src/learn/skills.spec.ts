import { parseSkills, remediationOf, skillResults } from './skills'

const skills = [
  { id: 'safety', label: 'Workplace safety', targetPct: 70 },
  { id: 'comms', label: 'Communication', targetPct: 60 },
]
const quiz = {
  id: 'k1',
  type: 'knowledge_check',
  config: {
    questions: [
      { id: 'q_a', prompt: 'a', options: ['x', 'y'], correctIndex: 0, skill: 'safety' },
      { id: 'q_b', prompt: 'b', options: ['x', 'y'], correctIndex: 0, skill: 'safety' },
      { id: 'q_c', prompt: 'c', options: ['x', 'y'], correctIndex: 0, skill: 'comms' },
      { id: 'q_d', prompt: 'd', options: ['x', 'y'], correctIndex: 0 },
    ],
  },
}
const done = (data: unknown, score: number | null = null) => ({
  status: 'completed',
  score,
  data,
})
const results = (...c: boolean[]) => ({
  results: [
    { id: 'q_a', correct: c[0] },
    { id: 'q_b', correct: c[1] },
    { id: 'q_c', correct: c[2] },
    { id: 'q_d', correct: c[3] },
  ],
})
const by = (r: ReturnType<typeof skillResults>, id: string) => r.find((x) => x.skillId === id)!

describe('skillResults', () => {
  it('flags a skill below its own pass mark and leaves a passing skill alone', () => {
    const r = skillResults(
      skills,
      [quiz],
      new Map([['k1', done(results(true, false, true, false))]])
    )
    expect(by(r, 'safety')).toMatchObject({ pct: 50, n: 2, status: 'gap' })
    expect(by(r, 'comms')).toMatchObject({ pct: 100, n: 1, status: 'demonstrated' })
  })

  it('uses a pass mark per skill', () => {
    const lenient = [{ id: 'safety', label: 'Safety', targetPct: 40 }]
    const r = skillResults(
      lenient,
      [quiz],
      new Map([['k1', done(results(true, false, true, true))]])
    )
    expect(by(r, 'safety').status).toBe('demonstrated')
  })

  it('has no opinion on a skill with no evidence, and ignores untagged questions', () => {
    expect(skillResults(skills, [quiz], new Map())).toEqual([
      expect.objectContaining({ skillId: 'safety', pct: null, n: 0, status: 'unknown' }),
      expect.objectContaining({ skillId: 'comms', pct: null, n: 0, status: 'unknown' }),
    ])
    const r = skillResults(
      skills,
      [quiz],
      new Map([['k1', done(results(true, true, true, false))]])
    )
    expect(by(r, 'safety').n).toBe(2)
  })

  it('ignores a quiz that is not finished, or has no stored per-question results', () => {
    const open = new Map([
      ['k1', { status: 'in_progress', score: null, data: results(false, false, false, false) }],
    ])
    expect(by(skillResults(skills, [quiz], open), 'safety').status).toBe('unknown')
    expect(
      by(skillResults(skills, [quiz], new Map([['k1', done(null, 40)]])), 'safety').status
    ).toBe('unknown')
  })

  it('ignores an item of a type that is no longer supported', () => {
    const legacy = { ...quiz, id: 'old', type: 'assessment' }
    const out = skillResults(
      skills,
      [legacy],
      new Map([['old', done(results(false, false, false, false))]])
    )
    expect(by(out, 'safety').pct).toBeNull()
  })

  it('counts an interview tagged with the skill by its best score', () => {
    const interview = { id: 'i1', type: 'interview', config: { skill: 'comms', questions: ['x'] } }
    const low = skillResults(skills, [interview], new Map([['i1', done(null, 45)]]))
    expect(by(low, 'comms')).toMatchObject({ pct: 45, n: 1, status: 'gap' })
    const mixed = skillResults(
      skills,
      [quiz, interview],
      new Map([
        ['k1', done(results(true, true, true, true))],
        ['i1', done(null, 50)],
      ])
    )
    expect(by(mixed, 'comms')).toMatchObject({ pct: 75, n: 2, status: 'demonstrated' })
  })

  it('never counts a remediation item as evidence', () => {
    const remedial = { ...quiz, id: 'k2', config: { ...quiz.config, remediationFor: 'safety' } }
    const r = skillResults(
      skills,
      [remedial],
      new Map([['k2', done(results(false, false, false, false))]])
    )
    expect(by(r, 'safety').status).toBe('unknown')
  })
})

describe('remediationOf and parseSkills', () => {
  it('reads the skill an item is remediation for', () => {
    expect(remediationOf({ remediationFor: 'safety' })).toBe('safety')
    expect(remediationOf({})).toBeNull()
    expect(remediationOf(null)).toBeNull()
  })

  it('drops malformed skills', () => {
    expect(parseSkills([{ id: 'a', label: 'A', targetPct: 70 }, { id: 'b' }, 'x'])).toEqual([
      { id: 'a', label: 'A', targetPct: 70 },
    ])
    expect(parseSkills(undefined)).toEqual([])
  })
})
