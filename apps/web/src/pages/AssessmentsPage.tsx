import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { ClipboardCheck } from 'lucide-react'
import { Nav } from '@/components/Nav'
import { fetchMyAssessments, startAttempt, type MyDelivery } from '@/services/assessmentsService'

/**
 * Student list of assessment deliveries (#25). One card per delivery with
 * its window, size, and the caller's attempt state → Start / Continue /
 * View result.
 */

const ACCENT = '#2d9e5f'

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''
}

export function AssessmentsPage() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<MyDelivery[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState<string | null>(null)

  useEffect(() => {
    fetchMyAssessments(getToken)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load assessments'))
  }, [getToken])

  const start = async (d: MyDelivery) => {
    setStarting(d.id)
    setError(null)
    try {
      const { id } = await startAttempt(getToken, d.id)
      navigate(`/tools/assessments/attempt/${id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start')
      setStarting(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav trackLabel="Assessments" />
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-1">Tools</p>
          <h1 className="font-display font-extrabold text-[24px] text-[#f5f3ee] tracking-tight">Assessments</h1>
          <p className="text-[13px] text-slate-mid mt-1">
            One attempt per assessment. Answers save as you go; submit when you're done or when the timer runs out.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 mb-4">
            <p className="text-[13px] text-red-400">{error}</p>
          </div>
        )}

        {!items ? (
          <p className="text-[13px] text-slate-mid">Loading…</p>
        ) : items.length === 0 ? (
          <div className="bg-[#111111] rounded-xl border border-white/10 px-6 py-12 text-center">
            <p className="text-[13px] text-slate-mid">Nothing scheduled for your cohort yet.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((d) => {
              const submitted = !!d.attempt?.submittedAt
              const inProgress = !!d.attempt && !submitted
              const now = Date.now()
              const notYet = d.opensAt && now < new Date(d.opensAt).getTime()
              return (
                <li key={d.id} className="bg-[#111111] rounded-2xl border border-white/10 overflow-hidden">
                  <div className="h-1.5 w-full" style={{ backgroundColor: ACCENT }} />
                  <div className="p-5 flex items-start gap-4">
                    <div
                      className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${ACCENT}22`, color: ACCENT }}
                    >
                      <ClipboardCheck size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: ACCENT }}>
                        {d.label} · {d.cohortName ?? "cohort removed"}
                      </p>
                      <h3 className="mt-0.5 font-display font-bold text-[16px] text-[#f5f3ee] leading-snug">{d.title}</h3>
                      <p className="text-[12px] text-slate-mid mt-1">
                        {d.questionCount} questions
                        {d.timeLimitMinutes && <> · {d.timeLimitMinutes} min limit</>}
                        {d.opensAt && <> · opens {fmt(d.opensAt)}</>}
                        {d.closesAt && <> · closes {fmt(d.closesAt)}</>}
                      </p>
                      {submitted && (
                        <p className="text-[12px] text-white/40 mt-1">Submitted {fmt(d.attempt!.submittedAt)}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {submitted ? (
                        <button
                          onClick={() => navigate(`/tools/assessments/attempt/${d.attempt!.id}/result`)}
                          className="px-3 py-1.5 rounded-md border border-white/15 hover:border-white/30 text-[12px] font-semibold text-[#f5f3ee] transition-colors"
                        >
                          View result
                        </button>
                      ) : inProgress ? (
                        <button
                          onClick={() => navigate(`/tools/assessments/attempt/${d.attempt!.id}`)}
                          className="px-3 py-1.5 rounded-md bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[12px] font-semibold text-white transition-colors"
                        >
                          Continue →
                        </button>
                      ) : d.isOpen ? (
                        <button
                          onClick={() => start(d)}
                          disabled={starting === d.id}
                          className="px-3 py-1.5 rounded-md bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[12px] font-semibold text-white disabled:opacity-50 transition-colors"
                        >
                          {starting === d.id ? 'Starting…' : 'Start'}
                        </button>
                      ) : (
                        <span className="text-[11px] uppercase tracking-widest text-white/30">{notYet ? 'Not open yet' : 'Closed'}</span>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
