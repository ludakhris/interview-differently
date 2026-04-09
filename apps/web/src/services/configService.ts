const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export interface PublicConfig {
  aiFeedbackEnabled: boolean
}

export async function fetchConfig(): Promise<PublicConfig> {
  const res = await fetch(`${API_URL}/api/config`)
  if (!res.ok) throw new Error('Failed to fetch config')
  return res.json() as Promise<PublicConfig>
}

export async function patchAdminConfig(key: string, value: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/admin/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })
  if (!res.ok) throw new Error('Failed to update config')
}
