import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { ScoreSummary } from '@/components/ScoreSummary'
import { AttemptReview } from '@/components/AttemptReview'
import { fetchAttemptResult, type StudentResult } from '@/services/assessmentsService'

/**
 * Student result (#25): overall score + per-section bars. The per-question review (their answer,
 * what was wrong, the key) appears only when the delivery allows it: on by default for post
 * assessments, off for pre, because the same bank is reused for the post.
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
                {result.submittedAt &&
                  new Date(result.submittedAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
              </p>
              <h1 className="font-display font-extrabold text-[24px] text-[#f5f3ee] tracking-tight">
                {result.title}
              </h1>
            </div>

            <ScoreSummary overall={result.overall} sections={result.sections} />

            {result.review && (
              <div className="mt-6">
                <AttemptReview review={result.review} />
              </div>
            )}

            <div className="mt-6">
              <button
                onClick={() => navigate('/tools/assessments')}
                className="text-[12px] text-slate-mid hover:text-[#f5f3ee] transition-colors"
              >
                ← Back to assessments
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
