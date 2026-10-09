import { Prisma } from '@prisma/client'
import { AssessmentsService } from './assessments.service'
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

**1.3 (Scenario)** A teammate runs this query to find customers with no phone number:

\`\`\`sql
SELECT * FROM customers WHERE phone = NULL;
-- A) looks like an option but is code
\`\`\`

It returns zero rows. Why?
A) \`= NULL\` is never true; use \`IS NULL\`
B) Every customer has a phone number
C) \`SELECT *\` hides NULL columns
**Answer: A**

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
    expect(parsed).toMatchObject({
      slug: 'demo-bank',
      title: 'Demo Bank',
      dataset: 'demo',
      defaultDraw: 2,
    })
  })

  it('splits sections and applies per-section draw', () => {
    expect(parsed.sections.map((s) => [s.id, s.title, s.draw])).toEqual([
      ['s1', 'Basics', 1],
      ['s2', 'Joins', 1], // default 2 capped to the 1 usable question, with a warning
    ])
    expect(parsed.warnings).toContain(
      'Section 2 draws 2 but only has 1 questions — all will be used'
    )
  })

  it('parses MC options on one line or several, and answers with trailing text', () => {
    const [q1, q2] = parsed.sections[0].questions
    expect(q1).toMatchObject({ id: '1.1', type: 'mc', answer: 'B' })
    expect((q1 as { options: unknown[] }).options).toHaveLength(4)
    expect(q2).toMatchObject({ id: '1.2', type: 'mc', answer: 'A' })
    expect((q2 as { options: { text: string }[] }).options.map((o) => o.text)).toEqual([
      'Ascending',
      'Descending',
    ])
  })

  it('parses Scenario questions as MC with a multi-paragraph setup and code blocks kept verbatim', () => {
    const q = parsed.sections[0].questions[2] as {
      id: string
      type: string
      prompt: string
      options: { key: string }[]
      answer: string
    }
    expect(q).toMatchObject({ id: '1.3', type: 'scenario', answer: 'A' })
    expect(q.options.map((o) => o.key)).toEqual(['A', 'B', 'C'])
    expect(q.prompt).toBe(
      'A teammate runs this query to find customers with no phone number:\n\n' +
        '```sql\nSELECT * FROM customers WHERE phone = NULL;\n-- A) looks like an option but is code\n```\n\n' +
        'It returns zero rows. Why?'
    )
  })

  it('skips unknown question types with a warning', () => {
    const md = BANK.replace('**1.2 (MC)**', '**1.2 (Essay)**')
    const p = parseAssessmentMarkdown(md)
    expect(p.sections[0].questions.map((q) => q.id)).toEqual(['1.1', '1.3', '1.4'])
    expect(p.warnings).toContain(
      'Question 1.2 skipped — only MC, Scenario and Hands-On SQL are supported'
    )
  })

  it('captures SQL reference queries and flags', () => {
    expect(parsed.sections[0].questions[3]).toMatchObject({
      id: '1.4',
      type: 'sql',
      ordered: true,
      strictColumns: false,
      referenceSql: 'SELECT * FROM customers\nORDER BY signup_date DESC\nLIMIT 5;',
    })
    expect(parsed.sections[1].questions[0]).toMatchObject({
      id: '2.1',
      ordered: false,
      strictColumns: true,
    })
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
    expect('starterSql' in parsed.sections[0].questions[3]).toBe(false)
  })

  it('rejects structural problems', () => {
    expect(() => parseAssessmentMarkdown('no frontmatter')).toThrow(AssessmentParseError)
    expect(() => parseAssessmentMarkdown(BANK.replace('**Answer: B**', ''))).toThrow(
      /1\.1: missing/
    )
    expect(() => parseAssessmentMarkdown(BANK.replace('**Answer: B**', '**Answer: Z**'))).toThrow(
      /not one of the options/
    )
  })

  it('joins an option that wraps onto the next line instead of dropping the rest', () => {
    const md = BANK.replace(
      'B) Descending\n',
      'B) Descending, unless the column\nhas an index on it\n'
    )
    const q = parseAssessmentMarkdown(md).sections[0].questions[1] as {
      options: { text: string }[]
    }
    expect(q.options.map((o) => o.text)).toEqual([
      'Ascending',
      'Descending, unless the column has an index on it',
    ])
  })

  it('makes dataset optional unless the bank has Hands-On SQL', () => {
    const noSql = BANK.replace('dataset: demo\n', '').replace(
      /\*\*1\.4 \(Hands-On SQL\)[\s\S]*$/,
      ''
    )
    expect(parseAssessmentMarkdown(noSql).dataset).toBeNull()
    expect(() => parseAssessmentMarkdown(BANK.replace('dataset: demo\n', ''))).toThrow(
      /needs a dataset/
    )
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
    expect(() =>
      parseAssessmentMarkdown(TYPED_BANK.replace('draw: { mc: 2, sql: 1 }', 'draw: lots'))
    ).toThrow(AssessmentParseError)
  })
})

describe('compareResults', () => {
  const r = (columns: string[], rows: unknown[][]): QueryResult => ({
    columns,
    rows,
    rowCount: rows.length,
    command: 'SELECT',
  })
  const loose = { ordered: false, strictColumns: false }

  it('ignores row order and column names by default', () => {
    const ref = r(
      ['name', 'total'],
      [
        ['a', '10.00'],
        ['b', '5.50'],
      ]
    )
    const student = r(
      ['n', 't'],
      [
        ['b', 5.5],
        ['a', '10'],
      ]
    )
    expect(compareResults(student, ref, loose)).toEqual({ match: true })
  })

  it('enforces order when flagged', () => {
    const ref = r(['x'], [[1], [2]])
    expect(compareResults(r(['x'], [[2], [1]]), ref, { ...loose, ordered: true }).match).toBe(false)
    expect(compareResults(r(['x'], [[1], [2]]), ref, { ...loose, ordered: true }).match).toBe(true)
  })

  it('enforces column names when flagged, case-insensitively', () => {
    const ref = r(['customer_id'], [[1]])
    expect(
      compareResults(r(['CUSTOMER_ID'], [[1]]), ref, { ...loose, strictColumns: true }).match
    ).toBe(true)
    expect(compareResults(r(['id'], [[1]]), ref, { ...loose, strictColumns: true })).toMatchObject({
      match: false,
    })
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

describe('createDelivery institution guard', () => {
  // Stub Prisma: one bank, cohorts in two institutions. No database.
  const make = (assessmentInstitutionId: string | null) => {
    const created: unknown[] = []
    const prisma = {
      assessment: {
        findUnique: async () => ({ id: 'a1', institutionId: assessmentInstitutionId }),
      },
      cohort: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          ({
            own: { id: 'own', institutionId: 'inst-a' },
            other: { id: 'other', institutionId: 'inst-b' },
          })[where.id] ?? null,
      },
      assessmentDelivery: { create: async (args: unknown) => (created.push(args), { id: 'd1' }) },
    }
    return { service: new AssessmentsService(prisma as never, {} as never, {} as never), created }
  }

  it("rejects delivering an institution's bank to another institution's cohort", async () => {
    const { service, created } = make('inst-a')
    await expect(service.createDelivery('a1', { cohortId: 'other', label: 'pre' })).rejects.toThrow(
      /another institution/
    )
    expect(created).toHaveLength(0)
  })

  it("allows the bank's own cohorts, and platform banks anywhere", async () => {
    await expect(
      make('inst-a').service.createDelivery('a1', { cohortId: 'own', label: 'pre' })
    ).resolves.toEqual({ id: 'd1' })
    await expect(
      make(null).service.createDelivery('a1', { cohortId: 'other', label: 'pre' })
    ).resolves.toEqual({ id: 'd1' })
  })
})

describe('completion times (#39)', () => {
  it('reads expected_minutes from frontmatter', () => {
    expect(parseAssessmentMarkdown(BANK).expectedMinutes).toBeNull()
    expect(
      parseAssessmentMarkdown(BANK.replace('draw: 2\n', 'draw: 2\nexpected_minutes: 30\n'))
        .expectedMinutes
    ).toBe(30)
    for (const bad of ['0', '-5', '12.5', 'soon']) {
      expect(() =>
        parseAssessmentMarkdown(BANK.replace('draw: 2\n', `draw: 2\nexpected_minutes: ${bad}\n`))
      ).toThrow(/expected_minutes/)
    }
  })

  it('reports minutes per submitted attempt and the median against expected', async () => {
    const t0 = new Date('2026-09-29T10:00:00Z')
    const at = (min: number) => new Date(t0.getTime() + min * 60000)
    const attempts = [
      {
        id: 'a',
        userId: 'u1',
        startedAt: t0,
        submittedAt: at(20),
        submittedLate: false,
        sectionScores: null,
      },
      {
        id: 'b',
        userId: 'u2',
        startedAt: t0,
        submittedAt: at(34),
        submittedLate: false,
        sectionScores: null,
      },
      {
        id: 'c',
        userId: 'u3',
        startedAt: t0,
        submittedAt: at(90),
        submittedLate: false,
        sectionScores: null,
      },
      {
        id: 'd',
        userId: 'u4',
        startedAt: t0,
        submittedAt: null,
        submittedLate: false,
        sectionScores: null,
      },
    ]
    const prisma = {
      assessmentDelivery: {
        findUnique: async () => ({
          id: 'd1',
          label: 'pre',
          cohort: { name: 'C' },
          assessment: { id: 'x', title: 'T', sections: [], expectedMinutes: 30 },
          attempts,
        }),
      },
      user: { findMany: async () => [] },
    }
    const r = await new AssessmentsService(
      prisma as never,
      {} as never,
      {} as never
    ).deliveryResults('d1')
    expect(r.delivery).toMatchObject({ expectedMinutes: 30, medianMinutes: 34 })
    expect(r.attempts.map((a) => a.minutes)).toEqual([20, 34, 90, null])
  })
})

describe('live progress (#40)', () => {
  it('counts answered questions and lists cohort members who have not started', async () => {
    const t = new Date('2026-09-29T10:00:00Z')
    const prisma = {
      assessmentDelivery: {
        findUnique: async () => ({
          id: 'd1',
          label: 'pre',
          cohortId: 'c1',
          cohort: { name: 'C' },
          assessment: { id: 'x', title: 'T', sections: [], expectedMinutes: null },
          attempts: [
            {
              id: 'a',
              userId: 'u1',
              startedAt: t,
              submittedAt: null,
              submittedLate: false,
              sectionScores: null,
              updatedAt: t,
              drawnQuestionIds: ['q1', 'q2', 'q3', 'q4'],
              answers: { q1: 'B', q2: '  ', q3: 'SELECT 1', stale: 'A' },
            },
          ],
        }),
      },
      user: { findMany: async () => [] },
      membership: {
        findMany: async () => [
          { userId: 'u1', user: { email: 'one@x', displayName: 'One' } },
          { userId: 'u2', user: { email: 'two@x', displayName: 'Two' } },
          { userId: 'u2', user: { email: 'two@x', displayName: 'Two' } },
        ],
      },
    }
    const r = await new AssessmentsService(
      prisma as never,
      {} as never,
      {} as never
    ).deliveryResults('d1')
    expect(r.attempts[0]).toMatchObject({ answeredCount: 2, questionCount: 4, lastActivityAt: t })
    expect(r.notStarted).toEqual([{ userId: 'u2', email: 'two@x', displayName: 'Two' }])
  })
})

describe('LTI attempts (#63)', () => {
  const delivery = {
    id: 'd1',
    label: 'pre',
    showReview: null as boolean | null,
    cohortId: 'c1',
    opensAt: null as Date | null,
    closesAt: null as Date | null,
    assessment: {
      dataset: null,
      sections: [
        {
          id: 's1',
          number: 1,
          title: 'S',
          draw: null,
          questions: [{ id: '1.1', type: 'mc', prompt: 'p', options: [], answer: 'A' }],
        },
      ],
    },
  }
  const make = (over: { delivery?: unknown; existing?: unknown; attempt?: unknown } = {}) => {
    const create = jest.fn(async () => ({ id: 'new' }))
    const prisma = {
      assessmentDelivery: {
        findUnique: async () => (over.delivery === undefined ? delivery : over.delivery),
      },
      assessmentAttempt: {
        findUnique: async (a: { where: { id?: string } }) =>
          a.where.id ? (over.attempt ?? null) : (over.existing ?? null),
        create,
      },
      cohort: { count: jest.fn(async () => 0) },
    }
    const clerk = { isAdmin: async () => false }
    return {
      create,
      prisma,
      svc: new AssessmentsService(prisma as never, clerk as never, {} as never),
    }
  }

  it('draws the paper without the cohort membership check', async () => {
    const { svc, create, prisma } = make()
    await expect(svc.startAttemptForLti('u1', 'd1')).resolves.toEqual({ id: 'new' })
    expect(create).toHaveBeenCalledTimes(1)
    expect(prisma.cohort.count).not.toHaveBeenCalled()
    // the Clerk path still enforces it
    await expect(svc.startAttempt('u1', 'd1')).rejects.toThrow(/not found/)
  })

  it('resumes an existing attempt, even when the delivery has closed', async () => {
    const closed = { ...delivery, closesAt: new Date(Date.now() - 1000) }
    const { svc, create } = make({ delivery: closed, existing: { id: 'old' } })
    await expect(svc.startAttemptForLti('u1', 'd1')).resolves.toEqual({ id: 'old' })
    expect(create).not.toHaveBeenCalled()
  })

  it('keeps the open check and 404s an unknown delivery', async () => {
    const closed = { ...delivery, closesAt: new Date(Date.now() - 1000) }
    await expect(make({ delivery: closed }).svc.startAttemptForLti('u1', 'd1')).rejects.toThrow(
      /not open/
    )
    await expect(make({ delivery: null }).svc.startAttemptForLti('u1', 'd1')).rejects.toThrow(
      /not found/
    )
  })

  it('resumes the winner when two first starts race', async () => {
    const { svc, prisma } = make()
    let first = true
    const found = { id: 'winner' }
    prisma.assessmentAttempt.findUnique = (async (a: { where: { id?: string } }) =>
      a.where.id || first ? ((first = false), null) : found) as never
    prisma.assessmentAttempt.create = (async () => {
      throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' })
    }) as never
    await expect(svc.startAttemptForLti('u1', 'd1')).resolves.toEqual({ id: 'winner' })
  })

  it('pins an attempt to the session delivery and to its owner', async () => {
    const attempt = {
      id: 'a1',
      userId: 'u1',
      deliveryId: 'd1',
      submittedAt: new Date(),
      sectionScores: [],
      delivery,
    }
    const { svc } = make({ attempt })
    await expect(svc.getResult('u1', 'a1', 'd1')).resolves.toMatchObject({ overall: { total: 0 } })
    await expect(svc.getResult('u1', 'a1', 'other')).rejects.toThrow(/not found/)
    await expect(svc.getAttempt('u1', 'a1', 'other')).rejects.toThrow(/not found/)
    await expect(svc.saveAnswers('u1', 'a1', {}, 'other')).rejects.toThrow(/not found/)
    await expect(svc.submit('u1', 'a1', undefined, 'other')).rejects.toThrow(/not found/)
    await expect(svc.getResult('u2', 'a1', 'd1')).rejects.toThrow(/not found/)
    // no pin (Clerk): unchanged behaviour
    await expect(svc.getResult('u1', 'a1')).resolves.toBeDefined()
  })

  describe('time limit from the delivery', () => {
    const run = async (startedMinutesAgo: number) => {
      const timed = { ...delivery, timeLimitMinutes: 30 }
      const attempt = {
        id: 'a1',
        userId: 'u1',
        deliveryId: 'd1',
        startedAt: new Date(Date.now() - startedMinutesAgo * 60 * 1000),
        submittedAt: null,
        drawnQuestionIds: ['1.1'],
        answers: { '1.1': 'A' },
        sectionScores: null,
        delivery: timed,
      }
      const { svc, prisma } = make({ attempt })
      const update = jest.fn(async () => ({}))
      ;(prisma.assessmentAttempt as Record<string, unknown>).update = update
      const paper = await svc.getAttempt('u1', 'a1', 'd1')
      const result = await svc.submit('u1', 'a1', undefined, 'd1')
      return { paper, result, update }
    }

    it('reports the deadline as start plus the limit', async () => {
      const { paper } = await run(10)
      expect(paper.deadlineAt!.getTime()).toBeGreaterThan(Date.now() + 19 * 60 * 1000)
      expect(paper.deadlineAt!.getTime()).toBeLessThan(Date.now() + 21 * 60 * 1000)
    })

    it('records an on-time submit as not late', async () => {
      const { update } = await run(10)
      expect(update.mock.calls[0]).toMatchObject([{ data: { submittedLate: false } }])
    })

    it('still grades and stores a submit after the deadline, flagged late', async () => {
      const { result, update } = await run(45)
      expect(result.overall).toMatchObject({ correct: 1, total: 1, percent: 100 })
      expect(update.mock.calls[0]).toMatchObject([{ data: { submittedLate: true } }])
    })

    it('treats a submit within the two minute grace as on time', async () => {
      const { update } = await run(31)
      expect(update.mock.calls[0]).toMatchObject([{ data: { submittedLate: false } }])
    })
  })
})
