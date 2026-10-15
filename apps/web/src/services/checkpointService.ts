import type {
  CheckpointAnswerInput,
  CheckpointAnswerResult,
  CheckpointHelp,
  CheckpointHelpKind,
  CheckpointRun,
  CheckpointSimulation,
  CheckpointStart,
  CheckpointView,
} from '@id/types'
import { authHeader } from './authToken'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/**
 * The chat checkpoint (GitHub issue #90), launched from the LMS by LTI or opened as a work simulation in standalone
 * Interview Differently. The API holds the answer keys, runs every query, grades and keeps the evidence; this page
 * only sends what the learner wrote and shows what comes back. One client for both: only the address and the
 * credential differ (the LTI session token, or the learner's Clerk token).
 */

/** A refusal from the checkpoint API, with a message the learner can read. */
export class CheckpointError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

/** The session is missing, expired or replaced: nothing on this page can work until it is opened again. */
export const isSessionEnded = (e: unknown): boolean =>
  e instanceof CheckpointError && (e.status === 401 || e.status === 403 || e.status === 410)

/** Grading (the SQL runner or the coach) is down for a moment: the same request may work on retry. */
export const isUnavailable = (e: unknown): boolean =>
  e instanceof CheckpointError && e.status === 503

type Auth = () => Promise<Record<string, string>>

async function call<T>(
  auth: Auth,
  method: 'GET' | 'POST',
  url: string,
  body?: unknown
): Promise<T> {
  const headers = { 'Content-Type': 'application/json', ...(await auth()) }
  let res: Response
  try {
    res = await fetch(`${API_URL}/api${url}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch {
    throw new CheckpointError(0, 'Could not reach the server. Check your connection and try again.')
  }
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (data as { message?: unknown } | null)?.message
    throw new CheckpointError(
      res.status,
      typeof message === 'string' ? message : `Request failed (${res.status})`
    )
  }
  return data as T
}

/** What the checkpoint page can ask of the API, whichever way it was opened. */
export interface CheckpointClient {
  view(): Promise<CheckpointView>
  run(sql: string, ref?: string): Promise<CheckpointRun>
  answer(input: CheckpointAnswerInput): Promise<CheckpointAnswerResult>
  help(ref: string, sql: string, kind: CheckpointHelpKind): Promise<CheckpointHelp>
  /** Writes (or reuses) the practice for a practice slot. Slow: it can take half a minute. */
  practice(): Promise<CheckpointView>
}

function checkpointClient(base: string, auth: Auth): CheckpointClient {
  return {
    view: () => call(auth, 'GET', base),
    run: (sql, ref) => call(auth, 'POST', `${base}/run`, ref ? { ref, sql } : { sql }),
    answer: (input) => call(auth, 'POST', `${base}/answer`, input),
    help: (ref, sql, kind) => call(auth, 'POST', `${base}/help`, { ref, sql, kind }),
    practice: () => call(auth, 'POST', `${base}/practice`),
  }
}

/** The checkpoint of this tab's LTI session: the session (not the URL) names the checkpoint and the learner. */
export const ltiCheckpointClient: CheckpointClient = checkpointClient(
  '/lti/tool/checkpoint',
  authHeader
)

export type GetToken = () => Promise<string | null>

/** A signed-in learner's Clerk token; none means they are signed out, which ends the page like a lost session. */
const clerkAuth =
  (getToken: GetToken): Auth =>
  async () => {
    const token = await getToken().catch(() => null)
    if (!token) throw new CheckpointError(401, 'You are signed out. Sign in and open it again.')
    return { Authorization: `Bearer ${token}` }
  }

/** A work simulation in standalone Interview Differently, for the signed-in learner. */
export const standaloneCheckpointClient = (
  deliveryId: string,
  getToken: GetToken
): CheckpointClient =>
  checkpointClient(`/me/checkpoints/${encodeURIComponent(deliveryId)}`, clerkAuth(getToken))

/** The work simulations the signed-in learner can open. */
export const fetchSimulations = (getToken: GetToken): Promise<CheckpointSimulation[]> =>
  call(clerkAuth(getToken), 'GET', '/me/checkpoints')

/** Opens a bank's work simulation (made on first use); its chat is at `/simulations/:deliveryId`. */
export const startSimulation = (getToken: GetToken, bankSlug: string): Promise<CheckpointStart> =>
  call(clerkAuth(getToken), 'POST', '/me/checkpoints', { bankSlug })
