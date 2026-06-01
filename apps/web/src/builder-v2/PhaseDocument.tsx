// PhaseDocument — the main scrollable document area of the v2 editor.
//
// Renders each phase as a section with:
//   - Phase header (type-to-rename, rubric chips)
//   - Interleaved exhibit + node blocks in candidate-visible order
//   - "+ insert block" affordances between blocks (Picker wired in Phase B)
//
// Phase A: read-only renders + insert placeholders (no click action yet).

import { useRef } from 'react'
import type { Scenario, ScenarioPhase, Exhibit, ScenarioNode } from '@id/types'
import { ExhibitBlock, NodeBlock, BriefingBlock, SidebarBlock } from './DocBlock'

interface Props {
  scenario: Scenario
  onPhaseVisible?: (phaseId: string) => void
}

export function PhaseDocument({ scenario, onPhaseVisible }: Props) {
  const { phases = [], exhibits = [], nodes = [] } = scenario
  const exhibitMap = Object.fromEntries(exhibits.map(e => [e.id, e]))
  const nodeMap = Object.fromEntries(nodes.map(n => [n.nodeId, n]))

  // If no phases declared, show all nodes sequentially as a single implicit phase
  if (phases.length === 0) {
    return (
      <div className="flex-1 overflow-auto px-10 py-8">
        <div className="max-w-[820px] mx-auto flex flex-col gap-3">
          <p className="text-[12px] text-white/30 italic mb-2">No phases declared — add a phase in the left rail.</p>
          {nodes.map(node => (
            <NodeBlock key={node.nodeId} node={node} allNodes={nodes} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto px-10 py-8">
      <div className="max-w-[820px] mx-auto flex flex-col gap-10">
        {/* Scenario-level blocks — always visible regardless of phase */}
        <div className="flex flex-col gap-3">
          <BriefingBlock briefing={scenario.briefing} />
          {scenario.display?.sidebar && scenario.display.sidebar.length > 0 && (
            <SidebarBlock sidebar={scenario.display.sidebar} />
          )}
        </div>

        {phases.map(phase => (
          <PhaseSection
            key={phase.id}
            phase={phase}
            exhibitMap={exhibitMap}
            nodeMap={nodeMap}
            allNodes={nodes}
            onVisible={onPhaseVisible}
          />
        ))}
      </div>
    </div>
  )
}

// ── Individual phase section ──────────────────────────────────────────────────

interface PhaseSectionProps {
  phase: ScenarioPhase
  exhibitMap: Record<string, Exhibit>
  nodeMap: Record<string, ScenarioNode>
  allNodes: ScenarioNode[]
  onVisible?: (phaseId: string) => void
}

function PhaseSection({ phase, exhibitMap, nodeMap, allNodes, onVisible }: PhaseSectionProps) {
  const headerRef = useRef<HTMLDivElement>(null)
  void onVisible // wired in Phase B (intersection observer)

  // Build the ordered block stream: interleave exhibits + nodes in the order
  // they appear in the arrays, preserving the author's intended candidate flow.
  // We render exhibits listed in exhibitIds, then the node sequence, which
  // matches how SimulationPage renders them (InlineExhibits above, then nodes).
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

  return (
    <div>
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
          {/* Rubric dimension chips */}
          {(phase.rubricDimensions ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(phase.rubricDimensions ?? []).map(dim => (
                <span
                  key={dim}
                  className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-400/10 border border-emerald-400/30 text-emerald-300"
                >
                  {dim}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Block stream */}
      {blocks.length === 0 ? (
        <EmptyPhase />
      ) : (
        <div className="flex flex-col gap-3">
          {blocks.map((block) => (
            <div key={block.id}>
              {block.kind === 'exhibit' ? (
                <ExhibitBlock exhibit={block.exhibit} />
              ) : (
                <NodeBlock node={block.node} allNodes={allNodes} />
              )}
              {/* Insert affordance between every pair of blocks */}
              <InsertAffordance />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyPhase() {
  return (
    <div className="border border-dashed border-white/10 rounded-[14px] py-12 flex flex-col items-center gap-3">
      <p className="text-[13px] text-white/30 font-medium">No blocks yet</p>
      <button className="text-[12px] font-semibold text-emerald-400/80 hover:text-emerald-300 border border-emerald-400/30 hover:border-emerald-400/60 rounded-lg px-4 py-2 transition-all">
        ＋ Insert first block
      </button>
    </div>
  )
}

function InsertAffordance() {
  return (
    <div className="group flex items-center justify-center h-5 my-0.5 relative">
      <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      <button className="relative opacity-0 group-hover:opacity-100 transition-opacity bg-[#111] border border-white/15 text-[11px] font-semibold text-white/40 hover:text-white/70 hover:border-white/25 rounded-full px-3 py-0.5">
        ＋ insert block
      </button>
    </div>
  )
}
