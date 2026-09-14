import type { AssessmentQuestion, AssessmentSection, DrawSpec } from './assessment.types'

/**
 * Draw spec helpers — see docs/assessment-format.md.
 *
 *   draw: 4                → 4 questions of any type
 *   draw: { mc: 3, sql: 1 } → exactly 3 MC + 1 SQL (types not listed → 0)
 *   draw: null             → every question
 *
 * Per-type specs are keyed by AssessmentQuestion.type, so a new question
 * type works here without changes.
 */

/** "4" or "mc 3, sql 1" (also "mc: 3, sql: 1") → DrawSpec; null when malformed. */
export function parseDrawSpec(text: string): DrawSpec | null {
  const t = text.trim()
  if (/^\d+$/.test(t)) return Number(t)
  const spec: Record<string, number> = {}
  for (const part of t.split(',')) {
    const m = /^([a-z][\w-]*)\s*:?\s*(\d+)$/i.exec(part.trim())
    if (!m) return null
    spec[m[1].toLowerCase()] = Number(m[2])
  }
  return Object.keys(spec).length ? spec : null
}

/** Frontmatter value (YAML number or map) → DrawSpec; null when malformed. */
export function drawSpecFromYaml(value: unknown): DrawSpec | null {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : null
  if (typeof value === 'string') return parseDrawSpec(value)
  if (value && typeof value === 'object') {
    const spec: Record<string, number> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!(typeof v === 'number' && Number.isInteger(v) && v >= 0)) return null
      spec[k.toLowerCase()] = v
    }
    return Object.keys(spec).length ? spec : null
  }
  return null
}

/** How many questions a section actually yields. */
export function drawCount(s: AssessmentSection): number {
  if (s.draw == null) return s.questions.length
  if (typeof s.draw === 'number') return Math.min(s.draw, s.questions.length)
  return Object.entries(s.draw).reduce((n, [type, want]) => n + Math.min(want, countType(s, type)), 0)
}

/** Random paper for a section — per-type pools when the spec is a map, then shuffled together. */
export function drawSection(s: AssessmentSection): AssessmentQuestion[] {
  if (s.draw == null || typeof s.draw === 'number') return shuffle(s.questions, s.draw)
  const picked = Object.entries(s.draw).flatMap(([type, n]) => shuffle(s.questions.filter((q) => q.type === type), n))
  return shuffle(picked, null)
}

export function formatDrawSpec(spec: DrawSpec | null): string {
  if (spec == null) return 'all'
  if (typeof spec === 'number') return String(spec)
  return Object.entries(spec).map(([t, n]) => `${t} ${n}`).join(', ')
}

function countType(s: AssessmentSection, type: string): number {
  return s.questions.filter((q) => q.type === type).length
}

/** Random subset of `n` items (all when n is null or ≥ length), in random order. */
function shuffle<T>(items: T[], n: number | null): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return n === null ? arr : arr.slice(0, n)
}
