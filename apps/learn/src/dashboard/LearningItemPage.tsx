import type { LearnerItem, LearnerOutline, QuizResult } from '@id/types'
import { useEffect, useState, type ReactNode } from 'react'
import { useApiSend, useLoad } from './api'
import { useApp } from './app-context'
import { score } from './format'
import { TYPE_LABEL } from './ItemEditor'
import { errorNotice } from './shared'

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

  // The next item in the course, for "Continue".
  const flat = outline.data?.modules.flatMap((m) => m.items) ?? []
  const next = flat[flat.findIndex((i) => i.id === item.id) + 1]
  const nextHref = next ? href(`/learning/${cohortId}/${next.id}`) : href(`/learning/${cohortId}`)

  return (
    <>
      <p className="dash-back">
        <a href={href(`/learning/${cohortId}`)}>
          ← {outline.data?.cohort.courseTitle ?? 'Back to course'}
        </a>
      </p>
      <p className="dash-item-type dash-item-kicker">
        {TYPE_LABEL[item.type] ?? item.type}
        {item.label ? ` · ${item.label}-assessment` : ''}
      </p>
      <h1 className="dash-h2">{item.title}</h1>
      {item.locked && <p className="dash-banner">{item.locked}</p>}

      <div className="dash-player">
        {item.type === 'lesson' && (
          <Lesson
            item={item}
            onChange={setItem}
            nextHref={nextHref}
            nextLabel={next ? 'Continue' : 'Back to course'}
          />
        )}
        {(item.type === 'knowledge_check' || item.type === 'assessment') && (
          <Quiz
            item={item}
            onChange={setItem}
            nextHref={nextHref}
            nextLabel={next ? 'Continue' : 'Back to course'}
          />
        )}
        {item.type === 'interview' && (
          <Interview
            item={item}
            nextHref={nextHref}
            nextLabel={next ? 'Continue' : 'Back to course'}
          />
        )}
      </div>
    </>
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
  const isAssessment = item.type === 'assessment'
  const finished = result !== null || (isAssessment && item.status === 'completed')

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
  if (isAssessment && item.status === 'completed' && !result) {
    return (
      <div className="dash-card">
        <p>
          You completed this assessment. Your score: <strong>{score(item.score)}</strong>
        </p>
        <Actions>
          <a className="dash-btn" href={props.nextHref}>
            {props.nextLabel}
          </a>
        </Actions>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      {isAssessment && !finished && (
        <p className="dash-banner">
          This assessment counts once, so take your time. You will see your score when you finish.
        </p>
      )}
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
          <Actions>
            {!isAssessment && (
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
            )}
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
            {busy ? 'Checking…' : isAssessment ? 'Submit assessment' : 'Check my answers'}
          </button>
          {item.status === 'completed' && !isAssessment && (
            <span className="dash-muted">Best score so far: {score(item.score)}</span>
          )}
        </Actions>
      )}
    </form>
  )
}

function Interview(props: { item: LearnerItem; nextHref: string; nextLabel: string }) {
  const { item } = props
  return (
    <div className="dash-card dash-lesson">
      {item.scenario ? (
        <p>
          Practice interview: <strong>{item.scenario.title}</strong>
        </p>
      ) : (
        <p className="dash-muted">The author has not chosen a practice interview yet.</p>
      )}
      <p>
        Answer realistic interview questions in Skill Simulator and get scored feedback. Your
        instructor records your best score on your readiness record.
      </p>
      {item.status === 'completed' ? (
        <p>
          Recorded score: <strong>{score(item.score)}</strong>
        </p>
      ) : (
        <p className="dash-muted">No score recorded yet.</p>
      )}
      <Actions>
        <a
          className="dash-btn-secondary"
          href="https://interviewdifferently.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Skill Simulator
        </a>
        <a className="dash-btn" href={props.nextHref}>
          {props.nextLabel}
        </a>
      </Actions>
    </div>
  )
}
