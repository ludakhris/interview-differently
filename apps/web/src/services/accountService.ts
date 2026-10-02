/** Frontend client for self-service data export and account deletion. */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

type GetToken = () => Promise<string | null>

async function authed(getToken: GetToken, path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken()
  if (!token) throw new Error('Not signed in')
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = (await res.json()) as { message?: string | string[] }
      if (body.message)
        message = Array.isArray(body.message) ? body.message.join(', ') : body.message
    } catch {
      /* keep default */
    }
    throw new Error(message)
  }
  return res
}

/** Downloads everything we hold about the caller as a JSON file. */
export async function downloadMyData(getToken: GetToken): Promise<void> {
  const res = await authed(getToken, '/me/export')
  const blob = new Blob([JSON.stringify(await res.json(), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'interview-differently-my-data.json'
  a.click()
  URL.revokeObjectURL(url)
}

/** Permanently deletes the caller's account and data. */
export async function deleteMyAccount(getToken: GetToken): Promise<void> {
  await authed(getToken, '/me/account', {
    method: 'DELETE',
    body: JSON.stringify({ confirm: 'DELETE' }),
  })
}
