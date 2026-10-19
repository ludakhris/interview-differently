import type { AdaptiveBoard, BoardLearner, BoardPathItem, IntakeLevel, SkillState } from '@id/types'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useApiSend, useLoad } from '../api'
import { useApp } from '../app-context'
import { errorNotice } from '../shared'
import { WatchLessonLink } from '../WatchLessonLink'
import { diffPaths, type PathDiff, type PathSnapshot } from './planDiff'
import { PathTimeline, hm } from './PathTimeline'
import { SeenModal } from './SeenModal'
import { JUMP_ADDS_PX, JUMP_PX, raceRuns } from './race'
import { ComparePicker } from './ComparePicker'
import './adaptive.css'

const POLL_MS = 3000
const STEP_GAP_MS = 2200

const INTAKE: Record<IntakeLevel, string> = {
  never: 'Says: never written SQL',
  some: 'Says: has written a little SQL',
  regular: 'Says: uses SQL regularly',
}
const GOAL: Record<SkillState, { icon: string; word: string }> = {
  demonstrated: { icon: '✓', word: 'Proven' },
  gap: { icon: '!', word: 'Gap' },
  emerging: { icon: '…', word: 'Needs one more answer' },
  unknown: { icon: '', word: 'Not yet' },
}

interface Seen {
  path: PathSnapshot
  skills: Record<string, SkillState>
}
interface Anim {
  path: PathDiff
  skills: Set<string>
}

/**
 * Adaptive Learner Monitoring (adaptive checkpoints prototype): every learner's path side by side, live. Each lane
 * shows the job goals ticked off as they are proven, the path with what was skipped or added, who may need a person,
 * and (folded away) what changed and what they did and saw. In a demo cohort the scripted learners can be played,
 * reset and played again; each step runs through the same calls a learner makes, so what changes is real.
 */
