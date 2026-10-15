import { checkpointData, learnerPath, needsHelp, type BoardItem } from './board'
import type { SkillResult } from '../skills'

const at = (d: string) => new Date(`2026-10-${d}T10:00:00Z`)
const items: BoardItem[] = [
  {
    id: 'diag',
    moduleTitle: 'Start',
    type: 'tool',
    title: 'Diagnostic',
    config: { toolId: 'id-checkpoint', ref: 'bank', tasks: [{ ref: '1.1', skill: 'join' }] },
  },
  {
    id: 'lesson',
    moduleTitle: 'Joins',
    type: 'lesson',
    title: 'Join lesson',
    config: { teaches: 'join' },
  },
  {
    id: 'extra',
    moduleTitle: 'Joins',
    type: 'lesson',
    title: 'Another way',
    config: { remediationFor: 'join' },
  },
  {
    id: 'sortLesson',
    moduleTitle: 'Sort',
    type: 'lesson',
    title: 'Sort lesson',
    config: { teaches: 'sort' },
  },
]
const labels = new Map([
  ['join', 'Joins'],
  ['sort', 'Sorting'],
])

describe('learnerPath', () => {
  it('places added content right after the item that added it, and marks skips and done', () => {
    const progress = new Map([
      ['diag', { itemId: 'diag', status: 'completed', completedAt: at('01'), data: null }],
    ])
    const plan = [
      {
        itemId: 'extra',
        createdAt: at('02'),
        reason: { skill: 'join', pct: 0, n: 2, sourceItemId: 'diag' },
      },
    ]
    const skips = [
      { itemId: 'sortLesson', createdAt: at('02'), reason: { skill: 'sort', pct: 100, n: 2 } },
    ]
    const path = learnerPath(items, progress, plan, skips, labels)
    expect(path.map((p) => [p.itemId, p.state])).toEqual([
      ['diag', 'done'],
      ['extra', 'added'],
      ['lesson', 'todo'],
      ['sortLesson', 'skipped'],
    ])
    expect(path[1].reason).toBe('Joins: 0% on 2 answers, below the pass mark')
    // Grouped with the diagnostic that added it, not under its own module.
    expect(path[1].moduleTitle).toBe('Start')
    expect(path[3].reason).toBe('Showed Sorting: 100% on 2 answers')
  })

  it('counts added content as done only when finished after it was added', () => {
    const progress = new Map([
      ['extra', { itemId: 'extra', status: 'completed', completedAt: at('01'), data: null }],
    ])
    const plan = [{ itemId: 'extra', createdAt: at('02'), reason: { skill: 'join' } }]
    expect(
      learnerPath(items, progress, plan, [], labels).find((p) => p.itemId === 'extra')?.state
    ).toBe('added')
  })
})

describe('needsHelp', () => {
  it('flags a task tried three times without success, and many help requests', () => {
    const progress = new Map([
      [
        'diag',
        {
          itemId: 'diag',
          status: 'in_progress',
          completedAt: null,
          data: {
            results: [{ ref: '1.1', correct: false }],
            log: { '1.1': { tries: 3, helps: 3, lastSql: 'x', lastReason: null } },
          },
        },
      ],
    ])
    expect(needsHelp(items, progress, [], [])).toEqual([
      '3 tries on request 1.1 in “Diagnostic” without getting it',
      'Asked for help 3 times in “Diagnostic”',
    ])
  })

  it('flags a gap the added content has not closed', () => {
    const progress = new Map([
      ['extra', { itemId: 'extra', status: 'completed', completedAt: at('03'), data: null }],
    ])
    const plan = [{ itemId: 'extra', createdAt: at('02'), reason: { skill: 'join' } }]
    const gap = { skillId: 'join', label: 'Joins', status: 'gap' } as SkillResult
    expect(needsHelp(items, progress, plan, [gap])).toEqual([
      'Still below the pass mark on Joins after finishing the extra content',
    ])
  })
})

describe('checkpointData', () => {
  it('keeps result times and the demo step, and drops malformed entries', () => {
    expect(
      checkpointData({
        results: [{ ref: 'a', correct: true, at: 't' }, { ref: 'b' }],
        log: { a: { tries: 2 } },
        demo: { step: 3 },
      })
    ).toEqual({
      results: [{ ref: 'a', correct: true, at: 't' }],
      log: { a: { tries: 2, helps: 0, lastSql: '', lastReason: null } },
      demo: { step: 3 },
    })
  })
})
