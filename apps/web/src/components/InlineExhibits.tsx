// Inline exhibit block used by SimulationPage. Resolves a phase's exhibit
// ids against the scenario catalog and renders them stacked with a
// small section header. Single source of truth for inline placement so
// the decision/quant branches don't repeat the lookup logic.

import type { Exhibit, ScenarioPhase } from '@id/types'
import { ExhibitRenderer } from '@/components/exhibits/ExhibitRenderer'

interface Props {
  phase: ScenarioPhase | null
  catalog: Exhibit[]
  accentColor?: string
  // Eyebrow label above the block — varies by phase position so the first
  // phase reads as scenario context and later phases read as new evidence.
  label?: string
  className?: string
}

export function InlineExhibits({ phase, catalog, accentColor = '#0f5b89', label, className }: Props) {
  const ids = phase?.exhibitIds ?? []
  const resolved = ids
    .map(id => catalog.find(e => e.id === id))
    .filter((e): e is Exhibit => Boolean(e))
  if (resolved.length === 0) return null

  return (
    <div className={`space-y-3 ${className ?? ''}`}>
      {label && (
        <div className="flex items-center gap-2">
          <span
            className="inline-flex w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <p
            className="text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ color: accentColor }}
          >
            {label}
          </p>
          {resolved.length > 1 && (
            <span className="ml-auto text-[11px] font-semibold text-white/45 tabular-nums">
              {resolved.length}
            </span>
          )}
        </div>
      )}
      {resolved.map(ex => (
        <ExhibitRenderer key={ex.id} exhibit={ex} />
      ))}
    </div>
  )
}
