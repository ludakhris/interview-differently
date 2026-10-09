import type { LearnerItem, LearnerOutline, PlanAddition, QuizResult } from '@id/types'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Scorm12API, Scorm2004API } from 'scorm-again'
import { useApiSend, useLoad } from './api'
import { useApp } from './app-context'
import { YourAttempts } from './AttemptsList'
import { score } from './format'
import { LEARNER_TYPE_LABEL } from './ItemEditor'
import { errorNotice } from './shared'
import { TalentProfileItem } from './talent/TalentProfileItem'
import { attemptLine, onPageRestore, readyCopy, resultCopy, timeLimitNote } from './toolKinds'

/** Plain text with blank-line paragraphs and "- " bullets. */
function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim())
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <ul key={i} className="dash-lesson-list">
              {lines.map((l, j) => (
                <li key={j}>{l.slice(2)}</li>
              ))}
            </ul>
          )
        }
        return <p key={i}>{b}</p>
      })}
    </>
  )
}

export function LearningItemPage({ cohortId, itemId }: { cohortId: string; itemId: string }) {
  const { href } = useApp()
  const itemLoad = useLoad<LearnerItem>(`/learn/me/cohorts/${cohortId}/items/${itemId}`)
  const outline = useLoad<LearnerOutline>(`/learn/me/cohorts/${cohortId}`)
  const [item, setItem] = useState<LearnerItem | null>(null)
  useEffect(() => {
    if (itemLoad.data) setItem(itemLoad.data)
  }, [itemLoad.data])

  if (itemLoad.error) return errorNotice(itemLoad.error)
  if (itemLoad.loading || !item) return <p className="dash-loading">Loading…</p>

  // The next item in the course, named on the button that leads to it.
  const flat = outline.data?.modules.flatMap((m) => m.items) ?? []
  const next = flat[flat.findIndex((i) => i.id === item.id) + 1]
  const nextLabel = next ? `Next: ${next.title}` : 'Back to course'
  const nextHref = next
    ? href(`/lms/learning/${cohortId}/${next.id}`)
    : href(`/lms/learning/${cohortId}`)

  return (
    <>
      <p className="dash-back">
        <a href={href(`/lms/learning/${cohortId}`)}>
          ← {outline.data?.cohort.courseTitle ?? 'Back to course'}
        </a>
      </p>
      <p className="dash-item-type dash-item-kicker">
        {LEARNER_TYPE_LABEL[item.type] ?? item.type}
        {item.label ? ` · ${item.label}-assessment` : ''}
      </p>
      <h1 className="dash-h2">{item.title}</h1>
      {item.locked && <p className="dash-banner">{item.locked}</p>}
      {item.review && (
        <p className="dash-banner" role="status">
          You are reviewing this. Your {item.review.skill} result was {item.review.pct}%, so it was
          added to your plan again. Complete it again to finish it.
        </p>
      )}

      <div className="dash-player">
        {item.type === 'lesson' && (
          <Lesson item={item} onChange={setItem} nextHref={nextHref} nextLabel={nextLabel} />
        )}
        {item.type === 'knowledge_check' && (
          <Quiz item={item} onChange={setItem} nextHref={nextHref} nextLabel={nextLabel} />
        )}
        {item.type === 'scorm' && item.scorm && (
          <ScormPlayer item={item} onChange={setItem} nextHref={nextHref} nextLabel={nextLabel} />
        )}
        {item.type === 'video' && item.video && (
          <VideoPlayer item={item} onChange={setItem} nextHref={nextHref} nextLabel={nextLabel} />
        )}
        {item.type === 'external_link' && item.link && (
          <ExternalLinkItem
            item={item}
            onChange={setItem}
            nextHref={nextHref}
            nextLabel={nextLabel}
          />
        )}
        {item.type === 'tool' && (
          <ToolItem item={item} onChange={setItem} nextHref={nextHref} nextLabel={nextLabel} />
        )}
        {item.type === 'interview' && (
          <Interview item={item} onChange={setItem} nextHref={nextHref} nextLabel={nextLabel} />
        )}
        {item.type === 'profile' && (
          <TalentProfileItem
            item={item}
            onChange={setItem}
            nextHref={nextHref}
            nextLabel={nextLabel}
          />
        )}
      </div>
    </>
  )
}

