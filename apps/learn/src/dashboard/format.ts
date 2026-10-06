export const pct = (r: number | null): string => (r === null ? '—' : `${Math.round(r * 100)}%`)
export const score = (n: number | null): string => (n === null ? '—' : `${Math.round(n)}%`)
export const points = (n: number | null): string =>
  n === null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n))}`
/** A calendar day stored as UTC midnight (cohort start and end): shown as that day in every timezone. */
export const dateOnly = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '—'
export const dateShort = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'
