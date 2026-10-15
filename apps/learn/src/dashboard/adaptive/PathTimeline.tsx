import type { BoardLearner, BoardPathItem } from '@id/types'
import type { CSSProperties } from 'react'
import type { PathDiff } from './planDiff'
import './path-timeline.css'

type Kind = 'done' | 'todo' | 'proved' | 'notneeded' | 'added' | 'added_done'

/** What a path item is, for drawing: proved and skipped, help no longer needed, added help, done or to do. */
function kindOf(p: BoardPathItem): Kind {
  if (p.state === 'skipped') return p.reason?.startsWith('Gap closed') ? 'notneeded' : 'proved'
  if (p.state === 'added' || p.state === 'review') return 'added'
  if (p.state === 'added_done') return 'added_done'
  return p.state === 'done' ? 'done' : 'todo'
}

const animOf = (anim: PathDiff | undefined, id: string) =>
  anim?.entered.has(id)
    ? ' is-entering'
    : anim?.skipped.has(id)
      ? ' is-skipping'
      : anim?.changed.has(id)
        ? ' is-changed'
        : ''

export const hm = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ''}`.trim() : `${m}m`

/** Help added for a gap: a video made for the learner, practice, or another lesson. */
const addedIcon = (p: BoardPathItem) =>
  p.type === 'spark_lesson' ? '🎬' : p.title.startsWith('Targeted practice') ? '🎯' : '💡'
const kindLabel = (p: BoardPathItem) => {
  const k = kindName(p)
  return k.charAt(0).toUpperCase() + k.slice(1)
}

/** A short name for a piece of content: what kind of thing it is. */
function kindName(p: BoardPathItem): string {
  if (p.type === 'spark_lesson') return 'video'
  if (p.title.startsWith('Targeted practice')) return 'practice'
  if (p.title.startsWith('Another way')) return 'explainer'
  if (p.type === 'tool') return 'checkpoint'
  return 'lesson'
}

export const PX_PER_MINUTE = 1.6
export const MIN_STOP_PX = 26

/**
 * A learner's path as a vertical timeline whose length is the time it takes, at the same scale for every learner:
 * a shorter path looks shorter. What was skipped folds into one marker beside the line (hover it for what the
 * evidence showed); help added for a gap branches in green with the job goal it is for.
 */
export function PathTimeline({
  learner: l,
  anim,
  color,
  goals,
}: {
  learner: Pick<BoardLearner, 'path' | 'ready' | 'minutesLeft'>
  anim: PathDiff | undefined
  color: string
  /** Job goal names by skill id. */
  goals: Record<string, string>
}) {
  const groups: { skipped: BoardPathItem[]; item?: BoardPathItem }[] = []
  let pending: BoardPathItem[] = []
  for (const p of l.path) {
    // Help added for a gap and then no longer needed was never part of the course: it is left off the path.
    if (kindOf(p) === 'notneeded') continue
    if (p.state === 'skipped') pending.push(p)
    else {
      groups.push({ skipped: pending, item: p })
      pending = []
    }
  }
  if (pending.length) groups.push({ skipped: pending })
  return (
    <ol
      className="pt"
      style={{ '--lane': color } as CSSProperties}
      aria-label="Path, scaled by time"
    >
      {groups.map((g, i) => (
        <li key={g.item?.itemId ?? `skip-${i}`}>
          {g.skipped.length > 0 && <Fold skipped={g.skipped} goals={goals} anim={anim} />}
          {g.item && <Stop item={g.item} goals={goals} anim={anim} />}
        </li>
      ))}
      <li className="pt-end">
        <span className={`pt-ready${l.ready ? ' is-ready' : ''}`}>
          {l.ready ? '✓ Job ready' : `Job ready in about ${hm(l.minutesLeft)}`}
        </span>
      </li>
    </ol>
  )
}

function Stop({
  item: p,
  goals,
  anim,
}: {
  item: BoardPathItem
  goals: Record<string, string>
  anim: PathDiff | undefined
}) {
  const k = kindOf(p)
  const added = k === 'added' || k === 'added_done'
  return (
    <span
      className={`pt-seg is-${k}${animOf(anim, p.itemId)}`}
      style={{ minHeight: `${Math.max(MIN_STOP_PX, p.minutes * PX_PER_MINUTE)}px` }}
    >
      <span className="pt-node" aria-hidden="true">
        {k === 'done' || k === 'added_done' ? '✓' : added ? '+' : ''}
      </span>
      {added ? (
        <span className="pt-title">
          <span className="pt-added-name">
            {addedIcon(p)} {p.title} <span className="pt-added-pill">Added</span>
          </span>
          <em>
            {kindLabel(p)} · {p.minutes} min
          </em>
          {p.skill && (
            <span className="pt-added-why">
              Gap: {goals[p.skill] ?? p.skill}
              {p.evidence?.pct !== null && p.evidence?.pct !== undefined
                ? ` was at ${p.evidence.pct}%`
                : ''}
            </span>
          )}
        </span>
      ) : (
        <span className="pt-title">
          {p.title}
          <em>{p.minutes} min</em>
        </span>
      )}
    </span>
  )
}

/** The skipped items between two stops, and on hover or focus, why: what the evidence showed, per job goal. */
function Fold({
  skipped,
  goals,
  anim,
}: {
  skipped: BoardPathItem[]
  goals: Record<string, string>
  anim: PathDiff | undefined
}) {
  const saved = skipped.reduce((n, p) => n + p.minutes, 0)
  const bySkill = new Map<string, BoardPathItem[]>()
  for (const p of skipped) {
    const key = p.skill ?? ''
    bySkill.set(key, [...(bySkill.get(key) ?? []), p])
  }
  const fresh = skipped.some((p) => animOf(anim, p.itemId))
  return (
    <span className={`pt-fold${fresh ? ' is-entering' : ''}`} tabIndex={0}>
      ⤳ {skipped.length} skipped · {hm(saved)} saved
      <span className="pt-pop" role="tooltip">
        {[...bySkill.entries()].map(([skill, items]) => {
          const ev = items[0].evidence
          const where = ev?.source?.startsWith('Diagnostic') ? 'the diagnostic' : ev?.source
          return (
            <span key={skill} className="pt-why">
              <strong>✓ {goals[skill] ?? 'Shown'}</strong>
              <small>
                {ev?.pct ?? 0}% on {ev?.n ?? 0} answers{where ? ` in ${where}` : ''} ·{' '}
                {items.map(kindName).join(', ')} skipped
              </small>
            </span>
          )
        })}
      </span>
    </span>
  )
}
