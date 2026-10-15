import { useEffect, useRef, useState } from 'react'
import type { CheckpointView } from '@id/types'
import { isSessionEnded, type CheckpointClient } from '@/services/checkpointService'
import { practiceGate } from '@/lib/checkpoint'

/** How often a practice waiting for review is looked at again. */
export const PENDING_POLL_MS = 20_000

const BUTTON =
  'px-4 py-2 rounded-full bg-green hover:bg-green-light text-[13px] font-semibold text-on-primary disabled:opacity-50 transition-colors'

/**
 * A practice slot before its requests can be shown: the practice is being written (asked for on arrival, since the
 * learner already chose this item in the course), is waiting for an instructor, or was sent back.
 */
export function CheckpointPractice({
  view,
  gate,
  client,
  onView,
  onSessionEnded,
}: {
  view: CheckpointView
  gate: 'writing' | 'pending' | 'rejected'
  client: CheckpointClient
  onView: (view: CheckpointView) => void
  onSessionEnded: () => void
}) {
  // Writing starts on arrival, so a 'writing' slot opens already busy (no flash of the button).
  const [busy, setBusy] = useState(gate === 'writing')
  const inFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const skill = view.practice?.skill ?? 'this skill'

  const write = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const next = await client.practice()
      // Still not written (the writer gave up or timed out): say so and offer to ask again.
      if (practiceGate(next) === 'writing') setError('We could not write your practice just now.')
      else onView(next)
    } catch (e) {
      if (isSessionEnded(e)) return onSessionEnded()
      setError((e as Error).message)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  // Once, even under StrictMode's double mount.
  const started = useRef(false)
  useEffect(() => {
    if (gate !== 'writing' || started.current) return
    started.current = true
    void write()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate])

  // While an instructor reviews it, look again now and then; stop once it changes (or the page goes).
  useEffect(() => {
    if (gate !== 'pending') return
    let stopped = false
    const timer = window.setInterval(() => {
      client
        .view()
        .then((next) => {
          if (stopped || practiceGate(next) === 'pending') return
          stopped = true
          window.clearInterval(timer)
          onView(next)
        })
        .catch((e: unknown) => {
          if (stopped || !isSessionEnded(e)) return
          stopped = true
          window.clearInterval(timer)
          onSessionEnded()
        })
    }, PENDING_POLL_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [gate, client, onView, onSessionEnded])

  return (
    <section
      className="grid gap-3 p-5 rounded-xl border border-violet-400/30 bg-violet-400/10"
      aria-live="polite"
      aria-busy={busy}
    >
      <span className="justify-self-start px-2.5 py-0.5 rounded-full bg-violet-400/20 text-violet-400 text-[11px] font-bold">
        Written for you by AI · checked against the data
      </span>
      {busy ? (
        <>
          <p className="text-[15px] font-semibold text-fg">Writing practice for you…</p>
          <p className="text-[14px] text-slate-mid leading-relaxed">
            A few short requests aimed at {skill}. Every answer key is run against the data before
            you see it, so this can take half a minute.
          </p>
          <div
            className="h-2.5 rounded-full bg-violet-400/20 motion-safe:animate-pulse"
            aria-hidden="true"
          />
        </>
      ) : gate === 'pending' ? (
        <p className="text-[14px] text-fg leading-relaxed">
          Your practice on {skill} is written. Your instructor is reviewing it; you will see it here
          once they approve it.
        </p>
      ) : (
        <>
          <p className="text-[14px] text-fg leading-relaxed">
            {error
              ? error
              : gate === 'rejected'
                ? 'Your instructor sent the last practice set back. Ask for a new one.'
                : `Get a few short requests aimed at ${skill}.`}
          </p>
          <div>
            <button type="button" className={BUTTON} onClick={() => void write()}>
              {error ? 'Try again' : 'Write my practice'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
