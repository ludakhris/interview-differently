import type { ScenarioMediaAsset } from '@id/types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export async function listScenarioMedia(scenarioId: string): Promise<ScenarioMediaAsset[]> {
  const res = await fetch(`${API_URL}/api/scenario-media/${scenarioId}`)
  if (!res.ok) throw new Error(`Failed to load media assets: ${res.status}`)
  return res.json()
}

export async function renderNodeMedia(scenarioId: string, nodeId: string): Promise<ScenarioMediaAsset> {
  const res = await fetch(`${API_URL}/api/scenario-media/render/${scenarioId}/${nodeId}`, {
    method: 'POST',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Render failed: ${res.status}`)
  }
  return res.json()
}

export async function deleteNodeMedia(scenarioId: string, nodeId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/scenario-media/${scenarioId}/${nodeId}`, {
    method: 'DELETE',
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Delete failed: ${res.status}`)
  }
}

/** Compute sha256 of a string and return hex. Used for stale detection in the builder UI. */
export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Bulk re-render ─────────────────────────────────────────────────────────

export interface BulkRenderProgress {
  scenarioId: string
  scenarioTitle: string
  nodeId: string
  /** Index in the overall plan, 0-based. */
  index: number
  /** Total number of nodes to render. */
  total: number
}

export interface BulkRenderSummary {
  rendered: number
  alreadyCurrent: number
  failed: number
  skippedNoPersona: number
  failures: Array<{ scenarioId: string; scenarioTitle: string; nodeId: string; reason: string }>
}

/** Sub-second renders mean the backend short-circuited on a matching scriptHash. */
const IDEMPOTENT_THRESHOLD_MS = 1500

interface BulkRenderableScenario {
  scenarioId: string
  title?: string
  mode?: 'text' | 'immersive'
  status?: string
  builderMeta?: { status?: string }
  interviewer?: { presenterId?: string; voiceId?: string }
  nodes?: Array<{
    nodeId: string
    type: string
    audioScript?: string
    narrative?: string
  }>
}

/**
 * Walk every published immersive scenario and re-render each renderable node
 * (decision nodes with audioScript or narrative). Mirrors the CLI script
 * `apps/api/scripts/backfill-scenario-media.ts` so the two stay consistent.
 *
 * Renders sequentially — D-ID can rate-limit on parallel requests, and a
 * single render is already 30-180s, so going in order keeps progress
 * legible. Pass `onBeforeRender` / `onAfterRender` callbacks to drive a
 * progress UI; the function only resolves once every node is processed.
 *
 * Idempotent: if a render returns in under ~1.5s the node was already
 * up-to-date (the backend short-circuits on matching scriptHash). Counted
 * separately from real renders in the returned summary.
 */
export async function bulkRenderAllMedia(
  scenarios: BulkRenderableScenario[],
  callbacks: {
    onBeforeRender?: (p: BulkRenderProgress) => void
    onAfterRender?: (p: BulkRenderProgress, ok: boolean, error?: string) => void
  } = {},
): Promise<BulkRenderSummary> {
  const summary: BulkRenderSummary = {
    rendered: 0,
    alreadyCurrent: 0,
    failed: 0,
    skippedNoPersona: 0,
    failures: [],
  }

  // Build the flat plan upfront so the caller knows the total.
  type Plan = { scenarioId: string; scenarioTitle: string; nodeId: string; hasPersona: boolean }
  const plan: Plan[] = []
  for (const s of scenarios) {
    if (s.mode !== 'immersive') continue
    const status = s.builderMeta?.status ?? s.status
    if (status !== 'published') continue
    const hasPersona = Boolean(s.interviewer?.presenterId && s.interviewer?.voiceId)
    for (const n of s.nodes ?? []) {
      if (n.type !== 'decision') continue
      const script = (n.audioScript ?? '').trim() || (n.narrative ?? '').trim()
      if (!script) continue
      plan.push({
        scenarioId: s.scenarioId,
        scenarioTitle: s.title ?? s.scenarioId,
        nodeId: n.nodeId,
        hasPersona,
      })
    }
  }

  for (let i = 0; i < plan.length; i++) {
    const item = plan[i]
    const progress: BulkRenderProgress = {
      scenarioId: item.scenarioId,
      scenarioTitle: item.scenarioTitle,
      nodeId: item.nodeId,
      index: i,
      total: plan.length,
    }

    if (!item.hasPersona) {
      summary.skippedNoPersona++
      summary.failures.push({
        scenarioId: item.scenarioId,
        scenarioTitle: item.scenarioTitle,
        nodeId: item.nodeId,
        reason: 'No interviewer persona — set presenter and voice in the briefing',
      })
      callbacks.onAfterRender?.(progress, false, 'no persona')
      continue
    }

    callbacks.onBeforeRender?.(progress)
    const t0 = performance.now()
    try {
      await renderNodeMedia(item.scenarioId, item.nodeId)
      const elapsed = performance.now() - t0
      if (elapsed < IDEMPOTENT_THRESHOLD_MS) summary.alreadyCurrent++
      else summary.rendered++
      callbacks.onAfterRender?.(progress, true)
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error'
      summary.failed++
      summary.failures.push({
        scenarioId: item.scenarioId,
        scenarioTitle: item.scenarioTitle,
        nodeId: item.nodeId,
        reason,
      })
      callbacks.onAfterRender?.(progress, false, reason)
    }
  }

  return summary
}
