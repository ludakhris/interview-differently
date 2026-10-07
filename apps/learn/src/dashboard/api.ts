import { useAuth } from '@clerk/clerk-react'
import { useCallback, useEffect, useState } from 'react'

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

/** Authenticated fetch against the shared API, using the LearnDifferently Clerk session. */
export function useApiFetch() {
  const { getToken } = useAuth()
  return useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const token = await getToken()
      const res = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (!res.ok) {
        // Nest sends { message } (or a list of messages) with the status.
        let message = `Request failed (${res.status})`
        try {
          const body = (await res.json()) as { message?: string | string[] }
          if (body.message)
            message = Array.isArray(body.message) ? body.message.join(' ') : body.message
        } catch {
          /* keep the generic message */
        }
        throw new ApiError(res.status, message)
      }
      return res
    },
    [getToken]
  )
}

/** Send JSON (POST/PUT/DELETE) and get the JSON reply back, if there is one. */
export function useApiSend() {
  const apiFetch = useApiFetch()
  return useCallback(
    async <T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> => {
      const res = await apiFetch(path, {
        method,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return (res.status === 204 ? undefined : await res.json()) as T
    },
    [apiFetch]
  )
}

export interface Loaded<T> {
  data: T | null
  error: ApiError | Error | null
  loading: boolean
  /** Fetch again, keeping what is on screen until the new data arrives. */
  reload: () => void
}

/** `path` null loads nothing (for data only some views need). */
export function useLoad<T>(path: string | null): Loaded<T> {
  const apiFetch = useApiFetch()
  const [state, setState] = useState<Omit<Loaded<T>, 'reload'>>({
    data: null,
    error: null,
    loading: path !== null,
  })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (path === null) return
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    apiFetch(path)
      .then((r) => r.json() as Promise<T>)
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((error: Error) => !cancelled && setState({ data: null, error, loading: false }))
    return () => {
      cancelled = true
    }
  }, [apiFetch, path, tick])
  return { ...state, reload: () => setTick((n) => n + 1) }
}

/** Fetches a file with the session token (a plain link can't send it) and saves it. */
export async function downloadFile(
  apiFetch: (path: string) => Promise<Response>,
  path: string,
  filename: string
) {
  const blob = await (await apiFetch(path)).blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
