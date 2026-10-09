import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AssessmentAttemptPage } from '@/pages/AssessmentAttemptPage'
import { LtiNav } from '@/components/LtiNav'
import { LtiBrandProvider } from '@/components/LtiBrandProvider'
import { captureLtiSession, getLtiReturnUrl, preferLtiToken } from '@/services/ltiSession'
import { completeLtiAssessment, fetchLtiToolSession } from '@/services/ltiService'
import { LtiScoreSent } from '@/components/LtiScoreSent'
import { AttemptReview } from '@/components/AttemptReview'
import { ScoreSummary } from '@/components/ScoreSummary'
import { fetchAttemptResult, startAttempt, type StudentResult } from '@/services/assessmentsService'
import { applyBrand, NO_BRAND, type AppliedBrand } from '@/lib/brand'

/** How long the first screen waits for the brand before showing the default look. */
const BRAND_WAIT_MS = 3000

// The LTI session token is the only credential; there is no Clerk fallback on this route.
const ltiToken = preferLtiToken(() => Promise.resolve(null))

/**
 * /lti/assessment/:deliveryId — takes one assessment for a learner launched from LearnDifferently.
 * No Clerk session: the fragment token is the credential. After the server grades the attempt the
 * score is sent back to the course and the browser returns there; ID's own result page is never shown.
 */
export function LtiAssessmentPage() {
  const [token] = useState(() => captureLtiSession())
  const [brand, setBrand] = useState<AppliedBrand | null>(null)
  const [review, setReview] = useState(false)

  // The brand is re-validated here; a failed or slow call just means the default look.
  useEffect(() => {
    if (!token) {
      setBrand(NO_BRAND)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => !cancelled && setBrand((b) => b ?? NO_BRAND), BRAND_WAIT_MS)
    fetchLtiToolSession()
      .then((s) => {
        if (cancelled) return
        setReview(s.review === true)
        setBrand((b) => b ?? applyBrand(s.brand))
      })
      .catch(() => !cancelled && setBrand(NO_BRAND))
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [token])

  // Nothing is drawn until the brand is known, so a tenant never sees a flash of the default look.
  if (!brand) return <div className="min-h-screen" />
  return (
    <LtiBrandProvider brand={brand}>
      {review ? <LtiReview token={token} /> : <LtiAssessment token={token} />}
    </LtiBrandProvider>
  )
}

function Message({
  children,
  label = 'Assessment',
}: {
  children: React.ReactNode
  label?: string
}) {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <LtiNav trackLabel={label} />
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md">{children}</div>
      </div>
    </div>
  )
}

const BUTTON =
  'px-4 py-2 rounded-md bg-green hover:bg-green-light text-[13px] font-semibold text-on-primary disabled:opacity-50 transition-colors'

/**
 * Opened from the course after the learner used all their attempts: shows the submitted attempt's
 * answers. Nothing is started or resent; the session cannot do either.
 */
function LtiReview({ token }: { token: string | null }) {
  const { deliveryId } = useParams<{ deliveryId: string }>()
  const [result, setResult] = useState<StudentResult | null>(null)
  const [failed, setFailed] = useState(false)
  const courseUrl = getLtiReturnUrl()

  useEffect(() => {
    if (!token || !deliveryId) return
    startAttempt(ltiToken, deliveryId)
      .then(({ id }) => fetchAttemptResult(ltiToken, id))
      .then(setResult)
      .catch(() => setFailed(true))
  }, [token, deliveryId])

  if (!token || !deliveryId || failed) {
    return (
      <Message label="Answers">
        <p className="text-fg text-[15px] mb-4">
          We could not open the answers. Go back to your course and try again.
        </p>
        {courseUrl && (
          <a href={courseUrl} className="text-green underline font-semibold text-[14px]">
            Back to your course
          </a>
        )}
      </Message>
    )
  }
  if (!result) {
    return (
      <Message label="Your answers">
        <p className="text-slate-mid text-[14px]">Opening your answers…</p>
      </Message>
    )
  }
  return (
    <div className="min-h-screen bg-surface">
      <LtiNav trackLabel="Your answers" />
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-baseline justify-between gap-4 mb-6">
          <h1 className="font-display font-extrabold text-[22px] text-fg tracking-tight">
            {result.learner ? `Answers · ${result.learner}` : 'Your answers'} ·{' '}
            {result.overall.percent}%
          </h1>
          {courseUrl && (
            <a href={courseUrl} className="text-green underline font-semibold text-[13px]">
              {result.learner ? 'Back to the cohort' : 'Back to your course'}
            </a>
          )}
        </div>
        <ScoreSummary overall={result.overall} sections={result.sections} />
        {result.review ? (
          <AttemptReview review={result.review} />
        ) : (
          <p className="text-slate-mid text-[14px]">There are no answers to show.</p>
        )}
      </div>
    </div>
  )
}

