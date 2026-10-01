import { useEffect, useState } from 'react'
import { useAuth, useClerk, useUser } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { MembershipsCard } from '@/components/MembershipsCard'
import { fetchConfig, patchAdminConfig } from '@/services/configService'
import { deleteMyAccount, downloadMyData } from '@/services/accountService'

/**
 * Settings page — visible to any signed-in user.
 *
 *   - "Your memberships" (everyone): list institutions/cohorts the user
 *     belongs to, with Leave + an inline join form (suggestion + key).
 *   - "Evaluation" (admin only): the existing AI feedback toggle.
 *   - "Organisation" (admin only): link into /admin/institutions.
 */

interface ToggleRowProps {
  label: string
  description: string
  checked: boolean
  saving: boolean
  onChange: (val: boolean) => void
}

function ToggleRow({ label, description, checked, saving, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between py-5 border-b border-white/10 last:border-0">
      <div>
        <p className="text-[14px] font-semibold text-[#f5f3ee]">{label}</p>
        <p className="text-[12px] text-slate-mid mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        disabled={saving}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
          checked ? 'bg-green' : 'bg-white/15'
        } ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        aria-pressed={checked}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

/** Self-service export + erasure (GDPR/CCPA). Deletion needs the word DELETE typed — no Enter-to-confirm. */
function YourDataCard() {
  const { getToken } = useAuth()
  const { signOut } = useClerk()
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null)
  const [typed, setTyped] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  async function onExport() {
    setBusy('export')
    setMsg(null)
    try {
      await downloadMyData(getToken)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Export failed. Try again.')
    } finally {
      setBusy(null)
    }
  }

  async function onDelete() {
    setBusy('delete')
    setMsg(null)
    try {
      await deleteMyAccount(getToken)
      await signOut({ redirectUrl: '/' })
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Deletion failed. Try again.')
      setBusy(null)
    }
  }

  return (
    <div className="bg-[#111111] rounded-xl border border-white/10 p-6 mb-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid mb-4">
        Your data
      </p>
      <div className="flex items-center justify-between gap-4 pb-5 border-b border-white/10">
        <div>
          <p className="text-[14px] font-semibold text-[#f5f3ee]">Download my data</p>
          <p className="text-[12px] text-slate-mid mt-0.5">
            A JSON file with your profile, results, answers, transcripts and recording links.
          </p>
        </div>
        <button
          onClick={() => void onExport()}
          disabled={busy !== null}
          className="shrink-0 px-4 py-2 rounded-lg border border-white/10 text-[13px] text-[#f5f3ee] hover:bg-white/5 disabled:opacity-40"
        >
          {busy === 'export' ? 'Preparing…' : 'Download'}
        </button>
      </div>
      <div className="pt-5">
        <p className="text-[14px] font-semibold text-red-400">Delete my account</p>
        <p className="text-[12px] text-slate-mid mt-0.5 mb-3">
          Permanently deletes your account, results, answers, recordings and memberships. This
          cannot be undone. Type DELETE to confirm.
        </p>
        <div className="flex gap-3">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="DELETE"
            aria-label="Type DELETE to confirm account deletion"
            className="flex-1 bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-[#f5f3ee]"
          />
          <button
            onClick={() => void onDelete()}
            disabled={typed !== 'DELETE' || busy !== null}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[13px] font-medium disabled:opacity-40"
          >
            {busy === 'delete' ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </div>
      {msg && <p className="text-[12px] text-red-400 mt-3">{msg}</p>}
    </div>
  )
}

export function SettingsPage() {
  const { user } = useUser()
  const { getToken } = useAuth()
  const isAdmin = user?.publicMetadata?.role === 'admin'

  const [aiFeedbackEnabled, setAiFeedbackEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [adminConfigLoaded, setAdminConfigLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAdmin) return
    fetchConfig()
      .then((cfg) => {
        setAiFeedbackEnabled(cfg.aiFeedbackEnabled)
        setAdminConfigLoaded(true)
      })
      .catch(() => setAdminConfigLoaded(true))
  }, [isAdmin])

  async function handleToggle(key: string, value: boolean) {
    setSaving(true)
    setError(null)
    try {
      await patchAdminConfig(getToken, key, String(value))
      if (key === 'ai_feedback_enabled') setAiFeedbackEnabled(value)
    } catch {
      setError('Failed to save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav />
      <div className="max-w-2xl mx-auto px-6 py-12 animate-fade-in">
        <div className="mb-8">
          <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-1">
            Settings
          </p>
          <h1 className="font-display font-extrabold text-[24px] text-[#f5f3ee] tracking-tight">
            Your account
          </h1>
        </div>

        {error && <p className="text-[13px] text-red-400 mb-4">{error}</p>}

        {/* Memberships — everyone */}
        <div className="bg-[#111111] rounded-xl border border-white/10 p-6 mb-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid mb-4">
            Your memberships
          </p>
          <MembershipsCard variant="settings" />
        </div>

        <YourDataCard />

        {/* Admin-only sections */}
        {isAdmin && (
          <>
            <div className="bg-[#111111] rounded-xl border border-white/10 px-6">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid pt-5 pb-3">
                Evaluation
              </p>
              {!adminConfigLoaded ? (
                <p className="text-[13px] text-slate-mid pb-5">Loading…</p>
              ) : (
                <ToggleRow
                  label="AI-generated feedback"
                  description="After each simulation, call Claude to generate personalised per-dimension coaching. Falls back to template feedback when off."
                  checked={aiFeedbackEnabled}
                  saving={saving}
                  onChange={(val) => handleToggle('ai_feedback_enabled', val)}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
