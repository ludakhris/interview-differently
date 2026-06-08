// PhaseDocument — the main scrollable document area of the v2 editor.
//
// Renders each phase as a section with:
//   - Phase header (type-to-rename, clickable rubric chips)
//   - Interleaved exhibit + node blocks in candidate-visible order
//   - "+ insert block" affordances between blocks (Picker wired in Phase B)
// After all phases: a Wrap-up section rendering all feedback / ending nodes.

import { useState, useRef, useEffect } from 'react'
import type { Scenario, ScenarioPhase, Exhibit, ScenarioNode } from '@id/types'
import type { EntityKind } from './registry'
import { ExhibitBlock, NodeBlock, BriefingBlock, SidebarBlock } from './DocBlock'
import { BlockPicker } from './BlockPicker'

interface Props {
  scenario: Scenario
  activePhaseId?: string | null
  onInsert: (phaseId: string, kind: EntityKind) => void
  onExhibitUpdate: (exhibit: Exhibit) => void
  onNodeUpdate: (node: ScenarioNode) => void
  onPhaseUpdate?: (phaseId: string, updates: Partial<ScenarioPhase>) => void
  onToggleExhibitShared?: (exhibitId: string, fromPhaseId: string) => void
  onPhaseVisible?: (phaseId: string) => void
}

