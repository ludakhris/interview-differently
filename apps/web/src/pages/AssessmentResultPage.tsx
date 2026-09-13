import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { ScoreRing } from '@/components/ScoreRing'
import { fetchAttemptResult, type StudentResult } from '@/services/assessmentsService'

/**
 * Student result (#25): overall score + per-section bars. Deliberately no
 * per-question breakdown — the same bank is reused for the post-assessment.
 */
export function AssessmentResultPage() {
  const { attemptId = '' } = useParams()
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [result, setResult] = useState<StudentResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAttemptResult(getToken, attemptId)
      .then(setResult)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load result'))
  }, [getToken, attemptId])

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav trackLabel="Assessment" stepLabel="Result" />
      <div className="max-w-3xl mx-auto px-6 py-12">
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 mb-4">
            <p className="text-[13px] text-red-400">{error}</p>
          </div>
        )}
        {!result ? (
          !error && <p className="text-[13px] text-slate-mid">Loading…</p>
        ) : (
          <>
            <div className="mb-8">
              <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-1">
                {result.label} · submitted{' '}
                {result.submittedAt && new Date(result.submittedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
              <h1 className="font-display font-extrabold text-[24px] text-[#f5f3ee] tracking-tight">{result.title}</h1>
            </div>

            <div className="bg-[#111111] rounded-2xl border border-white/10 p-6 flex items-center gap-6 mb-6">
              <ScoreRing score={result.overall.percent} size={96} label="%" />
              <div>
                <p className="font-display font-extrabold text-[28px] text-[#f5f3ee] leading-none">
                  {result.overall.correct}
                  <span className="text-white/30 text-[18px]"> / {result.overall.total}</span>
                </p>
                <p className="text-[13px] text-slate-mid mt-1">questions correct overall</p>
              </div>
            </div>

            <div className="bg-[#111111] rounded-2xl border border-white/10 p-6">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid mb-4">By section</p>
              <ul className="space-y-4">
                {result.sections.map((s) => {
                  const pct = s.total ? Math.round((s.correct / s.total) * 100) : 0
                  return (
                    <li key={s.sectionId}>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <p className="text-[13px] font-semibold text-[#f5f3ee]">{s.title}</p>
                        <p className="font-mono text-[12px] text-slate-light">
                          {s.correct}/{s.total} · {pct}%
                        </p>
                      </div>
                      <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: pct >= 70 ? '#2d9e5f' : pct >= 40 ? '#d4830a' : '#ef4444' }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className="mt-6">
              <button onClick={() => navigate('/tools/assessments')} className="text-[12px] text-slate-mid hover:text-[#f5f3ee] transition-colors">
                ← Back to assessments
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
