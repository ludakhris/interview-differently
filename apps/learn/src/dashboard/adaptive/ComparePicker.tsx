import type { BoardLearner } from '@id/types'
import { useState } from 'react'

/**
 * Pick the learners to compare (adaptive checkpoints prototype, student comparison mode on the board). Works like a
 * filter: type to narrow a long cohort, tick learners on or off.
 */
export function ComparePicker({
  learners,
  chosen,
  onChange,
}: {
  learners: BoardLearner[]
  chosen: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [q, setQ] = useState('')
  const match = learners.filter((l) => l.name.toLowerCase().includes(q.trim().toLowerCase()))
  const toggle = (id: string) => {
    const next = new Set(chosen)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }
  return (
    <section className="ad-cmp-picker" aria-labelledby="h-pick">
      <div className="ad-cmp-picker-head">
        <h2 className="dash-card-title" id="h-pick">
          Compare {chosen.size} of {learners.length} learners with the course as written
        </h2>
        <input
          type="search"
          placeholder="Find a learner"
          aria-label="Find a learner"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {chosen.size > 0 && (
          <button type="button" className="dash-btn-quiet" onClick={() => onChange(new Set())}>
            Clear
          </button>
        )}
      </div>
      <div className="ad-cmp-pick" role="group" aria-label="Learners to compare">
        {match.map((l) => (
          <label key={l.enrollmentId} className={chosen.has(l.enrollmentId) ? 'is-on' : ''}>
            <input
              type="checkbox"
              checked={chosen.has(l.enrollmentId)}
              onChange={() => toggle(l.enrollmentId)}
            />
            {l.name}
          </label>
        ))}
        {match.length === 0 && <span className="dash-muted">No learner matches “{q}”.</span>}
      </div>
    </section>
  )
}
