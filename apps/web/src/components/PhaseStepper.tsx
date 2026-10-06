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
      className="w-full bg-surface-bar border-b border-edge/8"
      role="navigation"
      aria-label="Case phases"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3">
        <ol className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
          {phases.map((p, i) => (
            <li key={p.phase.id} className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <PhaseChip view={p} accentColor={accentColor} />
              {i < phases.length - 1 && (
                <span className="h-px w-4 sm:w-8 bg-ink/15 flex-shrink-0" aria-hidden />
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
          // Brighter pill — solid tinted fill + accent ring instead of a
          // washed-out 13% alpha that disappears on dark backgrounds.
          backgroundColor: `${accentColor}33`,
          color: 'rgb(var(--ld-text, 245 243 238))',
          border: `1px solid ${accentColor}`,
          boxShadow: `0 0 0 3px ${accentColor}22`,
        }}
        aria-current="step"
        title={phase.description}
      >
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold"
          style={{ backgroundColor: accentColor, color: 'rgb(var(--ld-on-accent, 255 255 255))' }}
        >
          {index + 1}
        </span>
        <span className="whitespace-nowrap">{phase.label}</span>
        {view.totalCount > 1 && (
          <span className="font-mono text-[10px] text-ink/50">
            {view.answeredCount}/{view.totalCount}
          </span>
        )}
      </span>
    )
  }

  if (status === 'complete') {
    return (
      <span
        className={`${baseClasses} bg-green/10 text-fg border border-green/40`}
        title={phase.description}
      >
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green text-on-primary text-[10px] font-bold">
          ✓
        </span>
        <span className="whitespace-nowrap">{phase.label}</span>
      </span>
    )
  }

  // locked — slightly more presence so the row reads as a real progression,
  // not a faint placeholder.
  return (
    <span
      className={`${baseClasses} bg-ink/3 text-ink/55 border border-edge/12`}
      title={phase.description}
    >
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-ink/8 text-ink/50 text-[10px] font-bold">
        {index + 1}
      </span>
      <span className="whitespace-nowrap">{phase.label}</span>
    </span>
  )
}
