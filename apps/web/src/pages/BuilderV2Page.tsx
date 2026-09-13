// BuilderV2Page — the document-model scenario editor.
//
// Route: /builder/:scenarioId  (AdminRoute guarded); /builder/v2/:id redirects here
// Legacy graph canvas lives on at /builder/:scenarioId (renamed to "Advanced").
//
// Phase A: read-only document shell + phases rail.
// Phase B: gallery picker + insertion.
// Phase C: in-place editors.

import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { getScenario, updateScenario, publishScenario } from '@/services/builderService'
import { listScenarioMedia } from '@/services/scenarioMediaService'
import { useBuilderDoc } from '@/hooks/useBuilderDoc'
import { V2Toolbar } from '@/builder-v2/V2Toolbar'
import { PhasesRail } from '@/builder-v2/PhasesRail'
import { PhaseDocument } from '@/builder-v2/PhaseDocument'
import { descriptorFor, seedExhibit, seedNode } from '@/builder-v2/registry'
import type { EntityKind } from '@/builder-v2/registry'
import { ImmersiveProvider, type ImmersiveState } from '@/builder-v2/ImmersiveContext'
import { IssuesPanel } from '@/builder-v2/IssuesPanel'
import { validateScenarioDoc, type ValidationIssue } from '@/builder-v2/validate'
import type { JumpTarget } from '@/builder-v2/PhaseDocument'
import type { Scenario, ScenarioMediaAsset } from '@id/types'

export function BuilderV2Page() {
  const { scenarioId } = useParams<{ scenarioId: string }>()
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const [loading, setLoading] = useState(true)
  const [initial, setInitial] = useState<Scenario | null>(null)

  // Load scenario from API — pass Clerk JWT so the API returns the full scenario
  // (unauthenticated GET returns a marketing-safe summary without nodes/phases/exhibits)
  useEffect(() => {
    if (!scenarioId) { setLoading(false); return }
    getToken()
      .then(token => getScenario(scenarioId, token ?? undefined))
      .then(s => { setInitial(s); setLoading(false) })
  }, [scenarioId, getToken])

  const doc = useBuilderDoc(initial)
  const { scenario, saveStatus, setTitle, updateMeta, addPhase, updatePhase, reorderPhases, addExhibit, updateExhibit, removeExhibit, addNode, updateNode, removeNode, moveBlock, removePhase, saveNow, markPublished, toggleExhibitShared } = doc

  const [activePhaseId, setActivePhaseId] = useState<string | null>(null)

  // Publish gate (#24 Phase F): validate → Issues panel → publish only when clean
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [jumpTarget, setJumpTarget] = useState<JumpTarget | null>(null)

  // Immersive: rendered-media assets per node, refreshed after each render (#24 Phase H)
  const [mediaAssets, setMediaAssets] = useState<Record<string, ScenarioMediaAsset>>({})
  const isImmersive = scenario?.mode === 'immersive'
  useEffect(() => {
    if (!scenarioId || !isImmersive) return
    listScenarioMedia(scenarioId)
      .then(list => setMediaAssets(Object.fromEntries(list.map(a => [a.nodeId, a]))))
      .catch(() => {/* status shows "not rendered" */})
  }, [scenarioId, isImmersive])
  const immersive = useMemo<ImmersiveState | null>(
    () => (isImmersive && scenarioId ? { scenarioId, assets: mediaAssets, onRendered: a => setMediaAssets(m => ({ ...m, [a.nodeId]: a })) } : null),
    [isImmersive, scenarioId, mediaAssets],
  )

  // Set initial active phase once scenario loads
  useEffect(() => {
    if (scenario?.phases?.length && !activePhaseId) {
      setActivePhaseId(scenario.phases[0].id)
    }
  }, [scenario, activePhaseId])

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-[13px] text-white/30">Loading scenario…</p>
      </div>
    )
  }

  // ── Not found ──────────────────────────────────────────────────────────────
  if (!scenario || !scenarioId) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center flex-col gap-4">
        <p className="text-[14px] text-white">Scenario not found.</p>
        <button
          onClick={() => navigate('/builder')}
          className="text-[13px] text-emerald-400 underline"
        >
          Back to scenarios
        </button>
      </div>
    )
  }

  function openPublish() {
    if (!scenario) return
    setPublishError(null)
    setIssues(validateScenarioDoc(scenario, Object.values(mediaAssets)))
  }

  async function handlePublish() {
    if (!scenario || !scenarioId) return
    setPublishing(true)
    setPublishError(null)
    try {
      await updateScenario(scenario) // flush any pending autosave so the server publishes what the author sees
      await publishScenario(scenarioId)
      markPublished()
      setIssues(null)
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  function handlePreview() {
    sessionStorage.setItem(`builder-preview-${scenarioId}`, JSON.stringify(scenario))
    navigate(`/scenario/${scenarioId}/play?builderPreview=true`)
  }

  function handleInsert(phaseId: string, kind: EntityKind) {
    const id = `${kind}-${Date.now()}`
    const desc = descriptorFor(kind)
    if (desc.group === 'exhibit') {
      addExhibit(phaseId, seedExhibit(kind, id))
    } else {
      // quant + node groups both map to ScenarioNode
      addNode(phaseId, seedNode(kind, id))
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a] overflow-hidden">
      <V2Toolbar
        title={scenario.title}
        saveStatus={saveStatus}
        institutionName={scenario.institutionName ?? null}
        status={scenario.builderMeta?.status === 'published' ? 'published' : 'draft'}
        onPublish={openPublish}
        onTitleChange={setTitle}
        onSave={saveNow}
        onPreview={handlePreview}
      />

      <div className="flex flex-1 min-h-0">
        <PhasesRail
          phases={scenario.phases ?? []}
          activePhaseId={activePhaseId}
          onSelect={setActivePhaseId}
          onReorder={reorderPhases}
          onRename={(id, label) => updatePhase(id, { label })}
          onAdd={addPhase}
        />

        <ImmersiveProvider value={immersive}>
          <PhaseDocument
            scenario={scenario}
            activePhaseId={activePhaseId}
            onInsert={handleInsert}
            onMetaUpdate={updateMeta}
            onExhibitUpdate={updateExhibit}
            onNodeUpdate={updateNode}
            onPhaseUpdate={updatePhase}
            onToggleExhibitShared={toggleExhibitShared}
            onPhaseVisible={setActivePhaseId}
            onMoveBlock={moveBlock}
            onRemoveExhibit={removeExhibit}
            onRemoveNode={removeNode}
            onRemovePhase={removePhase}
            jumpTarget={jumpTarget}
          />
        </ImmersiveProvider>
      </div>

      {issues && (
        <IssuesPanel
          issues={publishError ? [{ level: 'error', message: `Publish failed: ${publishError}` }, ...issues] : issues}
          status={scenario.builderMeta?.status === 'published' ? 'published' : 'draft'}
          publishing={publishing}
          onJump={(where) => { setIssues(null); setJumpTarget({ ...where, nonce: Date.now() }) }}
          onPublish={handlePublish}
          onClose={() => setIssues(null)}
        />
      )}
    </div>
  )
}
