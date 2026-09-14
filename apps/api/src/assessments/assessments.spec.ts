import { parseAssessmentMarkdown, AssessmentParseError } from './parse-markdown'
import { compareResults } from './grade'
import { drawCount, drawSection, formatDrawSpec, parseDrawSpec } from './draw'
import type { QueryResult } from '../sql-runner/sql-runner.service'

const BANK = `---
slug: demo-bank
title: Demo Bank
dataset: demo
draw: 2
---

# Some preamble the parser should ignore

## Section 1: Basics
> draw: 1

**1.1 (MC)** Which clause filters rows?
A) SELECT  B) WHERE  C) HAVING  D) ORDER BY
**Answer: B**

**1.2 (MC)** Default sort direction?
A) Ascending
B) Descending
**Answer: A. ASC is the default when nothing is specified.**

**1.3 (Scenario)** Explain NULL in your own words.
**Answer: model answer here**

**1.4 (Hands-On SQL)** Return the 5 newest customers.
> ordered
**Answer:**
\`\`\`sql
SELECT * FROM customers
ORDER BY signup_date DESC
LIMIT 5;
\`\`\`

---

## Section 2 — Joins

**2.1 (Hands-On SQL)** Customers with no orders.
> strictColumns
**Answer:**
\`\`\`sql
SELECT c.customer_id FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id WHERE o.order_id IS NULL;
\`\`\`
`

describe('parseAssessmentMarkdown', () => {
  const parsed = parseAssessmentMarkdown(BANK)

  it('reads frontmatter', () => {
    expect(parsed).toMatchObject({ slug: 'demo-bank', title: 'Demo Bank', dataset: 'demo', defaultDraw: 2 })
  })

  it('splits sections and applies per-section draw', () => {
    expect(parsed.sections.map((s) => [s.id, s.title, s.draw])).toEqual([
      ['s1', 'Basics', 1],
      ['s2', 'Joins', 1], // default 2 capped to the 1 usable question, with a warning
    ])
    expect(parsed.warnings).toContain('Section 2 draws 2 but only has 1 questions — all will be used')
  })

  it('parses MC options on one line or several, and answers with trailing text', () => {
    const [q1, q2] = parsed.sections[0].questions
    expect(q1).toMatchObject({ id: '1.1', type: 'mc', answer: 'B' })
    expect((q1 as { options: unknown[] }).options).toHaveLength(4)
    expect(q2).toMatchObject({ id: '1.2', type: 'mc', answer: 'A' })
    expect((q2 as { options: { text: string }[] }).options.map((o) => o.text)).toEqual(['Ascending', 'Descending'])
  })

  it('skips Scenario questions with a warning', () => {
    expect(parsed.sections[0].questions.map((q) => q.id)).toEqual(['1.1', '1.2', '1.4'])
    expect(parsed.warnings).toContain('Question 1.3 skipped — only MC and Hands-On SQL are supported in v1')
  })

  it('captures SQL reference queries and flags', () => {
    expect(parsed.sections[0].questions[2]).toMatchObject({
      id: '1.4',
      type: 'sql',
      ordered: true,
      strictColumns: false,
      referenceSql: 'SELECT * FROM customers\nORDER BY signup_date DESC\nLIMIT 5;',
    })
    expect(parsed.sections[1].questions[0]).toMatchObject({ id: '2.1', ordered: false, strictColumns: true })
  })

  it('captures an optional starter query and keeps the prompt clean', () => {
    const md = `---
slug: s
title: S
dataset: d
---

## Section 1: X

**1.1 (Hands-On SQL)** Count customers per state.
> strictColumns
**Starter:**
\`\`\`sql
SELECT state, COUNT(*) AS n
FROM customers
-- finish the query
\`\`\`
**Answer:**
\`\`\`sql
SELECT state, COUNT(*) AS n FROM customers GROUP BY state;
\`\`\`
`
    const q = parseAssessmentMarkdown(md).sections[0].questions[0]
    expect(q).toMatchObject({
      type: 'sql',
      prompt: 'Count customers per state.',
      strictColumns: true,
      starterSql: 'SELECT state, COUNT(*) AS n\nFROM customers\n-- finish the query',
      referenceSql: 'SELECT state, COUNT(*) AS n FROM customers GROUP BY state;',
    })
    // no starter → no key at all (keeps stored JSON tidy)
    expect('starterSql' in parsed.sections[0].questions[2]).toBe(false)
  })

  it('rejects structural problems', () => {
    expect(() => parseAssessmentMarkdown('no frontmatter')).toThrow(AssessmentParseError)
    expect(() => parseAssessmentMarkdown(BANK.replace('**Answer: B**', ''))).toThrow(/1\.1: missing/)
    expect(() => parseAssessmentMarkdown(BANK.replace('**Answer: B**', '**Answer: Z**'))).toThrow(/not one of the options/)
  })
})

