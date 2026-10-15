import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { CheckpointView } from '@id/types'
import { LtiNav } from '@/components/LtiNav'
import { LtiBrandProvider } from '@/components/LtiBrandProvider'
import { CheckpointScreen } from '@/components/checkpoint/CheckpointScreen'
import { captureLtiSession, getLtiReturnUrl } from '@/services/ltiSession'
import { fetchLtiToolSession } from '@/services/ltiService'
import { isSessionEnded, ltiCheckpointClient } from '@/services/checkpointService'
import { isFramed, postToParent, progress } from '@/lib/checkpoint'
import { applyBrand, NO_BRAND, type AppliedBrand } from '@/lib/brand'

/** How long the first screen waits for the brand before showing the default look. */
const BRAND_WAIT_MS = 3000

/**
 * /lti/checkpoint/:deliveryId — a chat checkpoint launched from the LMS (GitHub issue #90), usually inside an
 * iframe on the course page. No Clerk session: the fragment token is the credential, and the session (not the
 * URL) says which checkpoint and learner this is. In a frame the LMS page is the chrome, so there is no nav, and
 * the page reports its height so the LMS can size the frame.
 */
export function LtiCheckpointPage() {
  const [token] = useState(() => captureLtiSession())
  const [framed] = useState(() => isFramed())
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
  if (!brand) return <div className={framed ? '' : 'min-h-screen'} />
  return (
    <LtiBrandProvider brand={brand}>
      <LtiCheckpoint token={token} framed={framed} />
    </LtiBrandProvider>
  )
}

/** Posts the page's height to the LMS page around the frame whenever it changes. */
function useFrameHeight(framed: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!framed || !el || typeof ResizeObserver === 'undefined') return
    let last = -1
    const report = () => {
      const height = Math.ceil(el.getBoundingClientRect().height)
      if (height === last) return
      last = height
      postToParent({ subject: 'id.checkpoint.resize', height })
    }
    const observer = new ResizeObserver(report)
    observer.observe(el)
    report()
    return () => observer.disconnect()
  }, [framed])
  return ref
}

type Load =
  | { state: 'loading' }
  | { state: 'failed'; message: string }
  | { state: 'ended' }
  | { state: 'ready'; view: CheckpointView }

function LtiCheckpoint({ token, framed }: { token: string | null; framed: boolean }) {
  const { deliveryId } = useParams<{ deliveryId: string }>()
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [tries, setTries] = useState(0)
  const root = useFrameHeight(framed)

  useEffect(() => {
    if (!token || !deliveryId) return
    let cancelled = false
    setLoad({ state: 'loading' })
    ltiCheckpointClient
      .view()
      .then((view) => !cancelled && setLoad({ state: 'ready', view }))
      .catch((e: unknown) => {
        if (cancelled) return
        setLoad(
          isSessionEnded(e)
            ? { state: 'ended' }
            : { state: 'failed', message: (e as Error).message }
        )
      })
    return () => {
      cancelled = true
    }
  }, [token, deliveryId, tries])

  const onView = useCallback((view: CheckpointView) => setLoad({ state: 'ready', view }), [])
  const onSessionEnded = useCallback(() => setLoad({ state: 'ended' }), [])

  const view = load.state === 'ready' ? load.view : null
  const counts = view && view.tasks.length > 0 ? progress(view) : null
  const courseUrl = framed ? null : getLtiReturnUrl()

  let body: React.ReactNode
  if (!token || !deliveryId) {
    body = (
      <Notice>This page opens from your course. Go back to your course and open it again.</Notice>
    )
  } else if (load.state === 'ended') {
    body = (
      <Notice>
        Your session has ended. Go back to your course and open this checkpoint again.
        {courseUrl && (
          <>
            {' '}
            <a href={courseUrl} className="text-green-light underline font-semibold">
              Back to your course
            </a>
          </>
        )}
      </Notice>
    )
  } else if (load.state === 'failed') {
    body = (
      <Notice>
        <span className="block mb-4">We could not open this checkpoint. {load.message}</span>
        <button
          type="button"
          onClick={() => setTries((n) => n + 1)}
          className="px-4 py-2 rounded-full bg-green hover:bg-green-light text-[13px] font-semibold text-on-primary transition-colors"
        >
          Retry
        </button>
      </Notice>
    )
  } else if (!view) {
    body = <Notice muted>Opening your checkpoint…</Notice>
  } else {
    body = (
      <CheckpointScreen
        view={view}
        client={ltiCheckpointClient}
        framed={framed}
        onView={onView}
        onSessionEnded={onSessionEnded}
      />
    )
  }

  return (
    <div ref={root} className={`bg-surface ${framed ? '' : 'min-h-screen'}`}>
      {!framed && (
        <LtiNav
          trackLabel="Checkpoint"
          stepLabel={counts ? `${counts.answered}/${counts.total}` : undefined}
        />
      )}
      <main className={framed ? 'p-3' : 'max-w-6xl mx-auto px-6 py-8'}>{body}</main>
    </div>
  )
}

function Notice({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-center justify-center px-6 py-16">
      <p
        className={`text-center max-w-md ${muted ? 'text-slate-mid text-[14px]' : 'text-fg text-[15px]'}`}
        role="status"
      >
        {children}
      </p>
    </div>
  )
}
