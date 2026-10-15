import type { LessonEventInput, LessonPlayerView } from '@id/types'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, loadLesson, postEventWithRetry, sceneAudio } from './api'
import { eventSender } from './events'
import { isFramed, postToParent } from './frame'
import { Player } from './Player'
import { captureToken } from './session'

/** `/lesson#token=…`: the lesson a signed link opens, played in the LMS course page's frame (or on its own). */
export function LessonPage() {
  const [token] = useState(() => captureToken(window))
  const [view, setView] = useState<LessonPlayerView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  // A finish the server did not store, kept so the learner can send it again.
  const [unsaved, setUnsaved] = useState<LessonEventInput | null>(null)
  const sender = useMemo(
    () =>
      eventSender(
        (input) => postEventWithRetry(token ?? '', input),
        () => postToParent(window, { subject: 'spark.lesson.finished' })
      ),
    [token]
  )
  const finish = useCallback(
    async (input: LessonEventInput) => {
      setUnsaved(null)
      if (await sender.finish(input)) setFinished(true)
      else setUnsaved(input)
    },
    [sender]
  )

  useEffect(() => {
    if (!token) return
    loadLesson(token).then(
      (v) => {
        setView(v)
        setFinished(v.finished)
      },
      (e: unknown) =>
        setError(
          e instanceof ApiError
            ? e.message
            : 'Could not reach the lesson. Check your connection and reload.'
        )
    )
  }, [token])

  useResizeReport()

  const audioFor = useCallback((scene: number) => sceneAudio(token ?? '', scene), [token])

  if (!token)
    return (
      <Notice>This lesson opens from your course. Go back to your course and open it there.</Notice>
    )
  if (error) return <Notice>{error}</Notice>
  if (!view)
    return (
      <p className="sp-loading" role="status">
        Loading your lesson…
      </p>
    )

  return (
    <main className="sp-lesson">
      {view.preview && (
        <p className="sp-preview" role="note">
          Preview: nothing is recorded.
        </p>
      )}
      <Player
        title={view.title}
        scenes={view.scenes}
        audioFor={view.voice ? audioFor : null}
        onEvent={(event, scene, voice) =>
          event === 'finish'
            ? void finish({ event, scene, voice })
            : sender.send({ event, scene, voice })
        }
      />
      {unsaved && (
        <p className="sp-notice" role="alert">
          We could not save that you finished; try again.{' '}
          <button type="button" className="sp-btn-quiet" onClick={() => void finish(unsaved)}>
            Try again
          </button>
        </p>
      )}
      {finished && !unsaved && !view.preview && (
        <p className="sp-done" role="status">
          Watched. You can replay it any time.
        </p>
      )}
    </main>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <main className="sp-lesson">
      <p className="sp-notice">{children}</p>
    </main>
  )
}

/** In a frame, tells the LMS page how tall the player is whenever that changes, so the frame never scrolls. */
function useResizeReport() {
  useEffect(() => {
    if (!isFramed(window) || typeof ResizeObserver === 'undefined') return
    document.documentElement.classList.add('is-framed')
    let last = 0
    let frame = 0
    const report = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const height = Math.ceil(document.documentElement.getBoundingClientRect().height)
        if (height === last) return
        last = height
        postToParent(window, { subject: 'spark.lesson.resize', height })
      })
    }
    const observer = new ResizeObserver(report)
    observer.observe(document.body)
    report()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])
}
