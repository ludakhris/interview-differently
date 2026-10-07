import './staffOnlyNotice.css'

export const STAFF_ONLY_NOTICE =
  "Instructor notes are for your team: record context, observations and next steps so whoever works with this person next is up to speed. Your organization's staff can read them. Learners never can."

/**
 * The one reminder shown wherever staff write or read notes and support follow-ups. The full
 * callout sits above a notes area; `compact` is the one-line version for dialogs and forms.
 */
export function StaffOnlyNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'so-notice so-compact' : 'so-notice'} role="note">
      <svg className="so-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" />
        <path
          d="M8 11V8a4 4 0 0 1 8 0v3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <p className="so-text">{STAFF_ONLY_NOTICE}</p>
    </div>
  )
}