const TYPED_BANK = `---
slug: typed
title: Typed draw
dataset: demo
draw: { mc: 2, sql: 1 }
---

## Section 1: Mixed

**1.1 (MC)** a?
A) x  B) y
**Answer: A**

**1.2 (MC)** b?
A) x  B) y
**Answer: B**

**1.3 (MC)** c?
A) x  B) y
**Answer: A**

**1.4 (Hands-On SQL)** q1
**Answer:**
\`\`\`sql
SELECT 1;
\`\`\`

**1.5 (Hands-On SQL)** q2
**Answer:**
\`\`\`sql
SELECT 2;
\`\`\`

## Section 2: Short on sql
> draw: mc 1, sql 2

**2.1 (MC)** a?
A) x  B) y
**Answer: A**

**2.2 (Hands-On SQL)** q
**Answer:**
\`\`\`sql
SELECT 1;
\`\`\`

## Section 3: Plain total still works
> draw: 1

**3.1 (MC)** a?
A) x  B) y
**Answer: A**

**3.2 (MC)** b?
A) x  B) y
**Answer: B**
`

describe('per-type draw', () => {
  const parsed = parseAssessmentMarkdown(TYPED_BANK)

  it('parses draw specs in every accepted spelling', () => {
    expect(parseDrawSpec('4')).toBe(4)
    expect(parseDrawSpec('mc 3, sql 1')).toEqual({ mc: 3, sql: 1 })
    expect(parseDrawSpec('MC: 3, SQL: 1')).toEqual({ mc: 3, sql: 1 })
    expect(parseDrawSpec('three')).toBeNull()
    expect(formatDrawSpec({ mc: 3, sql: 1 })).toBe('mc 3, sql 1')
  })

  it('reads the frontmatter map, per-section overrides, and clamps per type', () => {
    expect(parsed.defaultDraw).toEqual({ mc: 2, sql: 1 })
    expect(parsed.sections.map((s) => s.draw)).toEqual([{ mc: 2, sql: 1 }, { mc: 1, sql: 1 }, 1])
    expect(parsed.warnings).toEqual(['Section 2 draws 2 sql but only has 1 — all will be used'])
    expect(parsed.sections.map(drawCount)).toEqual([3, 2, 1])
  })

  it('draws exactly the per-type counts, every time', () => {
    const s = parsed.sections[0]
    for (let i = 0; i < 50; i++) {
      const paper = drawSection(s)
      expect(paper.filter((q) => q.type === 'mc')).toHaveLength(2)
      expect(paper.filter((q) => q.type === 'sql')).toHaveLength(1)
    }
  })

  it('a plain total stays type-blind', () => {
    const s = { ...parsed.sections[0], draw: 3 }
    const seen = new Set<number>()
    for (let i = 0; i < 100; i++) seen.add(drawSection(s).filter((q) => q.type === 'sql').length)
    expect(seen.size).toBeGreaterThan(1)
  })

  it('rejects a malformed frontmatter draw', () => {
    expect(() => parseAssessmentMarkdown(TYPED_BANK.replace('draw: { mc: 2, sql: 1 }', 'draw: lots'))).toThrow(AssessmentParseError)
  })
})

describe('compareResults', () => {
  const r = (columns: string[], rows: unknown[][]): QueryResult => ({ columns, rows, rowCount: rows.length, command: 'SELECT' })
  const loose = { ordered: false, strictColumns: false }

  it('ignores row order and column names by default', () => {
    const ref = r(['name', 'total'], [['a', '10.00'], ['b', '5.50']])
    const student = r(['n', 't'], [['b', 5.5], ['a', '10']])
    expect(compareResults(student, ref, loose)).toEqual({ match: true })
  })

  it('enforces order when flagged', () => {
    const ref = r(['x'], [[1], [2]])
    expect(compareResults(r(['x'], [[2], [1]]), ref, { ...loose, ordered: true }).match).toBe(false)
    expect(compareResults(r(['x'], [[1], [2]]), ref, { ...loose, ordered: true }).match).toBe(true)
  })

  it('enforces column names when flagged, case-insensitively', () => {
    const ref = r(['customer_id'], [[1]])
    expect(compareResults(r(['CUSTOMER_ID'], [[1]]), ref, { ...loose, strictColumns: true }).match).toBe(true)
    expect(compareResults(r(['id'], [[1]]), ref, { ...loose, strictColumns: true })).toMatchObject({ match: false })
  })

  it('reports column count and row count mismatches', () => {
    const ref = r(['a', 'b'], [[1, 2]])
    expect(compareResults(r(['a'], [[1]]), ref, loose).reason).toMatch(/2 column/)
    expect(compareResults(r(['a', 'b'], []), ref, loose).reason).toMatch(/1 row/)
  })

  it('treats NULL distinctly from the string "NULL"', () => {
    const ref = r(['e'], [[null]])
    expect(compareResults(r(['e'], [['NULL']]), ref, loose).match).toBe(false)
    expect(compareResults(r(['e'], [[null]]), ref, loose).match).toBe(true)
  })
})
