import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { MembershipsCard } from '@/components/MembershipsCard'
import { fetchConfig, patchAdminConfig } from '@/services/configService'

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

export function SettingsPage() {
  const navigate = useNavigate()
  const { user } = useUser()
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
      await patchAdminConfig(key, String(value))
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
          <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-1">Settings</p>
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

        {/* Admin-only sections */}
        {isAdmin && (
          <>
            <div className="bg-[#111111] rounded-xl border border-white/10 px-6 mb-4">
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

            <div className="bg-[#111111] rounded-xl border border-white/10 px-6">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid pt-5 pb-3">
                Organisation
              </p>
              <button
                onClick={() => navigate('/admin/institutions')}
                className="w-full flex items-center justify-between py-5 border-b border-white/10 last:border-0 group text-left"
              >
                <div>
                  <p className="text-[14px] font-semibold text-[#f5f3ee] group-hover:text-white transition-colors">
                    Institutions &amp; cohorts
                  </p>
                  <p className="text-[12px] text-slate-mid mt-0.5">
                    Manage institutions, cohorts, and student membership.
                  </p>
                </div>
                <span className="text-[13px] font-semibold text-green-light group-hover:translate-x-1 transition-transform">
                  Manage →
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