export function PhaseDocument({ scenario, activePhaseId, onInsert, onExhibitUpdate, onNodeUpdate, onPhaseUpdate, onToggleExhibitShared, onPhaseVisible }: Props) {
  const { phases = [], exhibits = [], nodes = [] } = scenario
  const exhibitMap = Object.fromEntries(exhibits.map(e => [e.id, e]))
  const nodeMap = Object.fromEntries(nodes.map(n => [n.nodeId, n]))
  const allDimensions = (scenario.rubric?.dimensions ?? []).map(d => d.name)

  // Which phase currently has the picker open
  const [pickerPhaseId, setPickerPhaseId] = useState<string | null>(null)
  // Which block is currently in edit mode (by id — exhibit.id or node.nodeId)
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)

  // Scroll to phase when selected from rail
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!activePhaseId) return
    const el = scrollRef.current?.querySelector(`[data-phase-id="${activePhaseId}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [activePhaseId])

  function handlePick(kind: EntityKind) {
    if (pickerPhaseId) onInsert(pickerPhaseId, kind)
    setPickerPhaseId(null)
  }

  // Feedback nodes not assigned to any phase — shown in Wrap-up
  const phaseNodeIds = new Set(phases.flatMap(p => p.nodeIds ?? []))
  const wrapUpNodes = nodes.filter(n => n.type === 'feedback' && !phaseNodeIds.has(n.nodeId))

  // If no phases declared, show all nodes sequentially as a single implicit phase
  if (phases.length === 0) {
    return (
      <div className="flex-1 overflow-auto px-10 py-8">
        <div className="max-w-[820px] mx-auto flex flex-col gap-3">
          <p className="text-[12px] text-white/30 italic mb-2">No phases declared — add a phase in the left rail.</p>
          {nodes.map(node => (
            <NodeBlock
              key={node.nodeId}
              node={node}
              allNodes={nodes}
              isEditing={false}
              onEditRequest={() => {}}
              onUpdate={() => {}}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-auto px-10 py-8">
        <div className="max-w-[820px] mx-auto flex flex-col gap-10">
          {/* Scenario-level blocks — always visible regardless of phase */}
          <div className="flex flex-col gap-3">
            <BriefingBlock briefing={scenario.briefing} />
            {scenario.display?.sidebar && scenario.display.sidebar.length > 0 && (
              <SidebarBlock sidebar={scenario.display.sidebar} />
            )}
          </div>

          {phases.map((phase, phaseIdx) => (
            <PhaseSection
              key={phase.id}
              phase={phase}
              phaseIdx={phaseIdx}
              allPhases={phases}
              exhibitMap={exhibitMap}
              nodeMap={nodeMap}
              allNodes={nodes}
              allDimensions={allDimensions}
              editingBlockId={editingBlockId}
              onEditRequest={setEditingBlockId}
              onExhibitUpdate={(e) => { onExhibitUpdate(e); setEditingBlockId(null) }}
              onNodeUpdate={(n) => { onNodeUpdate(n); setEditingBlockId(null) }}
              onInsertRequest={() => setPickerPhaseId(phase.id)}
              onPhaseUpdate={onPhaseUpdate}
              onToggleExhibitShared={onToggleExhibitShared}
              onVisible={onPhaseVisible}
            />
          ))}

          {/* Wrap-up — feedback / ending nodes not in any phase */}
          {wrapUpNodes.length > 0 && (
            <div>
              <div className="flex items-start gap-3 mb-4">
                <div className="w-1 self-stretch bg-amber-500/70 rounded-full flex-none mt-1" />
                <div>
                  <h2 className="text-[22px] font-bold tracking-tight text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
                    Wrap-up
                  </h2>
                  <p className="text-[13px] text-white/45 mt-0.5">Endings — referenced by decision option targets above</p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {wrapUpNodes.map(node => (
                  <NodeBlock
                    key={node.nodeId}
                    node={node}
                    allNodes={nodes}
                    isEditing={editingBlockId === node.nodeId}
                    onEditRequest={() => setEditingBlockId(node.nodeId)}
                    onUpdate={n => { onNodeUpdate(n); setEditingBlockId(null) }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {pickerPhaseId && (
        <BlockPicker
          onPick={handlePick}
          onClose={() => setPickerPhaseId(null)}
        />
      )}
    </>
  )
}

// ── Individual phase section ──────────────────────────────────────────────────

interface PhaseSectionProps {
  phase: ScenarioPhase
  phaseIdx: number
  allPhases: ScenarioPhase[]
  exhibitMap: Record<string, Exhibit>
  nodeMap: Record<string, ScenarioNode>
  allNodes: ScenarioNode[]
  allDimensions: string[]
  editingBlockId: string | null
  onEditRequest: (blockId: string) => void
  onExhibitUpdate: (exhibit: Exhibit) => void
  onNodeUpdate: (node: ScenarioNode) => void
  onInsertRequest: () => void
  onPhaseUpdate?: (phaseId: string, updates: Partial<ScenarioPhase>) => void
  onToggleExhibitShared?: (exhibitId: string, fromPhaseId: string) => void
  onVisible?: (phaseId: string) => void
}

function PhaseSection({ phase, phaseIdx, allPhases, exhibitMap, nodeMap, allNodes, allDimensions, editingBlockId, onEditRequest, onExhibitUpdate, onNodeUpdate, onInsertRequest, onPhaseUpdate, onToggleExhibitShared, onVisible }: PhaseSectionProps) {
  const headerRef = useRef<HTMLDivElement>(null)
  void onVisible // intersection observer wired in Phase D

  // Build the ordered block stream
  type Block =
    | { kind: 'exhibit'; id: string; exhibit: Exhibit }
    | { kind: 'node'; id: string; node: ScenarioNode }

  const blocks: Block[] = [
    ...(phase.exhibitIds ?? []).flatMap(id => {
      const exhibit = exhibitMap[id]
      return exhibit ? [{ kind: 'exhibit' as const, id, exhibit }] : []
    }),
    ...(phase.nodeIds ?? []).flatMap(id => {
      const node = nodeMap[id]
      return node ? [{ kind: 'node' as const, id, node }] : []
    }),
  ]

  // Rubric dimension toggle
  function toggleDimension(dim: string) {
    if (!onPhaseUpdate) return
    const current = phase.rubricDimensions ?? []
    const next = current.includes(dim)
      ? current.filter(d => d !== dim)
      : [...current, dim]
    onPhaseUpdate(phase.id, { rubricDimensions: next.length ? next : undefined })
  }

  // Exhibit shared = appears in any phase after this one
  function isExhibitShared(exhibitId: string): boolean {
    return allPhases.slice(phaseIdx + 1).some(p => (p.exhibitIds ?? []).includes(exhibitId))
  }

  return (
    <div data-phase-id={phase.id}>
      {/* Phase header */}
      <div ref={headerRef} className="flex items-start gap-3 mb-4">
        <div className="w-1 self-stretch bg-emerald-500/70 rounded-full flex-none mt-1" />
        <div className="flex-1">
          <h2 className="text-[22px] font-bold tracking-tight text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
            {phase.label}
          </h2>
          {phase.description && (
            <p className="text-[13px] text-white/45 mt-0.5">{phase.description}</p>
          )}
          {/* Rubric dimension chips — clickable toggles */}
          {allDimensions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {allDimensions.map(dim => {
                const active = (phase.rubricDimensions ?? []).includes(dim)
                return (
                  <button
                    key={dim}
                    type="button"
                    onClick={() => toggleDimension(dim)}
                    title={active ? 'Remove from this phase' : 'Score this dimension in this phase'}
                    className={[
                      'text-[11px] font-semibold px-2.5 py-0.5 rounded-full border transition-all',
                      active
                        ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/5'
                        : 'bg-transparent border-white/[0.08] text-white/25 hover:border-white/20 hover:text-white/40',
                    ].join(' ')}
                  >
                    {dim}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Block stream */}
      {blocks.length === 0 ? (
        <EmptyPhase onClick={onInsertRequest} />
      ) : (
        <div className="flex flex-col gap-3">
          {blocks.map((block) => (
            <div key={block.id}>
              {block.kind === 'exhibit' ? (
                <ExhibitBlock
                  exhibit={block.exhibit}
                  isEditing={editingBlockId === block.exhibit.id}
                  isShared={isExhibitShared(block.exhibit.id)}
                  onEditRequest={() => onEditRequest(block.exhibit.id)}
                  onUpdate={onExhibitUpdate}
                  onToggleShared={onToggleExhibitShared
                    ? () => onToggleExhibitShared(block.exhibit.id, phase.id)
                    : undefined}
                />
              ) : (
                <NodeBlock
                  node={block.node}
                  allNodes={allNodes}
                  isEditing={editingBlockId === block.node.nodeId}
                  onEditRequest={() => onEditRequest(block.node.nodeId)}
                  onUpdate={onNodeUpdate}
                />
              )}
              <InsertAffordance onClick={onInsertRequest} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyPhase({ onClick }: { onClick: () => void }) {
  return (
    <div className="border border-dashed border-white/10 rounded-[14px] py-12 flex flex-col items-center gap-3">
      <p className="text-[13px] text-white/30 font-medium">No blocks yet</p>
      <button
        onClick={onClick}
        className="text-[12px] font-semibold text-emerald-400/80 hover:text-emerald-300 border border-emerald-400/30 hover:border-emerald-400/60 rounded-lg px-4 py-2 transition-all"
      >
        ＋ Insert first block
      </button>
    </div>
  )
}

function InsertAffordance({ onClick }: { onClick: () => void }) {
  return (
    <div className="group flex items-center justify-center h-5 my-0.5 relative">
      <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      <button
        onClick={onClick}
        className="relative opacity-0 group-hover:opacity-100 transition-opacity bg-[#111] border border-white/15 text-[11px] font-semibold text-white/40 hover:text-white/70 hover:border-white/25 rounded-full px-3 py-0.5"
      >
        ＋ insert block
      </button>
    </div>
  )
}
