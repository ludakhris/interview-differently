import type { QuantAnswer, QuantBand, QuantFieldResult } from '@id/types'
import { authHeader } from './authToken'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/**
 * A launched text simulation is played through the API: it holds the answer key, grades each
 * answer, remembers the play and decides the score. The player sends answers and shows what comes
 * back; it never grades and never sends a score. (apps/api/src/lti/tool/lti-play.service.ts.)
 */

/** Where the play stands, so a reload can pick it up where it was. */
export interface PlayView {
  /** The node to be on: the next question, or the feedback node once everything is answered. */
  node: string
  done: boolean
  choices: Record<string, string>
  quant: Record<string, QuantAnswer>
  sql: Record<string, { sql: string }>
  hints: string[]
}

export interface PlayStep {
  next: string
  done: boolean
}

/** The answer key for one quant field, sent only after its answer is in. */
export interface QuantReveal {
  acceptedRange: QuantBand
  modelAnswer: number
  derivation?: string
}

export interface QuantGrade extends PlayStep {
  results: QuantFieldResult[]
  reveal: Record<string, QuantReveal>
}

export interface SqlGrade extends PlayStep {
  correct: boolean
  reason?: string
  expected: { columns: string[]; rows: unknown[][]; rowCount: number; command: string }
  referenceSql: string
}

export interface HintText {
  hint: string
  footnote?: string
}

/** What a node needs to ask the server; present only in a launched play. */
export interface PlayGrader {
  choose: (nodeId: string, choiceId: string) => Promise<PlayStep>
  quant: (nodeId: string, answer: QuantAnswer) => Promise<QuantGrade>
  sql: (nodeId: string, sql: string) => Promise<SqlGrade>
  hint: (nodeId: string) => Promise<HintText>
}

/** A refusal from the play API, with the message the learner can read. */
export class PlayError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

/**
 * Told when the server says the play is not where the browser thinks (409): the answer was already
 * recorded (a lost reply, another tab) or the play moved on. The player re-reads the server's
 * position instead of staying on a question the server will not take again.
 */
const conflictListeners = new Set<() => void>()
export function onPlayConflict(listener: () => void): () => void {
  conflictListeners.add(listener)
  return () => conflictListeners.delete(listener)
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}/api/lti/tool/play${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch {
    throw new PlayError(0, 'Could not reach the server. Check your connection and try again.')
  }
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (data as { message?: unknown } | null)?.message
    if (res.status === 409) conflictListeners.forEach((l) => l())
    throw new PlayError(
      res.status,
      typeof message === 'string' ? message : `Request failed (${res.status})`
    )
  }
  return data as T
}

export const fetchPlay = (): Promise<PlayView> => call('GET', '')

export const ltiPlayGrader: PlayGrader = {
  choose: (nodeId, choiceId) => call('POST', '/choice', { nodeId, choiceId }),
  quant: (nodeId, answer) => call('POST', '/quant', { nodeId, answer }),
  sql: (nodeId, sql) => call('POST', '/sql', { nodeId, sql }),
  hint: (nodeId) => call('POST', '/hint', { nodeId }),
}