type Phase = 'starting' | 'taking' | 'sending'

function LtiAssessment({ token }: { token: string | null }) {
  const { deliveryId } = useParams<{ deliveryId: string }>()
  const [phase, setPhase] = useState<Phase>('starting')
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const begin = async () => {
    if (!deliveryId || starting) return
    setStarting(true)
    setStartError(null)
    try {
      // starts the attempt, or resumes the one already open for this learner
      const { id } = await startAttempt(ltiToken, deliveryId)
      setAttemptId(id)
      setPhase('taking')
    } catch {
      setStartError('We could not start your assessment.')
    } finally {
      setStarting(false)
    }
  }

  const onSubmitted = useCallback(() => setPhase('sending'), [])

  // The learner already chose to start in the course, so the attempt starts (or resumes) on arrival.
  const started = useRef(false)
  useEffect(() => {
    if (!token || !deliveryId || started.current) return
    started.current = true
    void begin()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, deliveryId])

  if (!token || !deliveryId) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-6">
        <p className="text-fg text-[15px] text-center max-w-md">
          This page opens from your course. Go back to your course and start again.
        </p>
      </div>
    )
  }

  if (phase === 'taking' && attemptId) {
    return <AssessmentAttemptPage ltiMode ltiAttemptId={attemptId} onSubmitted={onSubmitted} />
  }
  if (phase === 'sending' && attemptId) return <ScoreHandoff attemptId={attemptId} />

  return (
    <Message>
      {startError ? (
        <>
          <p className="text-red-400 text-[13px] mb-4">{startError}</p>
          <button onClick={() => void begin()} disabled={starting} className={BUTTON}>
            {starting ? 'Starting…' : 'Retry'}
          </button>
        </>
      ) : (
        <p className="text-slate-mid text-[14px]">Starting your assessment…</p>
      )}
    </Message>
  )
}

/** Sends the graded attempt's score to the course, then returns the browser there. */
function ScoreHandoff({ attemptId }: { attemptId: string }) {
  const [tries, setTries] = useState(0)
  const [status, setStatus] = useState<'sending' | 'error' | 'sent'>('sending')
  const [courseUrl, setCourseUrl] = useState<string | null>(null)
  const ranFor = useRef(-1)

  useEffect(() => {
    if (ranFor.current === tries) return // StrictMode double-mount: one call per try
    ranFor.current = tries
    setStatus('sending')
    completeLtiAssessment(attemptId)
      .then((r) => {
        if (!r.ok) return setStatus('error')
        if (r.navigateTo) {
          window.location.assign(r.navigateTo)
        } else {
          setCourseUrl(r.courseUrl) // already sent earlier and no link given
          setStatus('sent')
        }
      })
      .catch(() => setStatus('error'))
  }, [attemptId, tries])

  return (
    <Message>
      {status === 'error' ? (
        <>
          <p className="text-fg text-[15px] mb-5">We could not send your score.</p>
          <button onClick={() => setTries((n) => n + 1)} className={BUTTON}>
            Retry
          </button>
        </>
      ) : status === 'sent' ? (
        <LtiScoreSent courseUrl={courseUrl} />
      ) : (
        <p className="text-slate-mid text-[14px]">Sending your score...</p>
      )}
    </Message>
  )
}
