import { useEffect, useState } from 'react'

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

/** Loads a public API route (no sign-in). */
export function usePublic<T>(path: string | null): {
  data: T | null
  error: Error | null
  loading: boolean
} {
  const [state, setState] = useState<{ data: T | null; error: Error | null; loading: boolean }>({
    data: null,
    error: null,
    loading: path !== null,
  })
  useEffect(() => {
    if (path === null) return
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    fetch(`${API_URL}${path}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`)
        return r.json() as Promise<T>
      })
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((error: Error) => !cancelled && setState({ data: null, error, loading: false }))
    return () => {
      cancelled = true
    }
  }, [path])
  return state
}
