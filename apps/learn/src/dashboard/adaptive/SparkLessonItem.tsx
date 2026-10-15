import type { LearnerItem, LessonSlot } from '@id/types'
import { useEffect, useRef, useState } from 'react'
import { useApiSend, useLoad } from '../api'

const MIN_HEIGHT = 420
const MAX_HEIGHT = 1600

/**
 * A short lesson made for the learner's gap (GitHub issue #90): Spark writes it (or reuses an approved one) and plays it
 * in its own player, embedded here with a signed link. When the player says the lesson ended, the LMS asks Spark and
 * completes the item by its own rule. Like any lesson it is not evidence of the skill.
 */
export function SparkLessonItem(props: {
  item: LearnerItem
  onChange: (i: LearnerItem) => void
  nextHref: string
  nextLabel: string
}) {
  const { item } = props
  const send = useApiSend()
  const base = `/learn/me/cohorts/${item.cohortId}/items/${item.id}/adaptive/lesson`
  const loaded = useLoad<LessonSlot>(base)
  const [slot, setSlot] = useState<LessonSlot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [height, setHeight] = useState(MIN_HEIGHT)
  const frame = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    if (loaded.data) setSlot(loaded.data)
  }, [loaded.data])
  // Once Spark has made the lesson, the page goes by its title.
  const { onChange } = props
  useEffect(() => {
    if (slot?.title && slot.title !== item.title) onChange({ ...item, title: slot.title })
  }, [slot?.title, item, onChange])
  // While staff review the lesson, look again now and then, so it appears once approved.
  const pending = slot?.status === 'pending'
  const reload = loaded.reload
  useEffect(() => {
    if (!pending) return
    const t = window.setInterval(reload, 20_000)
    return () => window.clearInterval(t)
  }, [pending, reload])

  // The player says when the lesson ended and how tall it is.
  const playerOrigin = slot?.url ? new URL(slot.url).origin : null
  useEffect(() => {
    if (!playerOrigin) return
    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== playerOrigin || e.source !== frame.current?.contentWindow) return
      if (typeof e.data !== 'object' || e.data === null) return
      const msg = e.data as { subject?: unknown; height?: unknown }
      if (msg.subject === 'spark.lesson.resize' && typeof msg.height === 'number')
        setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(msg.height) + 8)))
      if (msg.subject === 'spark.lesson.finished') {
        try {
          setSlot(await send<LessonSlot>('POST', `${base}/sync`))
        } catch {
          // Shown as not done yet; the course page reads it again later.
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [playerOrigin, base, send])

  async function make() {
    setBusy(true)
    setError(null)
    try {
      setSlot(await send<LessonSlot>('POST', base))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // A failed look-again while pending keeps the last good card; the error shows only before there is one.
  if (!slot)
    return loaded.error ? (
      <p className="dash-error">{loaded.error.message}</p>
    ) : (
      <p className="dash-loading">Loading…</p>
    )

  return (
    <div className="ad ad-embed">
      <p className="ad-made-for-you">
        Made and customized for you, based on your course activity so far.
      </p>
      {slot.status === 'ready' && slot.url ? (
        <iframe
          ref={frame}
          src={slot.url}
          title={slot.title ?? item.title}
          className="ad-embed-frame"
          style={{ height }}
          allow="autoplay"
        />
      ) : (
        <section className="dash-card ad-lesson-slot" aria-live="polite">
          <h2 className="dash-card-title">A short video on {slot.skillLabel}</h2>
          {slot.status === 'none' && (
            <>
              <p className="dash-muted">
                About a minute and a half, aimed at what you missed. It takes a moment to make.
              </p>
              <button type="button" className="dash-btn" disabled={busy} onClick={make}>
                {busy ? 'Making your video…' : 'Make my video'}
              </button>
            </>
          )}
          {slot.status === 'pending' && (
            <p className="dash-muted">
              Your video is ready and your instructor is checking it first. You can carry on with
              the course meanwhile.
            </p>
          )}
          {slot.status === 'rejected' && (
            <>
              <p className="dash-muted">Your instructor sent that video back. Make a new one.</p>
              <button type="button" className="dash-btn" disabled={busy} onClick={make}>
                {busy ? 'Making your video…' : 'Make a new video'}
              </button>
            </>
          )}
          {error && <p className="dash-error">{error}</p>}
        </section>
      )}
      {slot.completed && (
        <p className="ad-embed-next">
          <a className="dash-btn" href={props.nextHref}>
            {props.nextLabel}
          </a>
        </p>
      )}
    </div>
  )
}
