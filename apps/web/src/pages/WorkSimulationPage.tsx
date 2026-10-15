import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import type { CheckpointView } from '@id/types'
import { Nav } from '@/components/Nav'
import { CheckpointScreen } from '@/components/checkpoint/CheckpointScreen'
import { isSessionEnded, standaloneCheckpointClient } from '@/services/checkpointService'

type Load =
  | { state: 'loading' }
  | { state: 'failed'; message: string }
  | { state: 'ended' }
  | { state: 'ready'; view: CheckpointView }

/**
 * /simulations/:deliveryId — a work simulation in standalone Interview Differently (GitHub issue #90): the same chat
 * a course opens by LTI, for the signed-in learner, with the site's own nav. Opened from the dashboard, which starts
 * it and gets the delivery. It is recorded in the Interview Differently Standalone cohort; no score goes anywhere.
 */
export function WorkSimulationPage() {
  const { deliveryId = '' } = useParams<{ deliveryId: string }>()
  const { getToken } = useAuth()
  // The latest token getter, without making a new client (and loading again) when Clerk hands over a new one.
  const token = useRef(getToken)
  token.current = getToken
  const client = useMemo(
    () => standaloneCheckpointClient(deliveryId, () => token.current()),
    [deliveryId]
  )
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [tries, setTries] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoad({ state: 'loading' })
    client
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
  }, [client, tries])

  const onView = useCallback((view: CheckpointView) => setLoad({ state: 'ready', view }), [])
  const onSessionEnded = useCallback(() => setLoad({ state: 'ended' }), [])

  let body: React.ReactNode
  if (load.state === 'ended') {
    body = (
      <Notice>
        You are signed out. Sign in and open it again from your dashboard.{' '}
        <Link to="/dashboard" className="text-green-light underline font-semibold">
          Back to your dashboard
        </Link>
      </Notice>
    )
  } else if (load.state === 'failed') {
    body = (
      <Notice>
        <span className="block mb-4">We could not open this simulation. {load.message}</span>
        <button
          type="button"
          onClick={() => setTries((n) => n + 1)}
          className="px-4 py-2 rounded-full bg-green hover:bg-green-light text-[13px] font-semibold text-on-primary transition-colors"
        >
          Retry
        </button>
      </Notice>
    )
  } else if (load.state === 'loading') {
    body = <Notice muted>Opening your simulation…</Notice>
  } else {
    body = (
      <CheckpointScreen
        view={load.view}
        client={client}
        framed={false}
        standalone
        onView={onView}
        onSessionEnded={onSessionEnded}
      />
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      <Nav />
      <main className="max-w-6xl mx-auto px-6 py-8">{body}</main>
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
