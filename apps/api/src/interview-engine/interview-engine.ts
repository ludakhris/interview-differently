import { BadGatewayException } from '@nestjs/common'
import type { RubricDimensionInput } from '../config/prompts.config'

export const MAX_ANSWER_CHARS = 2000

/** Used when a scenario carries no rubric, so every interview is still scored on something. */
export const DEFAULT_RUBRIC: RubricDimensionInput[] = [
  { name: 'Relevance', description: 'Does the answer address the question that was asked?' },
  {
    name: 'Specific Example',
    description: 'Does it give a concrete example or action rather than generalities?',
  },
  { name: 'Clear Communication', description: 'Is it organized and easy to follow?' },
  {
    name: 'Professionalism',
    description: 'Is it professional, including safety and honesty where they matter?',
  },
]

export interface DimensionResult {
  dimension: string
  score: number
}

export interface ScoredAnswer {
  /** Mean of the dimension scores. */
  score: number
  dimensions: DimensionResult[]
  feedback: string
  strengths: string
  development: string
}

const FAILED = 'Could not score your answers right now. Try again.'

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)))

/** The reply is shown as plain text, so drop any markdown emphasis marks. */
const plain = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/[*_`]/g, '').trim().slice(0, max) : ''

/** Parses the model's reply into clamped dimension scores and short text per question. */
export function parseAnswerScores(
  text: string,
  count: number,
  rubric: RubricDimensionInput[]
): ScoredAnswer[] {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new BadGatewayException(FAILED)
  }
  const list = (parsed as { answers?: unknown } | null)?.answers
  if (!Array.isArray(list) || list.length !== count) throw new BadGatewayException(FAILED)
  return list.map((a) => {
    const item = (a ?? {}) as Record<string, unknown>
    const given = Array.isArray(item.dimensions) ? (item.dimensions as unknown[]) : []
    const byName = new Map<string, number>()
    for (const d of given) {
      const row = (d ?? {}) as { dimension?: unknown; score?: unknown }
      if (typeof row.dimension === 'string' && typeof row.score === 'number') {
        if (Number.isFinite(row.score)) byName.set(row.dimension, clamp(row.score))
      }
    }
    const dimensions = rubric.map((r) => {
      const score = byName.get(r.name)
      if (score === undefined) throw new BadGatewayException(FAILED)
      return { dimension: r.name, score }
    })
    return {
      score: averageScore(dimensions),
      dimensions,
      feedback: plain(item.feedback, 500),
      strengths: plain(item.strengths, 300),
      development: plain(item.development, 300),
    }
  })
}

export const averageScore = (results: { score: number }[]): number =>
  results.length === 0 ? 0 : Math.round(results.reduce((n, r) => n + r.score, 0) / results.length)
