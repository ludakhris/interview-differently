import { parseAssessmentMarkdown, AssessmentParseError } from './parse-markdown'
import { compareResults } from './grade'
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

  it('rejects structural problems', () => {
    expect(() => parseAssessmentMarkdown('no frontmatter')).toThrow(AssessmentParseError)
    expect(() => parseAssessmentMarkdown(BANK.replace('**Answer: B**', ''))).toThrow(/1\.1: missing/)
    expect(() => parseAssessmentMarkdown(BANK.replace('**Answer: B**', '**Answer: Z**'))).toThrow(/not one of the options/)
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
