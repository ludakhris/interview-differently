import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AssessmentAttemptPage } from '@/pages/AssessmentAttemptPage'
import { LtiNav } from '@/components/LtiNav'
import { LtiBrandProvider } from '@/components/LtiBrandProvider'
import { captureLtiSession, preferLtiToken } from '@/services/ltiSession'
import { completeLtiAssessment, fetchLtiToolSession } from '@/services/ltiService'
import { startAttempt } from '@/services/assessmentsService'
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

  // The brand is re-validated here; a failed or slow call just means the default look.
  useEffect(() => {
    if (!token) {
      setBrand(NO_BRAND)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => !cancelled && setBrand((b) => b ?? NO_BRAND), BRAND_WAIT_MS)
    fetchLtiToolSession()
      .then((s) => !cancelled && setBrand((b) => b ?? applyBrand(s.brand)))
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
      <LtiAssessment token={token} />
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

type Phase = 'intro' | 'taking' | 'sending'

function LtiAssessment({ token }: { token: string | null }) {
  const { deliveryId } = useParams<{ deliveryId: string }>()
  const [phase, setPhase] = useState<Phase>('intro')
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
      <h1 className="font-display font-extrabold text-[22px] text-fg tracking-tight mb-3">
        Your assessment
      </h1>
      <p className="text-slate-mid text-[14px] leading-relaxed mb-6">
        Answers save as you go. When you submit, your score is sent back to your course.
      </p>
      {startError && <p className="text-red-400 text-[13px] mb-4">{startError}</p>}
      <button onClick={() => void begin()} disabled={starting} className={BUTTON}>
        {starting ? 'Starting…' : startError ? 'Retry' : 'Start assessment'}
      </button>
    </Message>
  )
}

/** Sends the graded attempt's score to the course, then returns the browser there. */
function ScoreHandoff({ attemptId }: { attemptId: string }) {
  const [tries, setTries] = useState(0)
  const [status, setStatus] = useState<'sending' | 'error' | 'sent'>('sending')
  const ranFor = useRef(-1)

  useEffect(() => {
    if (ranFor.current === tries) return // StrictMode double-mount: one call per try
    ranFor.current = tries
    setStatus('sending')
    completeLtiAssessment(attemptId)
      .then((r) => {
        if (!r.ok) return setStatus('error')
        if (r.returnUrl) window.location.assign(r.returnUrl)
        else setStatus('sent') // already sent earlier and no link given
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
        <p className="text-fg text-[15px]">
          Your score was already sent. Go back to your course to continue.
        </p>
      ) : (
        <p className="text-slate-mid text-[14px]">Sending your score...</p>
      )}
    </Message>
  )
}
