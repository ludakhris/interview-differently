// Horizontal phase stepper rendered at the top of a multi-phase simulation.
//
// Stays hidden when the scenario only has a single implicit phase, so legacy
// scenarios are unaffected.

import type { PhaseView } from '@/lib/phases'

interface PhaseStepperProps {
  phases: PhaseView[]
  accentColor?: string
}

export function PhaseStepper({ phases, accentColor = '#0f5b89' }: PhaseStepperProps) {
  if (phases.length === 0) return null
  // Hide for single implicit phase — no value showing "Simulation 1/1".
  if (phases.length === 1 && phases[0].isImplicit) return null

  return (
    <div
      className="w-full bg-[#0f0f0f] border-b border-white/8"
      role="navigation"
      aria-label="Case phases"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3">
        <ol className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
          {phases.map((p, i) => (
            <li key={p.phase.id} className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <PhaseChip view={p} accentColor={accentColor} />
              {i < phases.length - 1 && (
                <span
                  className="h-px w-4 sm:w-8 bg-white/15 flex-shrink-0"
                  aria-hidden
                />
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function PhaseChip({ view, accentColor }: { view: PhaseView; accentColor: string }) {
  const { phase, index, status } = view

  const baseClasses =
    'flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-colors'

  if (status === 'active') {
    return (
      <span
        className={baseClasses}
        style={{
          backgroundColor: `${accentColor}22`,
          color: '#f5f3ee',
          border: `1px solid ${accentColor}66`,
        }}
        aria-current="step"
        title={phase.description}
      >
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold"
          style={{ backgroundColor: accentColor, color: '#fff' }}
        >
          {index + 1}
        </span>
        <span className="whitespace-nowrap">{phase.label}</span>
      </span>
    )
  }

  if (status === 'complete') {
    return (
      <span
        className={`${baseClasses} bg-white/5 text-slate-mid border border-white/10`}
        title={phase.description}
      >
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green/70 text-white text-[10px] font-bold">
          ✓
        </span>
        <span className="whitespace-nowrap">{phase.label}</span>
      </span>
    )
  }

  // locked
  return (
    <span
      className={`${baseClasses} bg-transparent text-white/30 border border-white/8`}
      title={phase.description}
    >
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/5 text-white/40 text-[10px] font-bold">
        {index + 1}
      </span>
      <span className="whitespace-nowrap">{phase.label}</span>
    </span>
  )
}
