import { useAuth } from '@clerk/clerk-react'
import { useCallback, useEffect, useState } from 'react'

const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

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
    async (path: string): Promise<Response> => {
      const token = await getToken()
      const res = await fetch(`${API_URL}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`)
      return res
    },
    [getToken]
  )
}

export interface Loaded<T> {
  data: T | null
  error: ApiError | Error | null
  loading: boolean
}

export function useLoad<T>(path: string): Loaded<T> {
  const apiFetch = useApiFetch()
  const [state, setState] = useState<Loaded<T>>({ data: null, error: null, loading: true })
  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    apiFetch(path)
      .then((r) => r.json() as Promise<T>)
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((error: Error) => !cancelled && setState({ data: null, error, loading: false }))
    return () => {
      cancelled = true
    }
  }, [apiFetch, path])
  return state
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
