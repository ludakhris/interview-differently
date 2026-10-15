import type { LessonEventInput, LessonPlayerView } from '@id/types'

/** Spark's player API on the shared API server: everything is authorised by the signed lesson link. */

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

const auth = (token: string) => ({ Authorization: `Bearer spark.${token}` })

async function failure(res: Response): Promise<ApiError> {
  let message = 'Something went wrong loading this lesson.'
  try {
    const body = (await res.json()) as { message?: unknown }
    if (typeof body.message === 'string') message = body.message
  } catch {
    // keep the default
  }
  return new ApiError(message, res.status)
}

export async function loadLesson(token: string): Promise<LessonPlayerView> {
  const res = await fetch(`${BASE}/spark/lesson`, { headers: auth(token) })
  if (!res.ok) throw await failure(res)
  return (await res.json()) as LessonPlayerView
}

/** An object URL for the server's recording of one scene. */
export async function sceneAudio(token: string, scene: number): Promise<string> {
  const res = await fetch(`${BASE}/spark/lesson/audio/${scene}`, { headers: auth(token) })
  if (!res.ok) throw await failure(res)
  return URL.createObjectURL(await res.blob())
}

/** Stores one event; rejects when the server did not store it. */
export async function postEvent(token: string, input: LessonEventInput): Promise<void> {
  const res = await fetch(`${BASE}/spark/lesson/event`, {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    keepalive: true,
  })
  if (!res.ok) throw await failure(res)
}

/** Stores one event, trying a second time when the first try fails. */
export const postEventWithRetry = (token: string, input: LessonEventInput): Promise<void> =>
  postEvent(token, input).catch(() => postEvent(token, input))
