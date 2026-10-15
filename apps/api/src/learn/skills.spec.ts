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

  const checkpoint = {
    id: 'cp',
    type: 'tool',
    config: {
      toolId: 'id-checkpoint',
      ref: 'b',
      tasks: [
        { ref: '1.1', skill: 'safety' },
        { ref: '1.2', skill: 'safety' },
        { ref: '2.1', skill: 'comms' },
      ],
    },
  }
  const cpResults = (a: boolean, b: boolean, c?: boolean) => ({
    results: [
      { ref: '1.1', correct: a },
      { ref: '1.2', correct: b },
      ...(c === undefined ? [] : [{ ref: '2.1', correct: c }]),
    ],
  })

  it('counts each SQL checkpoint task as evidence for its skill', () => {
    const r = skillResults(
      skills,
      [checkpoint],
      new Map([['cp', done(cpResults(true, false, true))]])
    )
    expect(by(r, 'safety')).toMatchObject({ pct: 50, n: 2, status: 'gap' })
    expect(by(r, 'comms')).toMatchObject({ pct: 100, n: 1, status: 'demonstrated' })
  })

  it('calls a skill emerging, not shown, until it has the evidence the course asks for', () => {
    const strict = skills.map((s) => ({ ...s, minEvidence: 2 }))
    const r = skillResults(
      strict,
      [checkpoint],
      new Map([['cp', done(cpResults(true, true, true))]])
    )
    expect(by(r, 'safety')).toMatchObject({ n: 2, status: 'demonstrated' })
    expect(by(r, 'comms')).toMatchObject({ n: 1, status: 'emerging' })
  })

  it('flags a gap on a single piece of evidence even when more is asked for showing it', () => {
    const strict = skills.map((s) => ({ ...s, minEvidence: 3 }))
    const r = skillResults(
      strict,
      [checkpoint],
      new Map([['cp', done(cpResults(true, true, false))]])
    )
    expect(by(r, 'comms')).toMatchObject({ n: 1, status: 'gap' })
  })

  it('judges a skill that asks for more evidence on its most recent answers', () => {
    const strict = skills.map((s) => ({ ...s, minEvidence: 2 }))
    const t = (ref: string, correct: boolean, at: string) => ({ ref, correct, at })
    const early = { ...checkpoint, id: 'diag' }
    const later = {
      ...checkpoint,
      id: 'mod',
      config: {
        toolId: 'id-checkpoint',
        ref: 'b',
        tasks: [
          { ref: '1.3', skill: 'safety' },
          { ref: '1.4', skill: 'safety' },
        ],
      },
    }
    const progress = new Map([
      ['diag', done({ results: [t('1.1', false, '2026-01-01'), t('1.2', false, '2026-01-01')] })],
      ['mod', done({ results: [t('1.3', true, '2026-01-02'), t('1.4', true, '2026-01-03')] })],
    ])
    const r = skillResults(strict, [early, later], progress)
    expect(by(r, 'safety')).toMatchObject({ pct: 100, n: 4, status: 'demonstrated' })
    // Without minEvidence every answer counts, as before.
    expect(by(skillResults(skills, [early, later], progress), 'safety')).toMatchObject({
      pct: 50,
      status: 'gap',
    })
  })

  it('counts a pass ("not learned this yet") as no evidence, not as a gap', () => {
    const passed = {
      results: [
        { ref: '1.1', correct: false, passed: true },
        { ref: '1.2', correct: false, passed: true },
      ],
    }
    const r = skillResults(skills, [checkpoint], new Map([['cp', done(passed)]]))
    expect(by(r, 'safety')).toMatchObject({ n: 0, status: 'unknown' })
  })

  it('does not count generated practice, which is remediation', () => {
    const slot = {
      ...checkpoint,
      id: 'slot',
      config: { ...checkpoint.config, remediationFor: 'safety' },
    }
    const r = skillResults(skills, [slot], new Map([['slot', done(cpResults(true, true))]]))
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
    expect(parseSkills([{ id: 'a', label: 'A', targetPct: 70, minEvidence: 2 }])).toEqual([
      { id: 'a', label: 'A', targetPct: 70, minEvidence: 2 },
    ])
    expect(parseSkills(undefined)).toEqual([])
  })
})
