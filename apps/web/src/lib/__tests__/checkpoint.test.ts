// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { CheckpointAnswerState, CheckpointTask, CheckpointView } from '@id/types'
import {
  BACKUP_COLLEAGUES,
  backupColleague,
  cellText,
  firstName,
  firstOpenRef,
  initials,
  isFramed,
  isSettled,
  missReason,
  missReply,
  openingLine,
  parentOrigin,
  postToParent,
  practiceGate,
  progress,
  replyKind,
  runSummary,
  shapeLabel,
  shownTasks,
  visibleMarks,
} from '../checkpoint'

const task = (ref: string, from: string | null = 'Priya, Marketing'): CheckpointTask => ({
  ref,
  prompt: `Request ${ref}`,
  from,
  starterSql: null,
  expected: { columns: ['region', 'total'], rowCount: 4 },
})

const answer = (over: Partial<CheckpointAnswerState> = {}): CheckpointAnswerState => ({
  correct: false,
  passed: false,
  sql: 'SELECT 1',
  preview: null,
  reason: null,
  error: null,
  tries: 1,
  helps: 0,
  ...over,
})

const view = (over: Partial<CheckpointView> = {}): CheckpointView => ({
  deliveryId: 'd1',
  title: 'Your first morning',
  scenario: 'Your first morning on the data team',
  diagnostic: true,
  oneAnswer: true,
  schema: [],
  tasks: [task('a'), task('b'), task('c')],
  answers: {},
  practice: null,
  done: false,
  scorePct: null,
  ...over,
})

describe('isSettled', () => {
  it('counts a graded answer (right or wrong) and a pass, not help alone', () => {
    expect(isSettled(undefined)).toBe(false)
    expect(isSettled(answer({ correct: true }))).toBe(true)
    expect(isSettled(answer())).toBe(true)
    expect(isSettled(answer({ passed: true, sql: null, tries: 0 }))).toBe(true)
    expect(isSettled(answer({ tries: 0, helps: 2, sql: null }))).toBe(false)
  })
})

describe('the current request', () => {
  it('is the first one without an answer or a pass', () => {
    expect(firstOpenRef(view())).toBe('a')
    expect(firstOpenRef(view({ answers: { a: answer({ correct: true }) } }))).toBe('b')
    expect(firstOpenRef(view({ answers: { a: answer(), b: answer({ passed: true }) } }))).toBe('c')
  })

  it('stays on a request the learner only asked help for', () => {
    expect(firstOpenRef(view({ answers: { a: answer({ tries: 0, helps: 1 }) } }))).toBe('a')
  })

  it('is none once everything is settled, or the server says done', () => {
    const all = { a: answer(), b: answer(), c: answer({ correct: true }) }
    expect(firstOpenRef(view({ answers: all }))).toBeNull()
    expect(firstOpenRef(view({ done: true }))).toBeNull()
  })

  it('shows settled requests and the active one, never the ones still to come', () => {
    const v = view({ answers: { a: answer({ correct: true }) } })
    expect(shownTasks(v, 'b').map((t) => t.ref)).toEqual(['a', 'b'])
    expect(shownTasks(v, null).map((t) => t.ref)).toEqual(['a'])
  })
})

describe('progress', () => {
  it('counts answered and right', () => {
    const v = view({
      answers: {
        a: answer({ correct: true }),
        b: answer({ passed: true }),
        c: answer({ tries: 0 }),
      },
    })
    expect(progress(v)).toEqual({ answered: 2, right: 1, total: 3 })
  })
})

describe('replies and labels', () => {
  it('names the kind of reply', () => {
    expect(replyKind(answer({ correct: true }))).toBe('right')
    expect(replyKind(answer({ passed: true }))).toBe('passed')
    expect(replyKind(answer())).toBe('missed')
  })

  it('reads names', () => {
    expect(initials('Priya, Marketing')).toBe('PM')
    expect(initials('sam')).toBe('S')
    expect(firstName('Priya, Marketing')).toBe('Priya')
    expect(firstName(null)).toBe('them')
    expect(firstName(null, 'They')).toBe('They')
  })

  it('describes the expected shape', () => {
    expect(shapeLabel({ columns: ['region', 'total'], rowCount: 4 })).toBe(
      '4 rows · columns region, total'
    )
    expect(shapeLabel({ columns: ['n'], rowCount: 1 })).toBe('1 row · column n')
  })

  it('explains a miss', () => {
    expect(missReason({ error: 'syntax error', reason: null })).toBe('It did not run: syntax error')
    expect(missReason({ error: null, reason: 'Two rows are missing' })).toBe('Two rows are missing')
    expect(missReason({ error: null, reason: null })).toBe('The rows do not match')
  })
})

describe('practice slots', () => {
  const practice = (status: 'writing' | 'pending' | 'ready' | 'rejected') =>
    view({ practice: { status, skill: 'GROUP BY', intro: 'Some practice on grouping' } })

  it('hold the chat back until the practice is ready', () => {
    expect(practiceGate(view())).toBeNull()
    expect(practiceGate(practice('writing'))).toBe('writing')
    expect(practiceGate(practice('pending'))).toBe('pending')
    expect(practiceGate(practice('rejected'))).toBe('rejected')
    expect(practiceGate(practice('ready'))).toBeNull()
  })

  it('open with their own intro, else the scenario', () => {
    expect(openingLine(practice('ready'))).toBe('Some practice on grouping')
    expect(openingLine(view())).toBe('Your first morning on the data team')
    expect(openingLine(view({ scenario: null }))).toBeNull()
  })
})

