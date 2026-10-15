import type { LessonEventKind } from '../core/lesson-types'

/** How a learner watched a lesson, from its events. Pure, so it is tested without a database. */

const KINDS: readonly LessonEventKind[] = ['start', 'scene', 'replay', 'finish']
const VOICES = { server: 'Mac voice', browser: 'browser voice' } as const

export interface StoredEvent {
  event: string
  data: unknown
}

/** The player's event, checked against the lesson's scene count; null when it is not one the player sends. */
export function parseEventInput(
  body: unknown,
  sceneCount: number
): { event: LessonEventKind; data: { scene?: number; voice?: 'server' | 'browser' } } | null {
  const o = (body ?? {}) as Record<string, unknown>
  if (!KINDS.includes(o.event as LessonEventKind)) return null
  const data: { scene?: number; voice?: 'server' | 'browser' } = {}
  if (o.scene !== undefined && o.scene !== null) {
    if (!Number.isInteger(o.scene) || (o.scene as number) < 0 || (o.scene as number) >= sceneCount)
      return null
    data.scene = o.scene as number
  }
  if (o.voice !== undefined && o.voice !== null) {
    if (o.voice !== 'server' && o.voice !== 'browser') return null
    data.voice = o.voice
  }
  return { event: o.event as LessonEventKind, data }
}

const dataOf = (e: StoredEvent): { scene?: unknown; voice?: unknown } =>
  e.data && typeof e.data === 'object' ? (e.data as { scene?: unknown; voice?: unknown }) : {}

/** For example "all 6 scenes · Mac voice" or "3 of 6 scenes · browser voice · replayed"; null when never opened. */
export function watchedSummary(events: StoredEvent[], sceneCount: number): string | null {
  if (events.length === 0) return null
  const seen = new Set<number>()
  let voice: string | undefined
  let replays = 0
  for (const e of events) {
    const d = dataOf(e)
    if (e.event === 'scene' && Number.isInteger(d.scene)) seen.add(d.scene as number)
    if (e.event === 'replay') replays++
    if (d.voice === 'server' || d.voice === 'browser') voice = VOICES[d.voice]
  }
  const parts = [
    seen.size === 0
      ? 'opened, no scenes played'
      : seen.size >= sceneCount
        ? `all ${sceneCount} scenes`
        : `${seen.size} of ${sceneCount} scenes`,
  ]
  if (voice) parts.push(voice)
  if (replays > 0) parts.push(replays === 1 ? 'replayed' : `replayed ${replays} times`)
  return parts.join(' · ')
}

/** The events `hasFinished` reads. */
export const FINISH_EVENTS = ['scene', 'finish'] as const

/**
 * Watched to the end: every scene was reached (the player records each scene it plays, so skipping ahead leaves a
 * gap) and the player reported the finish. A finish event alone is not enough.
 */
export function hasFinished(events: StoredEvent[], sceneCount: number): boolean {
  if (!events.some((e) => e.event === 'finish')) return false
  const seen = new Set<number>()
  for (const e of events) {
    const scene = dataOf(e).scene
    if (e.event === 'scene' && Number.isInteger(scene)) seen.add(scene as number)
  }
  for (let i = 0; i < sceneCount; i++) if (!seen.has(i)) return false
  return true
}
