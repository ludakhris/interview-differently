/**
 * Backfill avatar clips for every node of every published immersive scenario.
 *
 * Hits the running API (`POST /api/scenario-media/render/:scenarioId/:nodeId`)
 * one node at a time. The render endpoint is idempotent — already-rendered nodes
 * with matching script hashes return immediately without re-rendering. Re-runs
 * are safe and cheap.
 *
 * Usage:
 *   # Render against local API (default):
 *   npm run backfill:media
 *
 *   # Render against a different API:
 *   BACKFILL_API_URL=https://api.interviewdifferently.com npm run backfill:media
 *
 *   # Dry-run — list what would be rendered without calling the API:
 *   npm run backfill:media -- --dry-run
 *
 * Stop with Ctrl+C at any time; the next run will pick up where this one left off.
 */

const API_URL = (process.env.BACKFILL_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const DRY_RUN = process.argv.includes('--dry-run')

interface ScenarioNode {
  nodeId: string
  type: string
  audioScript?: string
  narrative?: string
}

interface Scenario {
  scenarioId: string
  title: string
  mode?: 'text' | 'immersive'
  status?: string
  interviewer?: { presenterId: string; voiceId: string }
  builderMeta?: { status?: string }
  nodes: ScenarioNode[]
}

interface ListResponse {
  scenarios: Scenario[]
}

function isPublishedImmersive(s: Scenario): boolean {
  if (s.mode !== 'immersive') return false
  return s.builderMeta?.status === 'published' || s.status === 'published'
}

function renderableNodes(s: Scenario): ScenarioNode[] {
  return s.nodes.filter(
    n => n.type === 'decision' && ((n.audioScript ?? '').trim() || (n.narrative ?? '').trim()),
  )
}

async function main() {
  console.log(`Backfill target: ${API_URL}${DRY_RUN ? '  (dry-run)' : ''}\n`)

  const listRes = await fetch(`${API_URL}/api/scenarios`)
  if (!listRes.ok) throw new Error(`Failed to list scenarios: HTTP ${listRes.status}`)
  const { scenarios } = (await listRes.json()) as ListResponse

  const targets = scenarios.filter(isPublishedImmersive)
  console.log(`${targets.length} published immersive scenarios found (of ${scenarios.length} total)\n`)
  if (targets.length === 0) return

  let rendered = 0
  let failed = 0
  let skippedNoPersona = 0
  const failures: Array<{ scenario: string; node: string; reason: string }> = []

  for (const scenario of targets) {
    const nodes = renderableNodes(scenario)
    console.log(`[${scenario.scenarioId}] ${scenario.title} — ${nodes.length} node${nodes.length === 1 ? '' : 's'}`)

    if (!scenario.interviewer?.presenterId || !scenario.interviewer?.voiceId) {
      console.log(`  ⏭  no interviewer persona set — skipping all nodes (open the briefing in /builder to fix)`)
      skippedNoPersona += nodes.length
      continue
    }

    for (const node of nodes) {
      if (DRY_RUN) {
        console.log(`  •  ${node.nodeId} would render`)
        continue
      }
      const t0 = Date.now()
      try {
        const r = await fetch(
          `${API_URL}/api/scenario-media/render/${scenario.scenarioId}/${node.nodeId}`,
          { method: 'POST' },
        )
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
        if (!r.ok) {
          const body = await r.text().catch(() => '')
          throw new Error(body || `HTTP ${r.status}`)
        }
        // Sub-second response means the asset was already up-to-date (idempotent hit).
        const wasIdempotent = Date.now() - t0 < 1500
        console.log(`  ✓  ${node.nodeId} ${wasIdempotent ? '(already current)' : `rendered in ${elapsed}s`}`)
        rendered++
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'unknown'
        console.error(`  ✗  ${node.nodeId} — ${reason}`)
        failures.push({ scenario: scenario.scenarioId, node: node.nodeId, reason })
        failed++
      }
    }
  }

  console.log()
  console.log(`Summary: ${rendered} rendered/current, ${failed} failed, ${skippedNoPersona} skipped (no persona)`)
  if (failures.length > 0) {
    console.log()
    console.log('Failures:')
    for (const f of failures) console.log(`  ${f.scenario}/${f.node}: ${f.reason}`)
    process.exitCode = 1
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
