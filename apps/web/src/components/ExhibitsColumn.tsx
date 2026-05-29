// Right-rail column that shows exhibits pinned to the current phase.
//
// Phase 2 ships the layout + plumbing; real exhibit object types
// (data-table, comparison-matrix, profit-tree, probability-tree, stacked-bar)
// arrive in Phase 3. For now we render the exhibit *ids* as placeholders so
// scenarios + UI can be wired and screenshotted end-to-end, and a friendly
// empty state when a phase has no exhibits.

import type { ScenarioPhase } from '@id/types'

interface ExhibitsColumnProps {
  phase: ScenarioPhase | null
  accentColor?: string
}

export function ExhibitsColumn({ phase, accentColor = '#0f5b89' }: ExhibitsColumnProps) {
  const exhibitIds = phase?.exhibitIds ?? []
  const hasExhibits = exhibitIds.length > 0

  return (
    <aside
      className="bg-[#0d0d0d] border-l border-white/8 flex flex-col"
      aria-label="Exhibits for current phase"
    >
      <div className="px-5 py-4 border-b border-white/8">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
          Exhibits
        </p>
        {phase && (
          <p className="mt-1 text-[12px] text-slate-mid">
            <span style={{ color: accentColor }}>{phase.label}</span>
            <span className="text-white/30"> · pinned for this phase</span>
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {hasExhibits ? (
          exhibitIds.map(id => <ExhibitPlaceholder key={id} id={id} />)
        ) : (
          <EmptyState />
        )}
      </div>
    </aside>
  )
}

function ExhibitPlaceholder({ id }: { id: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#111111] p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
        Exhibit
      </p>
      <p className="mt-1 text-[13px] font-medium text-[#f5f3ee]">{id}</p>
      <p className="mt-2 text-[11px] text-slate-mid leading-relaxed">
        Renderer arrives in Phase 3 (data-table, profit-tree, probability-tree,
        comparison-matrix, stacked-bar, text-exhibit).
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-white/10 p-4 text-[11px] text-white/40 leading-relaxed">
      No exhibits pinned to this phase yet. Structuring questions stand on their
      own; data exhibits appear when this phase requires reading or calculation.
    </div>
  )
}