describe('messages to the LMS page', () => {
  const framedWindow = () => {
    const parent = { postMessage: vi.fn() }
    return { win: { parent } as unknown as Window, parent }
  }

  it('are posted only inside a frame', () => {
    const { win, parent } = framedWindow()
    expect(isFramed(win)).toBe(true)
    expect(postToParent({ subject: 'id.checkpoint.answered', ref: 'a', done: false }, win)).toBe(
      true
    )
    expect(parent.postMessage).toHaveBeenCalledWith(
      { subject: 'id.checkpoint.answered', ref: 'a', done: false },
      '*'
    )
  })

  it('go to the parent page origin when the browser names it', () => {
    const parent = { postMessage: vi.fn() }
    const win = {
      parent,
      location: { ancestorOrigins: ['https://learn.example.test'] },
    } as unknown as Window
    expect(parentOrigin(win)).toBe('https://learn.example.test')
    postToParent({ subject: 'id.checkpoint.resize', height: 600 }, win)
    expect(parent.postMessage).toHaveBeenCalledWith(
      { subject: 'id.checkpoint.resize', height: 600 },
      'https://learn.example.test'
    )
  })

  it('fall back to any origin when the parent is unknown (the referrer is the API, not the LMS page)', () => {
    const at = (ancestorOrigins: string[] | undefined) =>
      ({
        location: { ancestorOrigins },
        document: { referrer: 'https://api.example.test/lti/platform/auth' },
      }) as unknown as Window
    expect(parentOrigin(at(undefined))).toBe('*')
    expect(parentOrigin(at([]))).toBe('*')
    expect(parentOrigin(at(['null']))).toBe('*')
    expect(parentOrigin({} as Window)).toBe('*')
  })

  it('are not posted when the page is opened on its own', () => {
    const top = { postMessage: vi.fn() } as unknown as Window & { parent: Window }
    top.parent = top
    expect(isFramed(top)).toBe(false)
    expect(postToParent({ subject: 'id.checkpoint.resize', height: 600 }, top)).toBe(false)
    expect(top.postMessage).not.toHaveBeenCalled()
  })
})

describe('run summaries', () => {
  const run = (rowCount: number, shown: number, rowHits: boolean[] | null, correct = false) => ({
    preview: { columns: ['n'], rows: Array.from({ length: shown }, (_, i) => [i]), rowCount },
    error: null,
    check: rowHits
      ? { correct, reason: null, rowHits, expected: { columns: ['n'], rowCount: 4 } }
      : null,
  })

  it('count marks over the rows on screen only', () => {
    const hits = Array.from({ length: 79 }, (_, i) => i < 3 || i > 20)
    expect(visibleMarks(run(79, 8, hits))).toHaveLength(8)
    expect(visibleMarks(run(2, 2, [true, false, true]))).toEqual([true, false])
    expect(visibleMarks(run(4, 4, null))).toBeUndefined()
    expect(runSummary(run(79, 8, hits))).toBe('79 rows, 3 of the first 8 right')
    expect(runSummary(run(4, 4, [true, true, true, false]))).toBe('4 rows, 3 right')
  })

  it('say when it matches, did not run, or was not checked (a diagnostic)', () => {
    expect(runSummary(run(4, 4, [true, true, true, true], true))).toBe('4 rows, matches')
    expect(runSummary({ preview: null, error: 'no such table', check: null })).toBe(
      'It did not run: no such table'
    )
    expect(runSummary(run(1, 1, null))).toBe('1 row')
  })
})

describe('after a miss', () => {
  it('names a colleague who already had the data: the same one each time for a request', () => {
    expect(missReply('a', 'Priya, Marketing')).toBe(
      "That didn't look right, but we got the data from Maya, who already had it. Thanks anyway!"
    )
    expect(backupColleague('a', 'Priya')).toBe(backupColleague('a', 'Priya'))
    const names = new Set(['1.1', '1.2', '2.1', '2.2', '3.1'].map((r) => backupColleague(r, null)))
    expect(names.size).toBeGreaterThan(1)
    for (const n of names) expect(BACKUP_COLLEAGUES).toContain(n)
  })

  it('never names the colleague who asked', () => {
    expect(backupColleague('a', null)).toBe('Maya')
    expect(backupColleague('a', 'Maya Ortiz, Finance')).not.toBe('Maya')
    for (const from of BACKUP_COLLEAGUES)
      expect(backupColleague('2.1', `${from}, Sales`)).not.toBe(from)
  })
})

describe('cellText', () => {
  it('shows nulls and values as the grid does', () => {
    expect(cellText(null)).toBe('null')
    expect(cellText(4)).toBe('4')
    expect(cellText({ a: 1 })).toBe('{"a":1}')
  })
})
