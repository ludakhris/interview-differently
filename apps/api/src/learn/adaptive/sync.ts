import type { CheckpointHistoryEntry } from '../../core/monitor-types'
import type { CheckpointData, TaskLog } from './board'

/**
 * A checkpoint's answers, as the LMS keeps them in the item's progress (GitHub issue #90). The learner answers in the
 * Simulator's page; the LMS reads what they did through the simulator feed and keeps, per request, the latest result
 * (the evidence the skill rules use) and a small log (tries, help asked, the last answer) for the board. Pure.
 */
export function checkpointFromHistory(
  history: CheckpointHistoryEntry[],
  itemId: string
): Pick<CheckpointData, 'results' | 'log'> {
  const results = new Map<string, CheckpointData['results'][number]>()
  const log: Record<string, TaskLog> = {}
  const entry = (ref: string) =>
    (log[ref] ??= { tries: 0, helps: 0, lastSql: '', lastReason: null })
  for (const h of [...history].sort((a, b) => a.at.localeCompare(b.at))) {
    if (h.itemId !== itemId) continue
    if (h.kind === 'answer') {
      results.set(h.ref, {
        ref: h.ref,
        correct: h.correct,
        at: h.at,
        ...(h.passed ? { passed: true } : {}),
      })
      const l = entry(h.ref)
      if (!h.passed) {
        l.tries += 1
        l.lastSql = h.sql ?? ''
        l.lastReason = h.correct ? null : h.reason
      }
    } else if (h.kind === 'help') {
      entry(h.ref).helps += 1
    }
  }
  return { results: [...results.values()], log }
}
