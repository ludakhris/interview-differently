import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { ClipboardCheck } from 'lucide-react'
import { Nav } from '@/components/Nav'
import { acceptInvite, fetchInviteInfo, type InviteInfo } from '@/services/assessmentsService'

/**
 * Assessment invite landing (#25): /a/<code>.
 *
 * Anyone with the link sees what they're being invited to. Signed-out
 * visitors go through Clerk and come straight back here (sign-up skips
 * /welcome for this path); signed-in visitors are joined to the cohort and
 * dropped into their paper — or their result if they already submitted.
 */

const ACCENT = '#2d9e5f'

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''
}

export function InvitePage() {
  const { code = '' } = useParams()
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const navigate = useNavigate()
  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    fetchInviteInfo(code)
      .then(setInfo)
      .catch((e) => setError(e instanceof Error ? e.message : 'Invalid invite'))
  }, [code])

  // Signed in → accept immediately; no extra click needed.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !info || accepting || error) return
    setAccepting(true)
    acceptInvite(getToken, code)
      .then(({ attemptId, submitted }) =>
        navigate(`/tools/assessments/attempt/${attemptId}${submitted ? '/result' : ''}`, { replace: true }),
      )
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Could not start the assessment')
        setAccepting(false)
      })
  }, [isLoaded, isSignedIn, info, accepting, error, getToken, code, navigate])

  const returnTo = encodeURIComponent(`/a/${code}`)

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Nav />
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md bg-[#111111] rounded-2xl border border-white/10 overflow-hidden">
          <div className="h-1.5 w-full" style={{ backgroundColor: ACCENT }} />
          <div className="p-7">
            {error ? (
              <>
                <p className="text-[12px] font-bold uppercase tracking-widest text-red-400 mb-1">Invite</p>
                <p className="text-[14px] text-[#f5f3ee]">{error}</p>
              </>
            ) : !info ? (
              <p className="text-[13px] text-slate-mid">Loading…</p>
            ) : (
              <>
                <div className="flex items-start gap-3 mb-5">
                  <div
                    className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${ACCENT}22`, color: ACCENT }}
                  >
                    <ClipboardCheck size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: ACCENT }}>
                      {info.label} · {info.institutionName}
                    </p>
                    <h1 className="mt-0.5 font-display font-bold text-[18px] text-[#f5f3ee] leading-snug">{info.title}</h1>
                  </div>
                </div>
                <dl className="text-[12px] space-y-1.5 mb-6">
                  <Row k="Cohort" v={info.cohortName} />
                  <Row k="Questions" v={String(info.questionCount)} />
                  {info.timeLimitMinutes && <Row k="Time limit" v={`${info.timeLimitMinutes} minutes, from when you start`} />}
                  {info.opensAt && <Row k="Opens" v={fmt(info.opensAt)} />}
                  {info.closesAt && <Row k="Closes" v={fmt(info.closesAt)} />}
                </dl>

                {!isLoaded ? (
                  <p className="text-[13px] text-slate-mid">Checking sign-in…</p>
                ) : isSignedIn ? (
                  <p className="text-[13px] text-slate-mid">Joining the cohort and opening your paper…</p>
                ) : !info.isOpen ? (
                  <p className="text-[13px] text-amber-400">This assessment isn't open right now.</p>
                ) : (
                  <>
                    <button
                      onClick={() => navigate(`/sign-in?redirect_url=${returnTo}`)}
                      className="w-full px-4 py-2.5 rounded-md bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[13px] font-semibold text-white transition-colors"
                    >
                      Sign in to begin
                    </button>
                    <button
                      onClick={() => navigate(`/sign-up?redirect_url=${returnTo}`)}
                      className="w-full mt-2 px-4 py-2.5 rounded-md border border-white/15 hover:border-white/30 text-[13px] font-semibold text-[#f5f3ee] transition-colors"
                    >
                      Create an account
                    </button>
                    <p className="text-[11px] text-white/40 mt-3 leading-relaxed">
                      You'll be added to the {info.cohortName} cohort and the assessment will start right away
                      {info.timeLimitMinutes ? ' — the timer begins when your paper opens.' : '.'}
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-white/40">{k}</dt>
      <dd className="text-[#f5f3ee]/85 text-right">{v}</dd>
    </div>
  )
}
