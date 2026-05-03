import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import {
  fetchInstitutionSuggestion,
  fetchMyMemberships,
  joinByInstitution,
  joinByKey,
  leaveMembership,
  type InstitutionSuggestion,
  type MyMembership,
} from '@/services/meService'

/**
 * Lists the caller's current institution/cohort memberships and offers a
 * join form (suggestion + join-key). Used inline on /settings and as the
 * core of the /welcome page.
 *
 * `variant="welcome"` hides the existing-memberships list and renders a
 * "Skip for now" link instead of a Leave button — the welcome flow is
 * for users who haven't joined yet, and we don't want to encourage them
 * to leave a cohort they may have just joined accidentally.
 */
export interface MembershipsCardProps {
  variant?: 'settings' | 'welcome'
  /** Called after a successful join — welcome page uses this to navigate to dashboard. */
  onJoined?: () => void
  /** Called when the user clicks "Skip" on the welcome variant. */
  onSkip?: () => void
}

export function MembershipsCard({ variant = 'settings', onJoined, onSkip }: MembershipsCardProps) {
  const { getToken, isSignedIn } = useAuth()
  const [memberships, setMemberships] = useState<MyMembership[] | null>(null)
  const [suggestion, setSuggestion] = useState<InstitutionSuggestion | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!isSignedIn) return
    setError(null)
    try {
      const [m, s] = await Promise.all([
        fetchMyMemberships(getToken),
        fetchInstitutionSuggestion(getToken),
      ])
      setMemberships(m)
      setSuggestion(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load memberships')
    } finally {
      setLoading(false)
    }
  }, [getToken, isSignedIn])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (loading) {
    return <p className="text-[13px] text-slate-mid">Loading…</p>
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3">
        <p className="text-[13px] text-red-400">{error}</p>
      </div>
    )
  }

  return (
    <div>
      {variant === 'settings' && memberships && memberships.length > 0 && (
        <ul className="space-y-2 mb-5">
          {memberships.map((m) => (
            <li
              key={m.membershipId}
              className="flex items-center justify-between bg-[#0a0a0a] border border-white/10 rounded-lg px-4 py-3"
            >
              <div>
                <p className="text-[13px] font-semibold text-[#f5f3ee]">{m.institution.name}</p>
                <p className="text-[11px] text-slate-mid">
                  {m.cohort ? <>Cohort: {m.cohort.name}</> : <span className="italic">No cohort</span>}
                </p>
              </div>
              <button
                onClick={async () => {
                  if (!confirm(`Leave ${m.institution.name}? You can rejoin later if you have a join key.`)) return
                  try {
                    await leaveMembership(getToken, m.membershipId)
                    await refresh()
                  } catch (e) {
                    alert(e instanceof Error ? e.message : 'Failed to leave')
                  }
                }}
                className="text-[11px] text-slate-mid hover:text-red-400 transition-colors"
              >
                Leave
              </button>
            </li>
          ))}
        </ul>
      )}

      <JoinForm
        suggestion={suggestion}
        existingInstitutionIds={new Set(memberships?.map((m) => m.institution.id) ?? [])}
        onJoined={async () => {
          await refresh()
          onJoined?.()
        }}
      />

      {variant === 'welcome' && (
        <div className="mt-6 text-center">
          <button onClick={onSkip} className="text-[12px] text-slate-mid hover:text-[#f5f3ee] transition-colors">
            Skip for now →
          </button>
        </div>
      )}
    </div>
  )
}

// ── JoinForm ───────────────────────────────────────────────────────────────

function JoinForm({
  suggestion,
  existingInstitutionIds,
  onJoined,
}: {
  suggestion: InstitutionSuggestion | null
  existingInstitutionIds: Set<string>
  onJoined: () => Promise<void>
}) {
  const { getToken } = useAuth()
  const [joinKey, setJoinKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const suggestedInstitution = suggestion?.institution ?? null
  const alreadyInSuggested = suggestedInstitution
    ? existingInstitutionIds.has(suggestedInstitution.id)
    : false

  return (
    <div className="space-y-4">
      {suggestedInstitution && !alreadyInSuggested && (
        <div className="bg-[#0a0a0a] border border-green/30 rounded-lg p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-green-light mb-1">
            Suggested for you
          </p>
          <p className="text-[14px] text-[#f5f3ee] mb-3">
            We noticed your email is at{' '}
            <span className="font-mono text-slate-light">@{suggestedInstitution.emailDomain}</span> — looks like
            you're with <strong>{suggestedInstitution.name}</strong>.
          </p>
          <button
            onClick={async () => {
              setErr(null)
              setSubmitting(true)
              try {
                await joinByInstitution(getToken, suggestedInstitution.id)
                await onJoined()
              } catch (e) {
                setErr(e instanceof Error ? e.message : 'Failed to join')
              } finally {
                setSubmitting(false)
              }
            }}
            disabled={submitting}
            className="px-4 py-2 rounded-md bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[13px] font-semibold text-white disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Joining…' : `Join ${suggestedInstitution.name}`}
          </button>
        </div>
      )}

      {suggestedInstitution && alreadyInSuggested && (
        <p className="text-[12px] text-slate-mid italic">You're already a member of {suggestedInstitution.name}.</p>
      )}

      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setErr(null)
          setSubmitting(true)
          try {
            await joinByKey(getToken, joinKey)
            setJoinKey('')
            await onJoined()
          } catch (e) {
            setErr(e instanceof Error ? e.message : 'Failed to join with that key')
          } finally {
            setSubmitting(false)
          }
        }}
      >
        <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-2">
          {suggestedInstitution ? 'Or join with a cohort key' : 'Have a cohort join key?'}
        </p>
        <div className="flex items-center gap-2">
          <input
            required
            value={joinKey}
            onChange={(e) => setJoinKey(e.target.value)}
            placeholder="e.g. fall2026-mba"
            className="flex-1 bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-[#f5f3ee] placeholder:text-white/25 focus:outline-none focus:border-white/30 font-mono"
          />
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-md bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[13px] font-semibold text-white disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {submitting ? 'Joining…' : 'Join'}
          </button>
        </div>
      </form>

      {err && <p className="text-[12px] text-red-400">{err}</p>}
    </div>
  )
}
