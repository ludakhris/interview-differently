import type { LessonEventKind, LessonScene, SceneVisual } from '@id/types'
import { useCallback, useEffect, useRef, useState } from 'react'

/** Seconds a scene stays up without a voice: about 2.6 words a second, at least 4 seconds. */
export const readSeconds = (text: string) => Math.max(4, text.split(/\s+/).length / 2.6)

type Voice = 'server' | 'browser' | undefined

/**
 * A short lesson played as a narrated storyboard: each scene's visual animates in while a voice reads the
 * narration, with captions. With the server's voice it waits for each recording (fetching the next one while the
 * current scene plays) and never switches voices mid-lesson; without one it uses the browser's voice, or just the
 * reading time when the voice is off.
 */
export function Player({
  title,
  scenes,
  audioFor,
  onEvent,
}: {
  title: string
  scenes: LessonScene[]
  /** The server's recording of a scene, when it has a voice; null to use the browser's. */
  audioFor: ((scene: number) => Promise<string>) | null
  /** How the lesson was watched; 'finish' is reported once the last scene has played. */
  onEvent: (event: LessonEventKind, scene: number, voice: Voice) => void
}) {
  const [index, setIndex] = useState(-1) // -1: not started
  const [playing, setPlaying] = useState(false)
  const [finished, setFinished] = useState(false)
  const [muted, setMuted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [blocked, setBlocked] = useState(false)
  // The server should have read this scene but could not: stop and say so, never go on silently.
  const [voiceLost, setVoiceLost] = useState(false)
  const timer = useRef<number | null>(null)
  // Kept in refs so a parent re-render never restarts the scene being spoken.
  const report = useRef(onEvent)
  report.current = onEvent
  const scene = index >= 0 ? scenes[index] : null
  const browserVoice = !audioFor && typeof window !== 'undefined' && 'speechSynthesis' in window
  const voice: Voice = muted
    ? undefined
    : audioFor
      ? 'server'
      : browserVoice
        ? 'browser'
        : undefined

  // One audio element for the whole lesson: once a click has started it, the browser lets it keep playing.
  const audio = useRef<HTMLAudioElement | null>(null)
  const element = () => (audio.current ??= new Audio())
  const loadedFor = useRef(-1)
  // Recordings, fetched once each (the next one while the current scene plays) and kept ready.
  const ready = useRef(new Map<number, string>())
  const pending = useRef(new Map<number, Promise<string | null>>())
  const fetchScene = useCallback(
    (i: number): Promise<string | null> => {
      if (!audioFor || i < 0 || i >= scenes.length) return Promise.resolve(null)
      let p = pending.current.get(i)
      if (!p) {
        // One retry: the server may still be recording it.
        p = audioFor(i)
          .catch(() => audioFor(i))
          .then((url) => {
            ready.current.set(i, url)
            return url
          })
          .catch(() => null)
        pending.current.set(i, p)
      }
      return p
    },
    [audioFor, scenes.length]
  )
  useEffect(() => {
    void fetchScene(0)
    const urls = ready.current
    return () => {
      audio.current?.pause()
      for (const url of urls.values()) URL.revokeObjectURL(url)
    }
  }, [fetchScene])

  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
  }

  // Play the current scene, then move on.
  useEffect(() => {
    if (!playing || !scene) return
    let cancelled = false
    report.current('scene', index, voice)
    const advance = () => {
      if (cancelled) return
      timer.current = window.setTimeout(() => {
        if (index + 1 < scenes.length) setIndex(index + 1)
        else {
          setPlaying(false)
          setFinished(true)
          report.current('finish', index, voice)
        }
      }, 600)
    }
    const wait = () => {
      timer.current = window.setTimeout(advance, readSeconds(scene.narration) * 1000)
    }
    if (audioFor && !muted) {
      void fetchScene(index + 1)
      const start = (url: string | null) => {
        if (cancelled) return
        setLoading(false)
        if (!url) {
          setVoiceLost(true)
          setPlaying(false)
          return
        }
        const a = element()
        a.onended = advance
        if (loadedFor.current !== index) {
          a.src = url
          loadedFor.current = index
        }
        a.play().then(
          () => setBlocked(false),
          () => setBlocked(true)
        )
      }
      const got = ready.current.get(index)
      if (got) start(got)
      else {
        setLoading(true)
        void fetchScene(index).then(start)
      }
    } else if (browserVoice && !muted) {
      const u = new SpeechSynthesisUtterance(scene.narration)
      u.rate = 1.02
      u.onend = advance
      u.onerror = advance
      window.speechSynthesis.speak(u)
    } else {
      wait()
    }
    return () => {
      cancelled = true
      clear()
      if (audio.current) {
        audio.current.onended = null
        audio.current.pause()
      }
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [playing, index, scene, scenes.length, muted, audioFor, browserVoice, fetchScene, voice])

  /** Starts playback from a click, so the browser allows the sound. */
  const startFrom = (i: number) => {
    // A failed recording is fetched again rather than remembered as missing.
    if (voiceLost) {
      pending.current.delete(i)
      setVoiceLost(false)
    }
    const url = ready.current.get(i)
    if (audioFor && !muted && url) {
      const a = element()
      if (loadedFor.current !== i) {
        a.src = url
        loadedFor.current = i
      }
      void a.play().catch(() => setBlocked(true))
    }
    setFinished(false)
    setIndex(i)
    setPlaying(true)
  }
  const toggle = () => {
    if (playing) return setPlaying(false)
    if (index < 0) report.current('start', 0, voice)
    else if (finished) report.current('replay', 0, voice)
    startFrom(index < 0 || finished ? 0 : index)
  }
  const goTo = (i: number) => {
    const to = Math.max(0, Math.min(scenes.length - 1, i))
    clear()
    loadedFor.current = -1
    if (playing) startFrom(to)
    else {
      setFinished(false)
      setIndex(to)
    }
  }

  return (
    <figure className="sp-player" aria-label={`Video: ${title}`}>
      <div className="sp-stage">
        {!scene ? (
          <button type="button" className="sp-stage-start" onClick={toggle}>
            <span className="sp-play-icon" aria-hidden="true">
              ▶
            </span>
            <strong>{title}</strong>
            <span>
              {scenes.length} scenes · about{' '}
              {Math.round(scenes.reduce((n, s) => n + readSeconds(s.narration), 0))} seconds
            </span>
          </button>
        ) : (
          <div key={index} className="sp-scene">
            <h2>{scene.heading}</h2>
            <Visual visual={scene.visual} />
          </div>
        )}
        {blocked && playing && (
          <button
            type="button"
            className="sp-stage-start sp-stage-unblock"
            onClick={() =>
              void element()
                .play()
                .then(() => setBlocked(false))
            }
          >
            <span className="sp-play-icon" aria-hidden="true">
              ▶
            </span>
            <span>Tap to hear the narration</span>
          </button>
        )}
      </div>
      {scene && (
        <figcaption className="sp-captions" aria-live="polite">
          {voiceLost ? (
            <span>
              Could not load the narration for this scene.{' '}
              <button type="button" className="sp-btn-quiet" onClick={() => startFrom(index)}>
                Try again
              </button>
            </span>
          ) : loading ? (
            <span className="sp-loading-voice">Preparing narration…</span>
          ) : (
            scene.narration
          )}
        </figcaption>
      )}
      <div className="sp-controls">
        <button
          type="button"
          className="sp-btn-quiet sp-step"
          aria-label="Previous scene"
          disabled={index <= 0}
          onClick={() => goTo(index - 1)}
        >
          ⏮
        </button>
        <button type="button" className="sp-btn" onClick={toggle}>
          {playing ? '❚❚ Pause' : finished ? '↺ Replay' : index >= 0 ? '▶ Resume' : '▶ Play'}
        </button>
        <button
          type="button"
          className="sp-btn-quiet sp-step"
          aria-label="Next scene"
          disabled={index >= scenes.length - 1}
          onClick={() => goTo(index + 1)}
        >
          ⏭
        </button>
        <div className="sp-scenebar" role="group" aria-label="Scenes">
          {scenes.map((s, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Scene ${i + 1}: ${s.heading}`}
              aria-current={i === index ? 'step' : undefined}
              className={i < index || finished ? 'is-done' : i === index ? 'is-now' : ''}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
        <span className="sp-scene-count">
          {index >= 0 ? `${index + 1} / ${scenes.length}` : `${scenes.length} scenes`}
        </span>
        <button
          type="button"
          className="sp-btn-quiet"
          aria-pressed={muted}
          onClick={() => setMuted((m) => !m)}
        >
          {muted ? 'Voice off' : 'Voice on'}
        </button>
      </div>
    </figure>
  )
}

function Visual({ visual: v }: { visual: SceneVisual }) {
  switch (v.kind) {
    case 'title':
      return <p className="sp-v-title">{v.sub}</p>
    case 'bullets':
      return (
        <ul className="sp-v-bullets">
          {v.items.map((b, i) => (
            <li key={i} style={{ animationDelay: `${0.3 + i * 0.5}s` }}>
              {b}
            </li>
          ))}
        </ul>
      )
    case 'sql':
      return <pre className="sp-v-sql">{highlight(v.code, v.highlight)}</pre>
    case 'compare':
      return (
        <div className="sp-v-compare">
          <div className="is-before">
            <span>{v.leftLabel}</span>
            <pre>{v.left}</pre>
          </div>
          <div className="is-after">
            <span>{v.rightLabel}</span>
            <pre>{v.right}</pre>
          </div>
        </div>
      )
    case 'table':
      return (
        <table className="sp-v-table">
          <thead>
            <tr>
              {v.columns.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.rows.map((r, i) => (
              <tr
                key={i}
                className={v.highlightRows.includes(i) ? 'is-picked' : ''}
                style={{ animationDelay: `${0.2 + i * 0.25}s` }}
              >
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
  }
}

/** The SQL with the parts the scene talks about marked. */
function highlight(code: string, marks: string[]) {
  const words = marks.filter(Boolean)
  if (words.length === 0) return code
  const re = new RegExp(
    `(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'gi'
  )
  return code
    .split(re)
    .map((part, i) =>
      words.some((w) => w.toLowerCase() === part.toLowerCase()) ? <mark key={i}>{part}</mark> : part
    )
}
