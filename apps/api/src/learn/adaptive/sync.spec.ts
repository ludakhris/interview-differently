import type { CheckpointHistoryEntry } from '../../core/monitor-types'
import { checkpointFromHistory } from './sync'

const answer = (
  ref: string,
  at: string,
  correct: boolean,
  extra: Partial<Extract<CheckpointHistoryEntry, { kind: 'answer' }>> = {}
): CheckpointHistoryEntry => ({
  kind: 'answer',
  at: `2026-10-18T10:${at}:00Z`,
  itemId: 'diag',
  ref,
  prompt: 'p',
  from: null,
  sql: 'SELECT 1',
  correct,
  passed: false,
  reason: correct ? null : 'expected 4 row(s), got 79',
  ...extra,
})

describe('checkpointFromHistory', () => {
  it('keeps the latest result per request, with its time', () => {
    const out = checkpointFromHistory(
      [answer('1.1', '02', true), answer('1.1', '01', false), answer('2.1', '03', false)],
      'diag'
    )
    expect(out.results).toEqual([
      { ref: '1.1', correct: true, at: '2026-10-18T10:02:00Z' },
      { ref: '2.1', correct: false, at: '2026-10-18T10:03:00Z' },
    ])
    expect(out.log['1.1']).toEqual({ tries: 2, helps: 0, lastSql: 'SELECT 1', lastReason: null })
    expect(out.log['2.1'].lastReason).toBe('expected 4 row(s), got 79')
  })

  it('marks a pass, which is no try, and counts help', () => {
    const out = checkpointFromHistory(
      [
        answer('3.1', '01', false, { passed: true, sql: null }),
        {
          kind: 'help',
          at: '2026-10-18T10:00:30Z',
          itemId: 'diag',
          ref: '3.1',
          helpKind: 'hint',
          text: 'Try GROUP BY',
          exampleSql: null,
        },
      ],
      'diag'
    )
    expect(out.results).toEqual([
      { ref: '3.1', correct: false, at: '2026-10-18T10:01:00Z', passed: true },
    ])
    expect(out.log['3.1']).toEqual({ tries: 0, helps: 1, lastSql: '', lastReason: null })
  })

  it('ignores other items', () => {
    expect(checkpointFromHistory([answer('1.1', '01', true)], 'other')).toEqual({
      results: [],
      log: {},
    })
  })
})