export function AdaptiveBoardPage({ cohortId }: { cohortId: string }) {
  const { href } = useApp()
  const send = useApiSend()
  const path = `/learn/cohorts/${encodeURIComponent(cohortId)}/adaptive`
  const { data, error, reload } = useLoad<AdaptiveBoard>(path)
  const [message, setMessage] = useState<string | null>(null)
  const [playing, setPlaying] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [now, setNow] = useState<Record<string, string>>({})
  // The learner whose view is open in the "what they saw" popup.
  const [seeing, setSeeing] = useState<string | null>(null)
  // The first time the demo is started on this page, say what is simulated and what is real, then start it.
  const introduced = useRef(false)
  // Student comparison mode: the learners picked are compared with the course as written, in place of the lanes.
  const [comparing, setComparing] = useState(false)
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [intro, setIntro] = useState<(() => void) | null>(null)

  // Live: refresh while the page is visible.
  const reloadRef = useRef(reload)
  reloadRef.current = reload
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') reloadRef.current()
    }, POLL_MS)
    return () => window.clearInterval(t)
  }, [])

  // What changed since the last refresh, per learner, so only those rows animate.
  const seen = useRef<Map<string, Seen>>(new Map())
  const anim = useMemo(() => {
    const out = new Map<string, Anim>()
    for (const l of data?.learners ?? []) {
      const prev = seen.current.get(l.enrollmentId)
      const snap = Object.fromEntries(l.path.map((p) => [p.itemId, p.state]))
      out.set(l.enrollmentId, {
        path: diffPaths(prev?.path ?? null, snap),
        skills: new Set(
          prev
            ? l.skills.filter((s) => prev.skills[s.skillId] !== s.status).map((s) => s.skillId)
            : []
        ),
      })
    }
    return out
  }, [data])
  useEffect(() => {
    for (const l of data?.learners ?? [])
      seen.current.set(l.enrollmentId, {
        path: Object.fromEntries(l.path.map((p) => [p.itemId, p.state])),
        skills: Object.fromEntries(l.skills.map((s) => [s.skillId, s.status])),
      })
  }, [data])

  // One step at a time per learner, even when autoplay restarts mid-step.
  const running = useRef<Set<string>>(new Set())
  const step = useCallback(
    async (persona: string): Promise<boolean> => {
      if (running.current.has(persona)) return true
      running.current.add(persona)
      setBusy((b) => new Set(b).add(persona))
      try {
        const url = `${path}/demo/${encodeURIComponent(persona)}/step`
        // A step that calls the AI can fail now and then: try it once more before stopping the demo.
        const r = await send<{ done: boolean; say: string }>('POST', url).catch(() =>
          send<{ done: boolean; say: string }>('POST', url)
        )
        setNow((n) => ({ ...n, [persona]: r.say }))
        reloadRef.current()
        return !r.done
      } catch (e) {
        setMessage((e as Error).message)
        return false
      } finally {
        running.current.delete(persona)
        setBusy((b) => {
          const next = new Set(b)
          next.delete(persona)
          return next
        })
      }
    },
    [path, send]
  )

  // Autoplay: one step at a time per learner, with a pause to watch each change land.
  useEffect(() => {
    let stop = false
    const loops = [...playing].map(async (persona) => {
      while (!stop) {
        const more = await step(persona)
        if (!more || stop) break
        await new Promise((r) => window.setTimeout(r, STEP_GAP_MS))
      }
      if (!stop)
        setPlaying((p) => {
          const next = new Set(p)
          next.delete(persona)
          return next
        })
    })
    return () => {
      stop = true
      void loops
    }
    // Restart the loops only when the set of playing learners changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [[...playing].sort().join(',')])

  if (error) return errorNotice(error)
  if (!data) return <p className="dash-loading">Loading the board…</p>

  const toggle = (persona: string) =>
    setPlaying((p) => {
      const next = new Set(p)
      if (next.has(persona)) next.delete(persona)
      else next.add(persona)
      return next
    })
  const demoLearners = data.learners.filter((l) => l.demo)
  const everyone = [...demoLearners, ...data.learners.filter((l) => !l.demo)]
  // Until someone picks, the demo's learners (or the first three).
  const chosen =
    picked ??
    new Set((demoLearners.length ? demoLearners : everyone.slice(0, 3)).map((l) => l.enrollmentId))
  const shown = comparing ? everyone.filter((l) => chosen.has(l.enrollmentId)) : everyone
  const personas = demoLearners.flatMap((l) => (l.demo?.next ? [l.demo.persona] : []))
  const resetDemo = async (thenPlay: boolean) => {
    setPlaying(new Set())
    try {
      await send('POST', `${path}/demo/reset`)
      setNow({})
      seen.current.clear()
      reload()
      if (thenPlay) setPlaying(new Set(demoLearners.map((l) => l.demo?.persona as string)))
    } catch (e) {
      setMessage((e as Error).message)
    }
  }
  const settings = async (patch: Partial<AdaptiveBoard['settings']>) => {
    try {
      await send('PUT', `${path}/settings`, patch)
      reload()
    } catch (e) {
      setMessage((e as Error).message)
    }
  }
  const review = async (id: string, approve: boolean) => {
    try {
      await send('POST', `${path}/content/${encodeURIComponent(id)}/review`, { approve })
      reload()
    } catch (e) {
      setMessage((e as Error).message)
    }
  }
  // Waiting for review, or already shown to learners with no person's review yet (approval is not required).
  const pending = data.practice.filter(
    (p) => p.status === 'pending' || (p.status === 'approved' && !p.reviewed)
  )

  return (
    <div className="ad">
      <p className="dash-back">
        <a href={href(`/lms/cohorts/${encodeURIComponent(cohortId)}`)}>← Back to the cohort</a>
      </p>
      <div className="dash-head">
        <div>
          <h1 className="dash-h2">Adaptive Learner Monitoring</h1>
          <p className="dash-sub">
            Goal: job ready{data.jobTitle ? ` as a ${data.jobTitle.toLowerCase()}` : ''} ·{' '}
            {data.courseTitle} · updates live
          </p>
        </div>
        <div className="dash-actions">
          <label className="ad-mode-toggle">
            <input
              type="checkbox"
              checked={comparing}
              onChange={(e) => setComparing(e.target.checked)}
            />
            Student comparison mode
          </label>
          {demoLearners.length > 0 && (
            <>
              <button
                type="button"
                className="dash-btn-quiet"
                onClick={() => {
                  if (
                    window.confirm('Start the demo over? Maya and Theo lose everything they did.')
                  )
                    void resetDemo(false)
                }}
              >
                ↺ Reset demo
              </button>
              <button
                type="button"
                className="dash-btn"
                onClick={() => {
                  if (playing.size > 0) return setPlaying(new Set())
                  const start = () =>
                    personas.length > 0 ? setPlaying(new Set(personas)) : void resetDemo(true)
                  if (introduced.current) return start()
                  introduced.current = true
                  setIntro(() => start)
                }}
              >
                {playing.size > 0
                  ? '❚❚ Pause the demo'
                  : personas.length > 0
                    ? '▶ Play the demo'
                    : '▶ Replay the demo'}
              </button>
            </>
          )}
        </div>
      </div>
      {message && (
        <p className="dash-banner dash-banner-error" role="alert">
          {message}{' '}
          <button type="button" className="dash-btn-quiet" onClick={() => setMessage(null)}>
            Dismiss
          </button>
        </p>
      )}

      {pending.length > 0 && (
        <section aria-labelledby="h-queue">
          <h2 className="dash-card-title ad-section-title" id="h-queue">
            AI-written content to review ({pending.length})
          </h2>
          <div className="ad-queue">
            {pending.map((p) => (
              <article key={p.id} className="ad-queue-card">
                <div className="ad-actions">
                  <span className="ad-chip ad-chip-ai">
                    {p.kind === 'lesson' ? 'Video lesson' : 'Practice'} for {p.learnerName}
                  </span>
                  <span className="ad-chip">{p.skillLabel}</span>
                  {p.status === 'approved' && (
                    <span className="ad-chip">Shown to learners, not yet reviewed</span>
                  )}
                </div>
                <p>{p.kind === 'lesson' ? <strong>{p.intro}</strong> : p.intro}</p>
                <details className="ad-queue-parts">
                  <summary>
                    Show the {p.tasks.length} {p.kind === 'lesson' ? 'scenes' : 'requests'}
                  </summary>
                  <ol>
                    {p.tasks.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ol>
                </details>
                <p className="dash-muted">
                  {p.kind === 'lesson'
                    ? `${p.tasks.length} narrated scenes, played in the browser like a video`
                    : 'Every answer key ran on the store’s data before it reached you'}{' '}
                  · {p.model}
                </p>
                {p.kind === 'lesson' && (
                  <WatchLessonLink
                    path={`${path}/content/${encodeURIComponent(p.id)}/preview`}
                    onError={setMessage}
                  />
                )}
                <p className="dash-muted ad-review-hint">
                  {p.status === 'pending'
                    ? 'Approve shows it to the learner and lets it be reused for other learners.'
                    : 'Approve lets it be reused for other learners.'}
                </p>
                <p className="dash-muted ad-review-hint">
                  Send back gives this cohort’s learners a new one. Other cohorts using it keep it;
                  if none do, it is not reused.
                </p>
                <div className="ad-actions">
                  <button
                    type="button"
                    className="dash-btn"
                    onClick={() => void review(p.id, true)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="dash-btn-quiet"
                    onClick={() => void review(p.id, false)}
                  >
                    Send back
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {comparing && <ComparePicker learners={everyone} chosen={chosen} onChange={setPicked} />}

      {shown.length > 0 && <ReadyRace learners={shown} outline={data.outline} />}

      <h2 className="dash-card-title ad-section-title">Learners</h2>
      {data.learners.length === 0 && <p className="dash-muted">No learners in this cohort yet.</p>}
      <div className="ad-lanes">
        {comparing && <PlanALane outline={data.outline} skills={data.skills} />}
        {shown.map((l) => {
          const i = everyone.indexOf(l)
          return (
            <Lane
              key={l.enrollmentId}
              learner={l}
              skills={data.skills}
              anim={anim.get(l.enrollmentId)}
              onSee={() => setSeeing(l.enrollmentId)}
              color={l.demo ? LANE_COLORS[i % LANE_COLORS.length] : '#8a9aa6'}
              now={l.demo ? now[l.demo.persona] : undefined}
              playing={!!l.demo && playing.has(l.demo.persona)}
              busy={!!l.demo && busy.has(l.demo.persona)}
              onStep={() => l.demo && void step(l.demo.persona)}
              onToggle={() => l.demo && toggle(l.demo.persona)}
            />
          )
        })}
      </div>

      <details className="ad-settings">
        <summary>Adaptive Course Configuration</summary>
        <div className="ad-rules">
          <label>
            <input
              type="checkbox"
              checked={data.settings.testOut}
              disabled={!data.settings.canEdit}
              onChange={(e) => void settings({ testOut: e.target.checked })}
            />
            Let learners skip what they have shown
          </label>
          <label>
            <input
              type="checkbox"
              checked={data.settings.approveGenerated}
              disabled={!data.settings.canEdit}
              onChange={(e) => void settings({ approveGenerated: e.target.checked })}
            />
            Staff approve AI-written practice and videos before learners see them
          </label>
          {!data.settings.canEdit && (
            <span className="dash-muted">Only the course’s authors change these.</span>
          )}
        </div>
        <p className="dash-muted">
          A skill counts as proven at {data.skills[0]?.targetPct ?? 80}% on the learner’s latest{' '}
          {data.skills[0]?.minEvidence ?? 2} answers.
        </p>
      </details>

      {intro && (
        <DemoIntro
          onStart={() => {
            setIntro(null)
            intro()
          }}
          onClose={() => setIntro(null)}
        />
      )}
      {seeing && (
        <SeenModal cohortId={cohortId} enrollmentId={seeing} onClose={() => setSeeing(null)} />
      )}
    </div>
  )
}

// The homepage's learner colours: Maya blue, Theo orange.
const LANE_COLORS = ['#4aaee8', '#f26a2e', '#7a5cc7', '#2a9d6f']
const PLAN_A_COLOR = '#8a9aa6'
/** Room kept free at the right of a lane for a finish flag. */
const FLAG_ROOM_PX = 36

/**
 * Time to job-ready, side by side, on one time scale. Each bar is the learner's path in order: done (solid), what
 * their evidence let them skip (a short green jump, softly pulsing), then what is left
 * (pale). So a bar is as long as the time the learner actually spends; the marker is the course as written. A
 * learner who is job ready gets a finish flag at the end of their own bar instead of the marker.
 */
function ReadyRace({
  learners,
  outline,
}: {
  learners: BoardLearner[]
  outline: AdaptiveBoard['outline']
}) {
  const inA = new Set(outline.map((o) => o.itemId))
  const planA = outline.reduce((n, o) => n + o.minutes, 0)
  const rows = learners.map((l) => {
    const runs = raceRuns(l.path, inA)
    return { l, runs, jumps: runs.filter((r) => r.kind === 'proved').length, span: l.minutesTotal }
  })
  const longest = Math.max(1, planA, ...rows.map((r) => r.span))
  // the lane keeps FLAG_ROOM_PX free on the right, so a finish flag never runs into the label column
  const pct = (m: number) => `calc((100% - ${FLAG_ROOM_PX}px) * ${m / longest})`
  return (
    <section aria-labelledby="h-race" className="ad-race">
      <h2 className="dash-card-title ad-section-title" id="h-race">
        Time to job-ready
      </h2>
      <ol>
        {rows.map(({ l, runs, jumps, span }) => (
          <li key={l.enrollmentId}>
            <span className="ad-race-name">{l.name}</span>
            <span className="ad-race-track" aria-hidden="true">
              <span
                className="ad-race-bar"
                style={{ width: `calc(${pct(span)} + ${jumps * JUMP_ADDS_PX}px)` }}
              >
                {runs.map((r, i) => (
                  <span
                    key={i}
                    className={`ad-race-${r.kind}`}
                    style={
                      r.kind === 'proved' ? { flex: `0 0 ${JUMP_PX}px` } : { flexGrow: r.minutes }
                    }
                  />
                ))}
              </span>
              {l.ready ? (
                <span
                  className="ad-race-flag"
                  style={{ left: `calc(${pct(span)} + ${jumps * JUMP_ADDS_PX}px)` }}
                >
                  🏁
                </span>
              ) : (
                <span className="ad-race-a" style={{ left: pct(planA) }} />
              )}
            </span>
            <span className="ad-race-label">
              {l.ready ? (
                <>
                  <strong>✓ Job ready</strong>
                  {planA > l.minutesTotal && (
                    <span className="ad-chip ad-chip-add">{hm(planA - l.minutesTotal)} faster</span>
                  )}
                </>
              ) : (
                `${hm(l.minutesLeft)} to go`
              )}
            </span>
          </li>
        ))}
      </ol>
      <p className="ad-race-key">
        <span className="k-done" /> done <span className="k-proved" /> proven through simulation
        checkpoints <span className="k-left" /> still to do <span className="k-a" /> the course as
        written ({hm(planA)})
      </p>
    </section>
  )
}

/**
 * Student comparison mode: the course as written, as a lane of its own beside the learners picked, on the
 * same time scale, so each learner's path reads against it.
 */
function PlanALane({
  outline,
  skills,
}: {
  outline: AdaptiveBoard['outline']
  skills: AdaptiveBoard['skills']
}) {
  const minutes = outline.reduce((n, o) => n + o.minutes, 0)
  const path: BoardPathItem[] = outline.map((o) => ({
    ...o,
    skill: null,
    state: 'todo',
    reason: null,
    at: null,
    evidence: null,
  }))
  return (
    <article
      className="ad-lane ad-lane-a"
      aria-labelledby="lane-plan-a"
      style={{ '--lane': PLAN_A_COLOR } as CSSProperties}
    >
      <header className="ad-lane-head">
        <span className="ad-avatar" aria-hidden="true">
          A
        </span>
        <div>
          <h3 className="ad-lane-name" id="lane-plan-a">
            The course as written
          </h3>
          <p className="ad-lane-sub">{outline.length} items, the same for everyone</p>
        </div>
        <span className="ad-togo">{hm(minutes)}</span>
      </header>
      <PathTimeline
        learner={{ path, ready: false, minutesLeft: minutes }}
        anim={undefined}
        color={PLAN_A_COLOR}
        goals={Object.fromEntries(skills.map((s) => [s.id, s.label]))}
      />
    </article>
  )
}

function Lane({
  learner: l,
  skills,
  anim,
  onSee,
  color,
  now,
  playing,
  busy,
  onStep,
  onToggle,
}: {
  learner: BoardLearner
  skills: AdaptiveBoard['skills']
  anim: Anim | undefined
  onSee: () => void
  color: string
  now: string | undefined
  playing: boolean
  busy: boolean
  onStep: () => void
  onToggle: () => void
}) {
  const initials = l.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const first = l.name.split(' ')[0]
  const proven = l.skills.filter((s) => s.status === 'demonstrated').length
  return (
    <article
      className="ad-lane"
      aria-labelledby={`lane-${l.enrollmentId}`}
      style={{ '--lane': color } as CSSProperties}
    >
      <header className="ad-lane-head">
        <span className="ad-avatar" aria-hidden="true">
          {initials}
        </span>
        <div>
          <h3 className="ad-lane-name" id={`lane-${l.enrollmentId}`}>
            {l.name}
          </h3>
          <p className="ad-lane-sub">
            {l.intake ? INTAKE[l.intake] : 'Has not started'} · {l.itemsDone} of {l.itemsTotal}{' '}
            items
          </p>
        </div>
        {l.ready ? (
          <span
            className="ad-jobready"
            title={`All ${skills.length} job goals proven on the evidence the program asks for`}
          >
            ✓ Job ready
          </span>
        ) : (
          <span className="ad-togo">{l.minutesLeft > 0 ? `${hm(l.minutesLeft)} to go` : ''}</span>
        )}
      </header>

      {l.demo && (
        <div className="ad-demo">
          {now && (
            <p key={now} className="ad-demo-now">
              {busy ? '…' : '✓'} {now}
            </p>
          )}
          {l.demo.next ? (
            <div className="ad-demo-row">
              <span className="dash-muted">Next: {l.demo.next}</span>
              <button
                type="button"
                className="dash-btn-quiet"
                disabled={busy || playing}
                onClick={onStep}
              >
                {busy ? 'Working…' : 'Step'}
              </button>
              <button type="button" className="dash-btn-quiet" onClick={onToggle}>
                {playing ? '❚❚' : '▶'}
              </button>
            </div>
          ) : (
            <span className="dash-muted">Script finished: Replay the demo to run it again.</span>
          )}
        </div>
      )}

      <section aria-label={`${first}'s job goals`}>
        <h4 className="ad-goals-title">
          Job goals{' '}
          <span>
            {proven} of {skills.length} proven
          </span>
        </h4>
        <ul className="ad-goals">
          {skills.map((s) => {
            const mine = l.skills.find((x) => x.skillId === s.id)
            const status = mine?.status ?? 'unknown'
            return (
              <li
                key={s.id}
                className={`is-${status}${anim?.skills.has(s.id) ? ' is-changed' : ''}`}
              >
                <span className="ad-goal-box" aria-hidden="true">
                  {GOAL[status].icon}
                </span>
                <span>
                  {s.label}
                  <small>
                    {GOAL[status].word}
                    {mine?.pct !== null && mine?.pct !== undefined && status !== 'unknown'
                      ? ` · ${mine.pct}%`
                      : ''}
                  </small>
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      {l.needsHelp.length > 0 && (
        <ul className="ad-help-flags" aria-label="May need help">
          {l.needsHelp.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}

      <PathTimeline
        learner={l}
        anim={anim?.path}
        color={color}
        goals={Object.fromEntries(skills.map((s) => [s.id, s.label]))}
      />

      <button type="button" className="ad-see" onClick={onSee}>
        See what {first} saw →
      </button>
    </article>
  )
}

/**
 * Said once per visit, before the demo starts: the two learners are simulated, everything else is real.
 */
function DemoIntro({ onStart, onClose }: { onStart: () => void; onClose: () => void }) {
  const start = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    start.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    // A click on the backdrop closes it; Escape closes it from the keyboard.
    <div
      className="ad-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="ad ad-overlay-card ad-intro"
        role="dialog"
        aria-modal="true"
        aria-labelledby="h-demo-intro"
      >
        <span className="ad-chip ad-chip-ai">Before we start</span>
        <h2 id="h-demo-intro">Two simulated learners. Everything else is real.</h2>
        <p>
          <strong>Maya</strong> and <strong>Theo</strong> are scripted: their answers are typed for
          them, the way a real learner would type them. That is the only thing simulated.
        </p>
        <ul className="ad-intro-real">
          <li>
            <strong>Real course</strong>
            <span>The requests, lessons and checkpoints a learner works through.</span>
          </li>
          <li>
            <strong>Real grading</strong>
            <span>
              Every answer runs on the store’s data and is checked against the answer key.
            </span>
          </li>
          <li>
            <strong>Real AI</strong>
            <span>
              Hints, practice and videos are written by Claude, live, from each learner’s own
              mistakes.
            </span>
          </li>
          <li>
            <strong>Real adapting</strong>
            <span>The same rules decide what is skipped and what is added, for any learner.</span>
          </li>
          <li>
            <strong>Real monitoring</strong>
            <span>This page reads the live database: what you see is what happened.</span>
          </li>
        </ul>
        <div className="ad-actions">
          <button ref={start} type="button" className="dash-btn" onClick={onStart}>
            ▶ Start the demo
          </button>
          <button type="button" className="dash-btn-quiet" onClick={onClose}>
            Not yet
          </button>
        </div>
      </div>
    </div>
  )
}