/** What a scored attempt just added to the learner's plan, and why. Nothing is shown when nothing was added. */
function PlanAddedCard({ added, cohortId }: { added: PlanAddition[]; cohortId: string }) {
  const { href } = useApp()
  if (added.length === 0) return null
  return (
    <div className="dash-card dash-plan-added" role="status">
      <h3 className="dash-extcard-h">Added to your plan</h3>
      <p>
        Your answers show some skills need more practice.{' '}
        {added.length === 1 ? 'This item was' : 'These items were'} added to your course, and you
        finish the course by completing {added.length === 1 ? 'it' : 'them'}:
      </p>
      <ul className="dash-plan-list">
        {added.map((a) => (
          <li key={a.itemId}>
            <a href={href(`/lms/learning/${cohortId}/${a.itemId}`)}>{a.title}</a>
            {a.review && <span className="dash-muted"> (review: you have done this before)</span>}
            <span className="dash-muted">
              {' '}
              Because your {a.skill} result was {a.pct}%.
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="dash-form-actions dash-player-actions">{children}</div>
}

function Lesson(props: {
  item: LearnerItem
  onChange: (i: LearnerItem) => void
  nextHref: string
  nextLabel: string
}) {
  const { item } = props
  const send = useApiSend()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function done() {
    setBusy(true)
    setError(null)
    try {
      props.onChange(
        await send<LearnerItem>(
          'POST',
          `/learn/me/cohorts/${item.cohortId}/items/${item.id}/complete`
        )
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <article className="dash-card dash-lesson">
      <RichText text={item.body ?? ''} />
      {error && <p className="dash-error">{error}</p>}
      <Actions>
        {item.status !== 'completed' ? (
          <button
            type="button"
            className="dash-btn"
            onClick={done}
            disabled={busy || !!item.locked}
          >
            {busy ? 'Saving…' : 'Mark as done'}
          </button>
        ) : (
          <>
            <span className="dash-chip dash-chip-on">Done</span>
            <a className="dash-btn" href={props.nextHref}>
              {props.nextLabel}
            </a>
          </>
        )}
      </Actions>
    </article>
  )
}

function Quiz(props: {
  item: LearnerItem
  onChange: (i: LearnerItem) => void
  nextHref: string
  nextLabel: string
}) {
  const { item } = props
  const questions = item.questions ?? []
  const send = useApiSend()
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null))
  const [result, setResult] = useState<QuizResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const finished = result !== null

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const out = await send<{ result: QuizResult; item: LearnerItem }>(
        'POST',
        `/learn/me/cohorts/${item.cohortId}/items/${item.id}/answers`,
        { answers }
      )
      setResult(out.result)
      props.onChange(out.item)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (questions.length === 0) {
    return <p className="dash-muted">The author has not added questions here yet.</p>
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <ol className="dash-quiz">
        {questions.map((q, i) => (
          <li key={i} className="dash-card dash-quiz-q">
            <fieldset disabled={finished || !!item.locked}>
              <legend>{q.prompt}</legend>
              {q.options.map((o, j) => {
                const picked = answers[i] === j
                const mark = result
                  ? result.correctIndexes[i] === j
                    ? 'right'
                    : picked
                      ? 'wrong'
                      : ''
                  : ''
                return (
                  <label
                    key={j}
                    className={`dash-radio dash-quiz-option ${mark ? `dash-quiz-${mark}` : ''}`}
                  >
                    <input
                      type="radio"
                      name={`q-${i}`}
                      checked={picked}
                      onChange={() => setAnswers(answers.map((a, k) => (k === i ? j : a)))}
                    />
                    {o}
                    {mark === 'right' && <span className="dash-quiz-flag"> ✓ correct</span>}
                    {mark === 'wrong' && <span className="dash-quiz-flag"> ✗ your answer</span>}
                  </label>
                )
              })}
            </fieldset>
          </li>
        ))}
      </ol>
      {error && <p className="dash-error">{error}</p>}
      {result ? (
        <div className="dash-card dash-quiz-result" role="status">
          <p>
            You scored <strong>{score(result.score)}</strong> (
            {result.correct.filter(Boolean).length} of {result.correct.length} correct).
          </p>
          <PlanAddedCard added={item.planAdded} cohortId={item.cohortId} />
          <Actions>
            <button
              type="button"
              className="dash-btn-secondary"
              onClick={() => {
                setResult(null)
                setAnswers(questions.map(() => null))
              }}
            >
              Try again
            </button>
            <a className="dash-btn" href={props.nextHref}>
              {props.nextLabel}
            </a>
          </Actions>
        </div>
      ) : (
        <Actions>
          <button
            type="submit"
            className="dash-btn"
            disabled={busy || !!item.locked || answers.some((a) => a === null)}
          >
            {busy ? 'Checking…' : 'Check my answers'}
          </button>
          {item.status === 'completed' && (
            <span className="dash-muted">Best score so far: {score(item.score)}</span>
          )}
        </Actions>
      )}
    </form>
  )
}

function Interview(props: {
  item: LearnerItem
  onChange: (i: LearnerItem) => void
  nextHref: string
  nextLabel: string
}) {
  const { item } = props
  const iv = item.interview
  const send = useApiSend()
  const [answers, setAnswers] = useState<string[]>(() => (iv?.questions ?? []).map(() => ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showResult, setShowResult] = useState(false)
  if (!iv || iv.questions.length === 0) {
    return <p className="dash-muted">The author has not added interview questions yet.</p>
  }
  const left = iv.maxAttempts - item.attempts
  const latest = iv.attempts[iv.attempts.length - 1]
  const ready = answers.every((a) => a.trim().length > 0)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      props.onChange(
        await send<LearnerItem>(
          'POST',
          `/learn/me/cohorts/${item.cohortId}/items/${item.id}/interview`,
          { answers }
        )
      )
      setShowResult(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const results = showResult && latest && (
    <section className="dash-card dash-quiz-result" role="status" aria-label="Your feedback">
      <p>
        This attempt: <strong>{score(latest.score)}</strong>. Your best score:{' '}
        <strong>{score(item.score)}</strong>.
      </p>
      <ol className="dash-feedback">
        {iv.questions.map((q, i) => (
          <li key={i}>
            <p className="dash-feedback-q">{q}</p>
            <p>
              <span className="dash-chip">{score(latest.answers[i]?.score ?? null)}</span>{' '}
              {latest.answers[i]?.feedback}
            </p>
          </li>
        ))}
      </ol>
      <PlanAddedCard added={item.planAdded} cohortId={item.cohortId} />
      <Actions>
        {left > 0 && (
          <button
            type="button"
            className="dash-btn-secondary"
            onClick={() => {
              setShowResult(false)
              setAnswers(iv.questions.map(() => ''))
            }}
          >
            Try again ({left} left)
          </button>
        )}
        <a className="dash-btn" href={props.nextHref}>
          {props.nextLabel}
        </a>
      </Actions>
    </section>
  )

  return (
    <>
      <div className="dash-card dash-lesson">
        <p>
          Practice interview for <strong>{iv.role || 'this role'}</strong>. Answer each question in
          your own words, a few sentences each, the way you would in a real interview.
        </p>
        <p className="dash-muted">
          {iv.maxAttempts === 1
            ? 'You have one attempt, so take your time. Your score counts toward your readiness record.'
            : `You can try up to ${iv.maxAttempts} times and your best score counts.`}{' '}
          {iv.maxAttempts > 1 && item.attempts > 0 && `You have used ${item.attempts}. `}
          {iv.maxAttempts > 1 && item.score !== null && `Best so far: ${score(item.score)}.`}
        </p>
      </div>

      {results}

      {!showResult && left > 0 && !item.locked && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <ol className="dash-quiz">
            {iv.questions.map((q, i) => (
              <li key={i} className="dash-card dash-quiz-q">
                <label className="dash-field">
                  <span>{q}</span>
                  <textarea
                    rows={5}
                    value={answers[i]}
                    maxLength={2000}
                    onChange={(e) =>
                      setAnswers(answers.map((a, k) => (k === i ? e.target.value : a)))
                    }
                  />
                </label>
              </li>
            ))}
          </ol>
          {error && <p className="dash-error">{error}</p>}
          <Actions>
            <button type="submit" className="dash-btn" disabled={busy || !ready}>
              {busy ? 'Scoring your answers…' : 'Get my score and feedback'}
            </button>
            <a className="dash-btn-quiet dash-btn-link" href={props.nextHref}>
              Skip for now
            </a>
          </Actions>
        </form>
      )}

      {!showResult && left <= 0 && (
        <p className="dash-muted">
          You have used all {iv.maxAttempts} attempts. Your best score is {score(item.score)}.{' '}
          <a href={props.nextHref}>{props.nextLabel}</a>
        </p>
      )}

      <p className="dash-muted dash-simulator-note">
        Want a longer, more realistic scenario?{' '}
        <a
          href="https://interviewdifferently.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Skill Simulator
        </a>
        .
      </p>
    </>
  )
}

/**
 * Posts the launch fields to the tool in this same window; the tool sends the learner back with a
 * return link. Values are set as properties, never as HTML.
 */
function submitLaunchForm(action: string, fields: Record<string, string>) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = action
  form.target = '_self'
  form.style.display = 'none'
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
  form.remove()
}

/** An activity in a connected tool: the learner goes to the tool in this window and comes back with a score. */
function ToolItem(props: {
  item: LearnerItem
  onChange: (i: LearnerItem) => void
  nextHref: string
  nextLabel: string
}) {
  const { item } = props
  const tool = item.tool
  const send = useApiSend()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The launch leaves this page in the same window; Back can restore it from the browser's cache
  // exactly as it was, with the button still on "Opening…".
  useEffect(
    () =>
      onPageRestore(window, () => {
        setBusy(false)
        setError(null)
      }),
    []
  )

  async function open(mode?: 'review') {
    setBusy(true)
    setError(null)
    try {
      const out = await send<{ action: string; fields: Record<string, string> }>(
        'POST',
        `/learn/me/cohorts/${item.cohortId}/items/${item.id}/tool-launch`,
        mode ? { mode } : undefined
      )
      submitLaunchForm(out.action, out.fields)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  if (!tool) {
    return (
      <article className="dash-card dash-lesson">
        <p>This activity is not available right now. Tell your instructor.</p>
        <Actions>
          <a className="dash-btn" href={props.nextHref}>
            {props.nextLabel}
          </a>
        </Actions>
      </article>
    )
  }

  const log = item
  const completed = item.status === 'completed'
  const copy = readyCopy(tool, item.attempts)
  const result = resultCopy(item.score)
  const limited = tool.attemptsAllowed !== null
  const limitNote = timeLimitNote(tool.timeLimitMinutes)
  return (
    <article className="dash-card dash-lesson">
      {completed ? (
        <div className="dash-result">
          <div
            className="dash-result-ring"
            style={{ '--pct': `${Math.max(0, Math.min(100, item.score ?? 0))}%` } as CSSProperties}
          >
            <span>{score(item.score)}</span>
          </div>
          <div className="dash-result-body">
            <span className="dash-chip dash-chip-on">Completed</span>
            <h2 className="dash-result-title">{result.heading}</h2>
            <p className="dash-muted">{result.body}</p>
            <p className="dash-result-facts">
              {item.score !== null && <>Best score {score(item.score)} · </>}
              {limited
                ? attemptLine(item.attempts, tool.attemptsAllowed as number, true)
                : `${item.attempts} ${item.attempts === 1 ? 'attempt' : 'attempts'}`}
            </p>
          </div>
        </div>
      ) : (
        <div className="dash-ready-card">
          {tool.optional && (
            <p className="dash-muted">Optional: you can finish the course without it.</p>
          )}
          {item.score !== null && tool.passScore !== null && (
            <p className="dash-ready-miss" role="status">
              Your best result so far is {score(item.score)}. You need {tool.passScore}% to complete
              this
              {tool.retries
                ? ': give it another go.'
                : '. You have used all your attempts, so ask your instructor.'}
            </p>
          )}
          <h2 className="dash-ready-title">{copy.heading}</h2>
          <p className="dash-ready-intro">{copy.intro}</p>
          <ul className="dash-ready-points">
            {copy.points.map((p) => (
              <li key={p.title}>
                <span className="dash-ready-icon" aria-hidden="true">
                  {p.icon}
                </span>
                <strong>{p.title}</strong>
                <span>{p.body}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <YourAttempts attempts={log.attemptLog} attemptsBeforeLog={log.attemptsBeforeLog} />
      {completed && limitNote && tool.retries && <p className="dash-muted">{limitNote}</p>}
      {error && <p className="dash-error">{error}</p>}
      <Actions>
        {completed ? (
          <>
            <a className="dash-btn" href={props.nextHref}>
              {props.nextLabel}
            </a>
            {tool.reviewable && (
              <button
                type="button"
                className="dash-btn-secondary"
                onClick={() => open('review')}
                disabled={busy}
              >
                {busy ? 'Opening…' : 'Review your answers'}
              </button>
            )}
            {tool.retries && (
              <button
                type="button"
                className="dash-btn-secondary"
                onClick={() => open()}
                disabled={busy || !!item.locked}
              >
                {busy ? 'Opening…' : 'Try again'}
              </button>
            )}
          </>
        ) : tool.reviewable ? (
          // attempts used up without reaching the pass mark: nothing left to launch, but the answers can be opened
          <button type="button" className="dash-btn" onClick={() => open('review')} disabled={busy}>
            {busy ? 'Opening…' : 'Review your answers'}
          </button>
        ) : (
          <button
            type="button"
            className="dash-btn"
            onClick={() => open()}
            disabled={busy || !!item.locked || !tool.retries}
          >
            {busy ? 'Opening…' : item.attempts > 0 ? 'Try again' : copy.start}
          </button>
        )}
      </Actions>
      {!completed && (
        <p className="dash-muted dash-ready-note">
          It opens in this window, and you land back here with your score.
        </p>
      )}
    </article>
  )
}

type ScormApi = Scorm12API | Scorm2004API

/**
 * A course on another site. We cannot see what the learner does there, so they
 * open it, do the work, and confirm; the record says the completion was
 * self-reported.
 */
const PROVIDERS: [string, string][] = [
  ['udemy.com', 'Udemy'],
  ['coursera.org', 'Coursera'],
  ['khanacademy.org', 'Khan Academy'],
  ['edx.org', 'edX'],
  ['learn.microsoft.com', 'Microsoft Learn'],
  ['skillshop.withgoogle.com', 'Google Skillshop'],
  ['pluralsight.com', 'Pluralsight'],
  ['linkedin.com', 'LinkedIn Learning'],
]
/** A friendly provider name for a link's host, or the host itself. */
const providerName = (host: string): string =>
  PROVIDERS.find(([d]) => host === d || host.endsWith(`.${d}`))?.[1] ?? host

function ExternalLinkItem(props: {
  item: LearnerItem
  onChange: (i: LearnerItem) => void
  nextHref: string
  nextLabel: string
}) {
  const { item } = props
  const link = item.link as NonNullable<LearnerItem['link']>
  const provider = providerName(link.host)
  const send = useApiSend()
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const done = item.status === 'completed'

  async function finish() {
    setBusy(true)
    setError(null)
    try {
      props.onChange(
        await send<LearnerItem>(
          'POST',
          `/learn/me/cohorts/${item.cohortId}/items/${item.id}/external`
        )
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="dash-card dash-extcard">
      {link.imageUrl && (
        <img
          className="dash-extcard-image"
          src={link.imageUrl}
          alt=""
          width={640}
          height={360}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}
      <div className="dash-extcard-body">
        <p className="dash-extcard-provider">
          <span className="dash-chip">{provider}</span>
          <span className="dash-muted">Opens on {link.host}</span>
        </p>
        {link.summary && <p className="dash-extcard-summary">{link.summary}</p>}
        {link.instructions && (
          <div className="dash-extcard-task">
            <h3 className="dash-extcard-h">Your task</h3>
            <RichText text={link.instructions} />
          </div>
        )}
        <div className="dash-extcard-open">
          <a
            className={done ? 'dash-btn-secondary dash-btn-link' : 'dash-btn dash-btn-link'}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open on {provider} <span aria-hidden="true">↗</span>
            <span className="dash-visually-hidden"> (opens in a new tab)</span>
          </a>
        </div>
        {error && <p className="dash-error">{error}</p>}
        <div className="dash-extcard-footer">
          {!done && (
            <>
              <label className="dash-radio">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={!!item.locked}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I finished this course on {provider}
              </label>
              <button
                type="button"
                className="dash-btn"
                onClick={finish}
                disabled={busy || !confirmed || !!item.locked}
              >
                {busy ? 'Saving…' : 'Mark as done'}
              </button>
            </>
          )}
          {done && (
            <>
              <span className="dash-extcard-done">
                <span aria-hidden="true">✓</span> Done
              </span>
              <a className="dash-btn dash-btn-link" href={props.nextHref}>
                {props.nextLabel}
              </a>
            </>
          )}
        </div>
      </div>
    </article>
  )
}

/** The parts of YouTube's IFrame Player API used here. */
interface YTPlayer {
  getCurrentTime(): number
  getDuration(): number
  destroy(): void
}
interface YTApi {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string
      host: string
      playerVars: Record<string, string | number>
      events: {
        onStateChange: (e: { data: number }) => void
        onError: (e: { data: number }) => void
      }
    }
  ) => YTPlayer
  PlayerState: { PLAYING: number }
}
type YTWindow = Window & { YT?: YTApi; onYouTubeIframeAPIReady?: () => void }

let ytApi: Promise<YTApi> | null = null
/** Loads YouTube's player script once. Rejects if it is blocked or slow. */
function loadYouTube(): Promise<YTApi> {
  const w = window as YTWindow
  if (w.YT?.Player) return Promise.resolve(w.YT)
  ytApi ??= new Promise<YTApi>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      ytApi = null
      reject(new Error('timeout'))
    }, 10000)
    w.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timer)
      resolve(w.YT as YTApi)
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    tag.onerror = () => {
      window.clearTimeout(timer)
      ytApi = null
      reject(new Error('blocked'))
    }
    document.head.appendChild(tag)
  })
  return ytApi
}

/**
 * Plays a YouTube video and counts the seconds actually played (skipping ahead
 * adds nothing). "Mark as done" unlocks at the share the server asks for. If
 * the video will not play, the learner can mark it done by hand; the record
 * says which way it was finished.
 */
function VideoPlayer(props: {
  item: LearnerItem
  onChange: (i: LearnerItem) => void
  nextHref: string
  nextLabel: string
}) {
  const { item } = props
  const video = item.video as NonNullable<LearnerItem['video']>
  const send = useApiSend()
  const stage = useRef<HTMLDivElement>(null)
  const watched = useRef(new Set<number>())
  const [pct, setPct] = useState(0)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const done = item.status === 'completed'

  useEffect(() => {
    if (done) return
    let player: YTPlayer | null = null
    let timer: number | undefined
    let cancelled = false
    const holder = stage.current
    loadYouTube()
      .then((YT) => {
        if (cancelled || !holder) return
        const el = document.createElement('div')
        holder.appendChild(el)
        let last: number | null = null
        const tick = () => {
          if (!player) return
          const now = player.getCurrentTime()
          const total = player.getDuration()
          if (last !== null && now >= last && now - last <= 3) {
            for (let s = Math.floor(last); s <= Math.floor(now); s++) watched.current.add(s)
          }
          last = now
          if (total > 0) setPct(Math.min(100, Math.round((watched.current.size / total) * 100)))
        }
        player = new YT.Player(el, {
          videoId: video.videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            rel: 0,
            origin: window.location.origin,
            ...(video.startSeconds ? { start: video.startSeconds } : {}),
          },
          events: {
            onStateChange: (e) => {
              window.clearInterval(timer)
              last = null
              if (e.data === YT.PlayerState.PLAYING) timer = window.setInterval(tick, 500)
              else tick()
            },
            onError: () => setFailed(true),
          },
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      window.clearInterval(timer)
      player?.destroy()
      if (holder) holder.innerHTML = ''
    }
  }, [video.videoId, video.startSeconds, done])

  async function finish(completedBy: 'player' | 'manual') {
    setBusy(true)
    setError(null)
    try {
      props.onChange(
        await send<LearnerItem>(
          'POST',
          `/learn/me/cohorts/${item.cohortId}/items/${item.id}/video`,
          { completedBy, watchedPct: pct }
        )
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const ready = pct >= video.minWatchedPct
  return (
    <article className="dash-card dash-lesson">
      {!done && !failed && <div className="dash-video-frame" ref={stage} />}
      {!done && failed && (
        <p className="dash-banner">
          This video would not play here. You can{' '}
          <a
            href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            open it on YouTube
          </a>{' '}
          and mark it done when you have watched it.
        </p>
      )}
      {error && <p className="dash-error">{error}</p>}
      <Actions>
        {!done && !failed && (
          <>
            <button
              type="button"
              className="dash-btn"
              onClick={() => finish('player')}
              disabled={busy || !ready || !!item.locked}
            >
              {busy ? 'Saving…' : 'Mark as done'}
            </button>
            <span className="dash-muted" aria-live="polite">
              {ready
                ? 'You have watched enough to finish.'
                : `Watched ${pct}%. Watch at least ${video.minWatchedPct}% to finish.`}
            </span>
          </>
        )}
        {!done && failed && (
          <button
            type="button"
            className="dash-btn"
            onClick={() => finish('manual')}
            disabled={busy || !!item.locked}
          >
            {busy ? 'Saving…' : 'I watched it, mark as done'}
          </button>
        )}
        {done && (
          <>
            <span className="dash-chip dash-chip-on">Done</span>
            <a className="dash-btn" href={props.nextHref}>
              {props.nextLabel}
            </a>
          </>
        )}
      </Actions>
    </article>
  )
}

/**
 * Plays a SCORM package. The package runs in an iframe on this same origin and
 * finds the player through window.API (SCORM 1.2) or window.API_1484_11 (2004),
 * which scorm-again provides. What the package reports is saved to our API.
 */
function ScormPlayer(props: {
  item: LearnerItem
  onChange: (i: LearnerItem) => void
  nextHref: string
  nextLabel: string
}) {
  const { item } = props
  const scorm = item.scorm as NonNullable<LearnerItem['scorm']>
  const send = useApiSend()
  const sendRef = useRef(send)
  sendRef.current = send
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [ready, setReady] = useState(false)
  const version = scorm.version
  const globalName = version === '2004' ? 'API_1484_11' : 'API'

  useEffect(() => {
    if (item.locked) return
    const api: ScormApi =
      version === '2004'
        ? new Scorm2004API({ autocommit: true, autocommitSeconds: 8, logLevel: 5 })
        : new Scorm12API({ autocommit: true, autocommitSeconds: 8, logLevel: 5 })
    if (scorm.cmi) {
      try {
        api.loadFromJSON(scorm.cmi as Record<string, unknown>)
      } catch {
        /* a snapshot from an older package version: start fresh */
      }
    }
    ;(window as unknown as Record<string, unknown>)[globalName] = api
    setReady(true)

    let timer: ReturnType<typeof setTimeout> | undefined
    const push = async () => {
      const c = api.renderCommitObject(false)
      setSaved('saving')
      try {
        const next = await sendRef.current<LearnerItem>(
          'POST',
          `/learn/me/cohorts/${item.cohortId}/items/${item.id}/scorm`,
          {
            completionStatus: c.completionStatus,
            successStatus: c.successStatus,
            score: c.score,
            runtimeData: c.runtimeData,
          }
        )
        props.onChange(next)
        setSaved('saved')
      } catch {
        setSaved('error')
      }
    }
    const soon = () => {
      clearTimeout(timer)
      timer = setTimeout(push, 1200)
    }
    const events =
      version === '2004'
        ? [
            'Commit',
            'Terminate',
            'SetValue.cmi.completion_status',
            'SetValue.cmi.success_status',
            'SetValue.cmi.score.raw',
          ]
        : [
            'LMSCommit',
            'LMSFinish',
            'LMSSetValue.cmi.core.lesson_status',
            'LMSSetValue.cmi.core.score.raw',
          ]
    events.forEach((e) => api.on(e, soon))

    return () => {
      clearTimeout(timer)
      void push()
      delete (window as unknown as Record<string, unknown>)[globalName]
    }
    // The package runs for the life of this page; re-creating the API would reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.locked])

  if (item.locked) return <p className="dash-muted">{item.locked}</p>
  return (
    <>
      {ready && (
        <iframe
          className="dash-scorm-frame"
          title={item.title}
          src={scorm.src}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
        />
      )}
      <Actions>
        {item.status === 'completed' && (
          <span className="dash-chip dash-chip-on">
            Completed{item.score !== null ? ` · ${score(item.score)}` : ''}
          </span>
        )}
        <span className="dash-muted" role="status">
          {saved === 'saving'
            ? 'Saving…'
            : saved === 'saved'
              ? 'Progress saved.'
              : saved === 'error'
                ? 'Could not save. Your progress is kept in this window.'
                : 'Progress saves automatically.'}
        </span>
        <a className="dash-btn" href={props.nextHref}>
          {props.nextLabel}
        </a>
      </Actions>
    </>
  )
}
