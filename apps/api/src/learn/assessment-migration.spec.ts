import { legacyQuestions, planItem, questionsToMarkdown, toolConfig } from './assessment-migration'

const q = (prompt: string, options: string[], correctIndex: number, skill?: string) => ({
  prompt,
  options,
  correctIndex,
  ...(skill ? { skill } : {}),
})

const plan = (questions: unknown[], title = 'Pre-assessment') => {
  const p = planItem({ id: 'abc-123', title, config: { questions } })
  if (!p.ok) throw new Error(p.reason)
  return p
}

describe('planItem', () => {
  it('builds one section holding every question, drawn in full', () => {
    const p = plan([q('One?', ['a', 'b'], 0), q('Two?', ['a', 'b', 'c'], 2)])
    expect(p.slug).toBe('ld-abc-123')
    expect(p.parsed.title).toBe('Pre-assessment')
    expect(p.parsed.dataset).toBeNull()
    expect(p.parsed.expectedMinutes).toBeNull()
    expect(p.parsed.defaultDraw).toBeNull()
    expect(p.parsed.warnings).toEqual([])
    expect(p.parsed.sections).toHaveLength(1)
    const [s] = p.parsed.sections
    expect(s).toMatchObject({ id: 's1', number: 1, title: 'Assessment', draw: null })
    expect(s.questions.map((x) => x.id)).toEqual(['1.1', '1.2'])
    expect(p.questionCount).toBe(2)
  })

  it('turns correctIndex into the answer letter, for odd option counts too', () => {
    const p = plan([
      q('Q1', ['a', 'b', 'c'], 2),
      q('Q2', ['a', 'b', 'c', 'd', 'e'], 4),
      q('Q3', ['a', 'b'], 0),
      q('Q4', ['a', 'b', 'c', 'd', 'e', 'f'], 3),
    ])
    const mc = p.parsed.sections[0].questions.flatMap((x) => (x.type === 'mc' ? [x] : []))
    expect(mc.map((x) => x.answer)).toEqual(['C', 'E', 'A', 'D'])
    expect(mc.map((x) => x.options.map((o) => o.key).join(''))).toEqual([
      'ABC',
      'ABCDE',
      'AB',
      'ABCDEF',
    ])
  })

  it('keeps prompt and option text intact', () => {
    const p = plan([q('Which is right?', ['First one', 'Second one'], 1)])
    expect(p.parsed.sections[0].questions[0]).toMatchObject({
      type: 'mc',
      prompt: 'Which is right?',
      options: [
        { key: 'A', text: 'First one' },
        { key: 'B', text: 'Second one' },
      ],
      answer: 'B',
    })
  })

  it('does not let text that looks like markup change the structure', () => {
    const tricky = [
      q('A) this prompt begins like an option', ['B) looks like an option', 'plain'], 1),
      q('**Answer: A** is in the prompt', ['**Answer: B**', '## Section 9: Evil'], 0),
      q('Line one\nA) line two\n**1.9 (MC)** line three', ['x  B) y', '> draw: 1'], 1),
      q('> ordered', ['\tC) tabbed', '1.5 (MC)'], 0),
    ]
    const p = plan(tricky)
    const qs = p.parsed.sections[0].questions.flatMap((x) => (x.type === 'mc' ? [x] : []))
    expect(p.parsed.sections).toHaveLength(1)
    expect(qs).toHaveLength(4)
    expect(p.parsed.warnings).toEqual([])
    expect(qs[0].prompt).toBe('A) this prompt begins like an option')
    expect(qs[0].options.map((o) => o.text)).toEqual(['B) looks like an option', 'plain'])
    expect(qs[0].answer).toBe('B')
    expect(qs[1].prompt).toBe('**Answer: A** is in the prompt')
    expect(qs[1].options.map((o) => o.text)).toEqual(['**Answer: B**', '## Section 9: Evil'])
    expect(qs[1].answer).toBe('A')
    expect(qs[2].prompt).toBe('Line one A) line two **1.9 (MC)** line three')
    expect(qs[2].options.map((o) => o.text)).toEqual(['x B) y', '> draw: 1'])
    expect(qs[3].options.map((o) => o.text)).toEqual(['C) tabbed', '1.5 (MC)'])
    expect(qs.map((x) => x.id)).toEqual(['1.1', '1.2', '1.3', '1.4'])
    expect(p.parsed.sections[0].draw).toBeNull()
  })

  it('survives a title with quotes, colons and newlines', () => {
    expect(plan([q('Q?', ['a', 'b'], 0)], 'Pre: "Intro"\n# done').parsed.title).toBe(
      'Pre: "Intro" # done'
    )
  })

  it('collects each skill tag once', () => {
    const p = plan([
      q('a', ['x', 'y'], 0, 'safety'),
      q('b', ['x', 'y'], 0, 'safety'),
      q('c', ['x', 'y'], 1),
    ])
    expect(p.skills).toEqual(['safety'])
  })

  it('skips an item it cannot convert, with the reason', () => {
    const skip = (config: unknown) => {
      const p = planItem({ id: 'i', title: 'T', config })
      return p.ok ? null : p.reason
    }
    expect(skip({})).toMatch(/no inline questions/)
    expect(skip({ questions: [] })).toMatch(/no inline questions/)
    expect(skip({ questions: [q('Q', ['only'], 0)] })).toMatch(/question 1.*two usable/)
    expect(skip({ questions: [q('Q', ['a', 'b'], 2)] })).toMatch(/outside its options/)
    expect(skip({ questions: [q('Q', ['a', ' '], 0)] })).toMatch(/two usable/)
    expect(skip({ questions: [q('  ', ['a', 'b'], 0)] })).toMatch(/no text/)
  })
})

describe('questionsToMarkdown / legacyQuestions / toolConfig', () => {
  it('writes the importable format', () => {
    expect(questionsToMarkdown('s', 'T', [q('Why?', ['a', 'b'], 1)])).toBe(
      [
        '---',
        'slug: "s"',
        'title: "T"',
        '---',
        '',
        '## Section 1: Assessment',
        '',
        '**1.1 (MC)** Why?',
        'A) a',
        'B) b',
        '**Answer: B**',
        '',
      ].join('\n')
    )
  })

  it('rejects malformed question lists', () => {
    expect(legacyQuestions({ questions: [{ prompt: 'x' }] })).toBeNull()
    expect(legacyQuestions(null)).toBeNull()
  })

  it('points the converted item at the tool', () => {
    expect(toolConfig('ld-1')).toEqual({ toolId: 'id-assessment', ref: 'ld-1', maxAttempts: 1 })
  })
})
