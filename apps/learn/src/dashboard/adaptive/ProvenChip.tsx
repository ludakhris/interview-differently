import type { ReactNode } from 'react'

/** "Proven": the learner showed the skill, so this part of the course is not needed. */
export function ProvenChip({ children }: { children: ReactNode }) {
  return (
    <span className="ad-chip ad-chip-proven">
      <span aria-hidden="true">🏅</span> {children}
    </span>
  )
}
