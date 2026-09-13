import type { Scenario } from '@id/types'
import { RUBRIC_TEMPLATES } from '@/lib/builderTemplates'
import { authHeader } from './authToken'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

async function apiFetch<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : await authHeader()),
    },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API error ${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function listScenarios(): Promise<Scenario[]> {
  const data = await apiFetch<{ scenarios: Scenario[] }>('/scenarios')
  return data.scenarios
}

export async function getScenario(id: string, token?: string): Promise<Scenario | null> {
  try {
    return await apiFetch<Scenario>(`/scenarios/${id}`, undefined, token)
  } catch {
    return null
  }
}

export async function createScenario(
  title: string,
  track: string,
  subcategory?: string,
  /** Owner (#15). null = public; institution-admins default to their own institution server-side. */
  institutionId: string | null = null,
): Promise<Scenario> {
  const id = crypto.randomUUID()
  const startNodeId = crypto.randomUUID()
  const scenario: Scenario = {
    scenarioId: id,
    title,
    track: track as Scenario['track'],
    ...(subcategory ? { subcategory } : {}),
    institutionId,
    estimatedMinutes: 20,
    briefing: { situation: '', role: '', organisation: '', reportsTo: '', timeInRole: '' },
    nodes: [{ nodeId: startNodeId, type: 'decision', narrative: '' }],
    rubric: { dimensions: RUBRIC_TEMPLATES[track] ?? [] },
    builderMeta: {
      status: 'draft',
      lastEditedAt: new Date().toISOString(),
    },
  }
  return apiFetch<Scenario>('/scenarios', { method: 'POST', body: JSON.stringify(scenario) })
}

export async function updateScenario(scenario: Scenario): Promise<Scenario> {
  return apiFetch<Scenario>(`/scenarios/${scenario.scenarioId}`, {
    method: 'PUT',
    body: JSON.stringify(scenario),
  })
}

export async function deleteScenario(id: string): Promise<void> {
  return apiFetch<void>(`/scenarios/${id}`, { method: 'DELETE' })
}

export async function publishScenario(id: string): Promise<Scenario> {
  return apiFetch<Scenario>(`/scenarios/${id}/publish`, { method: 'PATCH' })
}

export async function importStaticScenario(scenario: Scenario): Promise<Scenario> {
  // Check if already exists
  const existing = await getScenario(scenario.scenarioId)
  if (existing) return existing
  const imported: Scenario = {
    ...scenario,
    builderMeta: {
      status: 'published',
      lastEditedAt: new Date().toISOString(),
    },
  }
  return apiFetch<Scenario>('/scenarios', { method: 'POST', body: JSON.stringify(imported) })
}

/**
 * Copies a scenario into a new draft. `title` / `institutionId` override the
 * source (the setup page's Clone path); with neither it's the list's quick
 * "Duplicate". Node/exhibit ids are kept — they only need to be unique within
 * a scenario.
 */
export async function duplicateScenario(
  id: string,
  opts: { title?: string; institutionId?: string | null } = {},
): Promise<Scenario | null> {
  const original = await getScenario(id)
  if (!original) return null
  const copy: Scenario = {
    ...original,
    scenarioId: crypto.randomUUID(),
    title: opts.title?.trim() || `${original.title} (copy)`,
    ...('institutionId' in opts ? { institutionId: opts.institutionId ?? null } : {}),
    builderMeta: {
      ...original.builderMeta!,
      status: 'draft',
      lastEditedAt: new Date().toISOString(),
    },
  }
  return apiFetch<Scenario>('/scenarios', { method: 'POST', body: JSON.stringify(copy) })
}

/** Creates a *draft* from an imported YAML/JSON scenario (unlike importStaticScenario, which publishes). */
export async function createScenarioFromImport(
  scenario: Scenario,
  opts: { title?: string; institutionId?: string | null } = {},
): Promise<Scenario> {
  const draft: Scenario = {
    ...scenario,
    title: opts.title?.trim() || scenario.title,
    ...('institutionId' in opts ? { institutionId: opts.institutionId ?? null } : {}),
    builderMeta: {
      status: 'draft',
      lastEditedAt: new Date().toISOString(),
    },
  }
  return apiFetch<Scenario>('/scenarios', { method: 'POST', body: JSON.stringify(draft) })
}
