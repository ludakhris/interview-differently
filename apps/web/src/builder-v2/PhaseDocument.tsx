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
import { ExhibitBlock, NodeBlock, SetupBlock, SidebarBlock } from './DocBlock'
import { SetupEditor } from './editors/SetupEditor'
import type { ScenarioMeta } from '@/hooks/useBuilderDoc'
import { BlockPicker } from './BlockPicker'

interface Props {
  scenario: Scenario
  activePhaseId?: string | null
  onInsert: (phaseId: string, kind: EntityKind) => void
  onMetaUpdate: (updates: ScenarioMeta) => void
  onExhibitUpdate: (exhibit: Exhibit) => void
  onNodeUpdate: (node: ScenarioNode) => void
  onPhaseUpdate?: (phaseId: string, updates: Partial<ScenarioPhase>) => void
  onToggleExhibitShared?: (exhibitId: string, fromPhaseId: string) => void
  onPhaseVisible?: (phaseId: string) => void
  /** Block actions (#24 Phase H) */
  onMoveBlock: (phaseId: string, kind: 'exhibit' | 'node', id: string, dir: -1 | 1) => void
  onRemoveExhibit: (exhibitId: string) => void
  onRemoveNode: (nodeId: string) => void
  onRemovePhase: (phaseId: string) => void
}

/** editingBlockId sentinel for the scenario-level setup block. */
const SETUP_BLOCK_ID = '__setup__'

export function PhaseDocument({ scenario, activePhaseId, onInsert, onMetaUpdate, onExhibitUpdate, onNodeUpdate, onPhaseUpdate, onToggleExhibitShared, onPhaseVisible, onMoveBlock, onRemoveExhibit, onRemoveNode, onRemovePhase }: Props) {
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
          {editingBlockId === SETUP_BLOCK_ID ? (
            <SetupEditor scenario={scenario} onDone={(updates) => { onMetaUpdate(updates); setEditingBlockId(null) }} />
          ) : (
            <SetupBlock scenario={scenario} onEditRequest={() => setEditingBlockId(SETUP_BLOCK_ID)} />
          )}
          <p className="text-[12px] text-white/30 italic mb-2">
            No phases declared — the candidate walks these steps in order. Add a phase in the left rail to group them.
          </p>
          {nodes.map(node => (
            <NodeBlock
              key={node.nodeId}
              node={node}
              allNodes={nodes}
              isEditing={editingBlockId === node.nodeId}
              onEditRequest={() => setEditingBlockId(node.nodeId)}
              onUpdate={(n) => { onNodeUpdate(n); setEditingBlockId(null) }}
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
            {editingBlockId === SETUP_BLOCK_ID ? (
              <SetupEditor
                scenario={scenario}
                onDone={(updates) => { onMetaUpdate(updates); setEditingBlockId(null) }}
              />
            ) : (
              <>
                <SetupBlock scenario={scenario} onEditRequest={() => setEditingBlockId(SETUP_BLOCK_ID)} />
                {scenario.display?.sidebar && scenario.display.sidebar.length > 0 && (
                  <SidebarBlock sidebar={scenario.display.sidebar} />
                )}
              </>
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
              onMoveBlock={(kind, id, dir) => onMoveBlock(phase.id, kind, id, dir)}
              onRemoveBlock={(kind, id) => { if (kind === 'exhibit') onRemoveExhibit(id); else onRemoveNode(id) }}
              onRemovePhase={() => onRemovePhase(phase.id)}
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
  onMoveBlock: (kind: 'exhibit' | 'node', id: string, dir: -1 | 1) => void
  onRemoveBlock: (kind: 'exhibit' | 'node', id: string) => void
  onRemovePhase: () => void
}

function PhaseSection({ phase, phaseIdx, allPhases, exhibitMap, nodeMap, allNodes, allDimensions, editingBlockId, onEditRequest, onExhibitUpdate, onNodeUpdate, onInsertRequest, onPhaseUpdate, onToggleExhibitShared, onVisible, onMoveBlock, onRemoveBlock, onRemovePhase }: PhaseSectionProps) {
  const [editingDescription, setEditingDescription] = useState(false)
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
          {editingDescription ? (
            <input
              autoFocus
              defaultValue={phase.description ?? ''}
              placeholder="One line on what this phase is for (shown to the candidate)"
              onBlur={e => { onPhaseUpdate?.(phase.id, { description: e.target.value.trim() || undefined }); setEditingDescription(false) }}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setEditingDescription(false)
              }}
              className="mt-1 w-full bg-[#0a0a0a] border border-white/12 rounded-md px-2 py-1 text-[13px] text-white/75 outline-none focus:border-emerald-400/50"
            />
          ) : (
            <p
              className="text-[13px] text-white/45 mt-0.5 cursor-text hover:text-white/70 transition-colors"
              title="Click to edit the phase description"
              onClick={() => onPhaseUpdate && setEditingDescription(true)}
            >
              {phase.description || <span className="italic text-white/25">Add a phase description…</span>}
            </p>
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
        <button
          type="button"
          onClick={() => {
            const n = phase.nodeIds.length
            if (confirm(`Delete phase "${phase.label}"${n ? ` and its ${n} question block${n === 1 ? '' : 's'}` : ''}? Exhibits shown in other phases are kept.`)) onRemovePhase()
          }}
          title="Delete this phase"
          className="text-[11px] text-white/25 hover:text-red-400/80 transition-colors mt-1"
        >
          Delete phase
        </button>
      </div>

      {/* Block stream */}
      {blocks.length === 0 ? (
        <EmptyPhase onClick={onInsertRequest} />
      ) : (
        <div className="flex flex-col gap-3">
          {blocks.map((block, blockIdx) => (
            <div key={block.id} className="relative group/blk">
              <BlockGutter
                canUp={block.kind === 'exhibit' ? blockIdx > 0 : blockIdx > blocks.findIndex(b => b.kind === 'node')}
                canDown={block.kind === 'exhibit' ? blockIdx < blocks.filter(b => b.kind === 'exhibit').length - 1 : blockIdx < blocks.length - 1}
                onUp={() => onMoveBlock(block.kind, block.id, -1)}
                onDown={() => onMoveBlock(block.kind, block.id, 1)}
                onRemove={() => {
                  const what = block.kind === 'exhibit' ? 'this exhibit' : 'this block'
                  if (confirm(`Remove ${what} from the scenario? Options pointing at it will fall back to "continue".`)) onRemoveBlock(block.kind, block.id)
                }}
              />
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

/** Hover controls in the left gutter of each block: move up / down within its list, remove. */
function BlockGutter({ canUp, canDown, onUp, onDown, onRemove }: { canUp: boolean; canDown: boolean; onUp: () => void; onDown: () => void; onRemove: () => void }) {
  const btn = 'w-6 h-6 flex items-center justify-center rounded-md text-[11px] border border-white/10 bg-[#111] text-white/40 hover:text-white/85 hover:border-white/25 disabled:opacity-25 disabled:hover:text-white/40 transition-colors'
  return (
    <div className="absolute -left-9 top-2 flex flex-col gap-1 opacity-0 group-hover/blk:opacity-100 focus-within:opacity-100 transition-opacity">
      <button type="button" onClick={onUp} disabled={!canUp} title="Move up" className={btn}>▲</button>
      <button type="button" onClick={onDown} disabled={!canDown} title="Move down" className={btn}>▼</button>
      <button type="button" onClick={onRemove} title="Remove block" className={`${btn} hover:text-red-400 hover:border-red-400/40`}>✕</button>
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
