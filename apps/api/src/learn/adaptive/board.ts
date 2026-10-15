import type { BoardPathItem } from '../learn-types'
import {
  CHECKPOINT_TOOL_ID,
  doneSince,
  remediationOf,
  reviewOf,
  teachesOf,
  type SkillResult,
} from '../skills'

/**
 * What the adaptive board shows for one learner, from their rows. Pure, so the rules the instructor reads
 * ("why is this here", "who needs help") are tested on their own.
 */

export interface BoardItem {
  id: string
  moduleTitle: string
  type: string
  title: string
  config: unknown
}
export interface BoardProgress {
  itemId: string
  status: string
  completedAt: Date | null
  data: unknown
}
export interface BoardPlanRow {
  itemId: string
  reason: unknown
  createdAt: Date
}
/** Per-request log a checkpoint keeps in ItemProgress.data (read from the Simulator, see sync.ts). */
export interface TaskLog {
  tries: number
  helps: number
  lastSql: string
  lastReason: string | null
}
export interface CheckpointData {
  /** Latest result per task, with when it was given (recent answers count most). */
  results: { ref: string; correct: boolean; at?: string; passed?: boolean }[]
  log: Record<string, TaskLog>
  intake?: string
  /** Demo personas only: how many scripted steps have run. */
  demo?: unknown
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

export function checkpointData(v: unknown): CheckpointData {
  const o = obj(v)
  const results = Array.isArray(o.results)
    ? o.results.flatMap((r) => {
        const x = obj(r)
        return typeof x.ref === 'string' && typeof x.correct === 'boolean'
          ? [
              {
                ref: x.ref,
                correct: x.correct,
                ...(typeof x.at === 'string' ? { at: x.at } : {}),
                ...(x.passed === true ? { passed: true } : {}),
              },
            ]
          : []
      })
    : []
  const log: Record<string, TaskLog> = {}
  for (const [ref, l] of Object.entries(obj(o.log))) {
    const x = obj(l)
    log[ref] = {
      tries: typeof x.tries === 'number' ? x.tries : 0,
      helps: typeof x.helps === 'number' ? x.helps : 0,
      lastSql: typeof x.lastSql === 'string' ? x.lastSql : '',
      lastReason: typeof x.lastReason === 'string' ? x.lastReason : null,
    }
  }
  return {
    results,
    log,
    ...(typeof o.intake === 'string' ? { intake: o.intake } : {}),
    ...(o.demo !== undefined ? { demo: o.demo } : {}),
  }
}

/** The evidence behind a skip or an addition, and where it came from. */
const evidenceOf = (
  reason: unknown,
  titleOf: (id: string) => string | null
): BoardPathItem['evidence'] => {
  const r = obj(reason)
  const source = typeof r.sourceItemId === 'string' ? titleOf(r.sourceItemId) : null
  return {
    pct: typeof r.pct === 'number' ? r.pct : null,
    n: typeof r.n === 'number' ? r.n : 0,
    source,
  }
}

const why = (reason: unknown, labels: Map<string, string>) => {
  const r = obj(reason)
  const label =
    typeof r.skillLabel === 'string' ? r.skillLabel : (labels.get(String(r.skill)) ?? '')
  return {
    label,
    pct: typeof r.pct === 'number' ? r.pct : null,
    n: typeof r.n === 'number' ? r.n : 0,
  }
}

const isCheckpoint = (item: { type: string; config: unknown }) =>
  item.type === 'tool' && obj(item.config).toolId === CHECKPOINT_TOOL_ID

/** Minutes an item is expected to take (config `minutes`), for time to job-ready. */
export const minutesOf = (item: { type: string; config: unknown }): number => {
  const m = obj(item.config).minutes
  if (typeof m === 'number' && m > 0) return m
  return isCheckpoint(item) ? 20 : 15
}

/**
 * The learner's path in course order: outline items (done, to do, skipped, or sent back to review), with each
 * added item placed straight after the item whose result added it.
 */
export function learnerPath(
  items: BoardItem[],
  progress: Map<string, BoardProgress>,
  plan: BoardPlanRow[],
  skips: BoardPlanRow[],
  labels: Map<string, string>
): BoardPathItem[] {
  const titleOf = (id: string) => items.find((i) => i.id === id)?.title ?? null
  const planBy = new Map(plan.map((p) => [p.itemId, p]))
  const skipBy = new Map(skips.map((k) => [k.itemId, k]))
  const done = (id: string) => progress.get(id)?.status === 'completed'
  const added = (
    p: BoardPlanRow,
    item: BoardItem,
    moduleTitle = item.moduleTitle
  ): BoardPathItem => {
    const w = why(p.reason, labels)
    const skip = skipBy.get(item.id)
    // Help added for a gap the learner has since closed: no longer required, open for review.
    if (skip) {
      const s = why(skip.reason, labels)
      return {
        itemId: item.id,
        moduleTitle,
        title: item.title,
        type: item.type,
        minutes: minutesOf(item),
        skill: remediationOf(item.config) ?? reviewOf(item.config),
        state: 'skipped',
        reason: `Gap closed: showed ${s.label} at ${s.pct ?? 0}%, now optional review`,
        at: skip.createdAt.toISOString(),
        evidence: evidenceOf(skip.reason, titleOf),
      }
    }
    return {
      itemId: item.id,
      moduleTitle,
      title: item.title,
      type: item.type,
      minutes: minutesOf(item),
      skill: remediationOf(item.config) ?? reviewOf(item.config),
      state: doneSince(progress.get(item.id), p.createdAt) ? 'added_done' : 'added',
      reason: `${w.label}: ${w.pct ?? 0}% on ${w.n} answer${w.n === 1 ? '' : 's'}, below the pass mark`,
      at: p.createdAt.toISOString(),
      evidence: evidenceOf(p.reason, titleOf),
    }
  }
  const out: BoardPathItem[] = []
  const placed = new Set<string>()
  // Shown under the item that added it, in that item's module.
  const addedAfter = (sourceId: string, moduleTitle: string) => {
    for (const p of plan) {
      const item = items.find((i) => i.id === p.itemId)
      if (!item || placed.has(item.id) || !remediationOf(item.config)) continue
      if (obj(p.reason).sourceItemId !== sourceId) continue
      placed.add(item.id)
      out.push(added(p, item, moduleTitle))
    }
  }
  for (const item of items) {
    if (remediationOf(item.config)) continue
    const skip = skipBy.get(item.id)
    const review = planBy.get(item.id)
    if (skip) {
      const w = why(skip.reason, labels)
      out.push({
        itemId: item.id,
        moduleTitle: item.moduleTitle,
        title: item.title,
        type: item.type,
        minutes: minutesOf(item),
        skill: teachesOf(item.config),
        state: 'skipped',
        reason: `Showed ${w.label}: ${w.pct ?? 0}% on ${w.n} answer${w.n === 1 ? '' : 's'}`,
        at: skip.createdAt.toISOString(),
        evidence: evidenceOf(skip.reason, titleOf),
      })
    } else if (review && !doneSince(progress.get(item.id), review.createdAt)) {
      out.push({ ...added(review, item), state: 'review' })
    } else {
      out.push({
        itemId: item.id,
        moduleTitle: item.moduleTitle,
        title: item.title,
        type: item.type,
        minutes: minutesOf(item),
        skill: teachesOf(item.config),
        state: done(item.id) ? 'done' : 'todo',
        reason: null,
        at: progress.get(item.id)?.completedAt?.toISOString() ?? null,
        evidence: null,
      })
    }
    addedAfter(item.id, item.moduleTitle)
  }
  // Additions with no recorded trigger go at the end.
  for (const p of plan) {
    const item = items.find((i) => i.id === p.itemId)
    if (item && !placed.has(item.id) && remediationOf(item.config)) {
      placed.add(item.id)
      out.push(added(p, item))
    }
  }
  return out
}

export const STUCK_TRIES = 3
export const MANY_HELPS = 3

/** Signals that a learner may need a person, in plain words. Rules, not the model. */
export function needsHelp(
  items: BoardItem[],
  progress: Map<string, BoardProgress>,
  plan: BoardPlanRow[],
  skills: SkillResult[]
): string[] {
  const out: string[] = []
  for (const item of items) {
    if (!isCheckpoint(item)) continue
    const d = checkpointData(progress.get(item.id)?.data)
    const correct = new Map(d.results.map((r) => [r.ref, r.correct]))
    for (const [ref, l] of Object.entries(d.log)) {
      if (l.tries >= STUCK_TRIES && correct.get(ref) !== true)
        out.push(`${l.tries} tries on request ${ref} in “${item.title}” without getting it`)
    }
    const helps = Object.values(d.log).reduce((n, l) => n + l.helps, 0)
    if (helps >= MANY_HELPS) out.push(`Asked for help ${helps} times in “${item.title}”`)
  }
  // A gap that the added content has not closed.
  for (const s of skills.filter((x) => x.status === 'gap')) {
    const mine = plan.filter((p) => obj(p.reason).skill === s.skillId)
    if (mine.length > 0 && mine.every((p) => doneSince(progress.get(p.itemId), p.createdAt)))
      out.push(`Still below the pass mark on ${s.label} after finishing the extra content`)
  }
  return out
}
