import { useState } from 'react'
import { useClerk } from '@clerk/clerk-react'
import { Link } from 'react-router-dom'
import { useConsents } from '@/hooks/useConsents'

/**
 * Blocks the app behind acceptance of the current Terms and Privacy Policy.
 * Covers new sign-ups and (because versions are compared) existing users
 * whenever the documents change. Wrap signed-in routes with it.
 */
export function ConsentGate({ children }: { children: React.ReactNode }) {
  const { status, loadFailed, accept } = useConsents()
  const { signOut } = useClerk()
  const [checked, setChecked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loadFailed) return <>{children}</> // fail open on outage; API enforces what matters
  if (!status) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-slate-mid text-[14px]">Loading...</p>
      </div>
    )
  }
  if (status.accepted.terms && status.accepted.privacy) return <>{children}</>

  async function onAccept() {
    setSaving(true)
    setError(null)
    try {
      await accept(['terms', 'privacy'])
    } catch {
      setError('Could not save your acceptance. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        className="max-w-md w-full bg-[#111111] rounded-xl border border-white/10 p-6"
      >
        <h1 id="consent-title" className="font-display font-bold text-[18px] text-[#f5f3ee] mb-2">
          Before you continue
        </h1>
        <p className="text-[13px] text-slate-light leading-relaxed mb-4">
          Please review and accept our terms. Interview Differently uses AI to score your practice
          answers; results are not hiring decisions.
        </p>
        <label className="flex items-start gap-3 text-[13px] text-slate-light mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            I have read and agree to the{' '}
            <Link to="/terms" target="_blank" className="text-green-light underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" target="_blank" className="text-green-light underline">
              Privacy Policy
            </Link>
            , including binding arbitration.
          </span>
        </label>
        {error && <p className="text-[12px] text-red-400 mb-3">{error}</p>}
        <div className="flex items-center justify-between">
          <button
            onClick={() => void signOut({ redirectUrl: '/' })}
            className="text-[12px] text-slate-mid hover:text-[#f5f3ee]"
          >
            Sign out
          </button>
          <button
            onClick={() => void onAccept()}
            disabled={!checked || saving}
            className="px-5 py-2 rounded-lg bg-green hover:bg-green/90 disabled:opacity-40 text-white text-[14px] font-medium"
          >
            {saving ? 'Saving…' : 'Accept and continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
