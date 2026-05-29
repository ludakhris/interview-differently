// Right-rail column that renders exhibits pinned to the current phase.
//
// Looks up each id in `currentPhase.exhibitIds` against the top-level
// `scenario.exhibits` catalog, then dispatches via ExhibitRenderer to the
// right subtype component (DataTable / ProfitTree / SegmentationMatrix /
// ChartExhibit / TextExhibit).

import type { Exhibit, ScenarioPhase } from '@id/types'
import { ExhibitRenderer } from '@/components/exhibits/ExhibitRenderer'

interface ExhibitsColumnProps {
  phase: ScenarioPhase | null
  exhibits: Exhibit[]                  // scenario.exhibits catalog
  accentColor?: string
}

export function ExhibitsColumn({ phase, exhibits, accentColor = '#0f5b89' }: ExhibitsColumnProps) {
  const ids = phase?.exhibitIds ?? []
  // Preserve the order declared on the phase so authors control reading order.
  const resolved = ids
    .map(id => exhibits.find(e => e.id === id))
    .filter((e): e is Exhibit => Boolean(e))
  const missing = ids.filter(id => !exhibits.some(e => e.id === id))

  return (
    <aside
      className="bg-[#0d0d0d] border-l border-white/8 flex flex-col w-full"
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

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {resolved.map(ex => (
          <ExhibitRenderer key={ex.id} exhibit={ex} />
        ))}
        {missing.map(id => (
          <MissingExhibit key={id} id={id} />
        ))}
      </div>
    </aside>
  )
}

// Surface authoring mistakes — an exhibitId referenced by a phase but not
// present in the catalog renders as an inline warning rather than a silent
// blank. Helps catch typos in yaml during scenario authoring.
function MissingExhibit({ id }: { id: string }) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
        Missing exhibit
      </p>
      <p className="mt-1 text-[12px] text-[#f5f3ee]/80">
        Phase references{' '}
        <code className="text-amber-300 font-mono text-[11px]">{id}</code> but no
        matching entry exists in <code className="font-mono text-[11px]">scenario.exhibits</code>.
      </p>
    </div>
  )
}
