import { useEffect, useRef, useState } from 'react'
import type {
  CheckpointAnswerResult,
  CheckpointAnswerState,
  CheckpointTask,
  CheckpointView,
} from '@id/types'
import {
  REPLY_ROWS,
  cellText,
  firstName,
  firstOpenRef,
  initials,
  isSettled,
  missReply,
  openingLine,
  postToParent,
  progress,
  replyKind,
  shownTasks,
} from '@/lib/checkpoint'
import type { CheckpointClient } from '@/services/checkpointService'
import { CheckpointWorkbench } from './CheckpointWorkbench'

/** How long "typing…" shows before a new request lands, so it reads like a message. */
const TYPING_MS = 900

/**
 * The checkpoint as a morning at work (GitHub issue #90; ported from the LMS prototype's WorkSim): colleagues send
 * one request at a time, the learner answers each in the workbench beside the thread. A diagnostic lets them pass
 * on what they have not learned yet. Every answer is graded on the server; after each one the LMS page around the
 * frame is told, so it can read the new evidence. The learner's reply shows the rows their query returned (the
 * query itself is one click away), as if they sent the report. `standalone`: opened in Interview Differently, not
 * from a course, so the wrap-up gives the score instead of pointing at the course.
 */
export function CheckpointChat({
  view,
  client,
  framed,
  standalone = false,
  onView,
  onSessionEnded,
}: {
  view: CheckpointView
  client: CheckpointClient
  framed: boolean
  standalone?: boolean
  onView: (view: CheckpointView) => void
  onSessionEnded: () => void
}) {
  const [active, setActive] = useState<string | null>(() => firstOpenRef(view))
  const [typing, setTyping] = useState(false)
  // The editor takes focus for a request that arrives after an answer, never on first load.
  const [moved, setMoved] = useState(false)
  const thread = useRef<HTMLOListElement>(null)
  const wrapUp = useRef<HTMLDivElement>(null)
  const task = view.tasks.find((t) => t.ref === active) ?? null
  const shown = shownTasks(view, active)
  const { answered, right, total } = progress(view)
  const opening = openingLine(view)
  const finished = active === null && view.done

  useEffect(() => {
    if (!active) return
    setTyping(true)
    const t = window.setTimeout(() => setTyping(false), TYPING_MS)
    return () => window.clearTimeout(t)
  }, [active])

  // Outside a frame the thread follows the newest message; in a frame the LMS page owns the scrolling.
  useEffect(() => {
    if (framed) return
    thread.current?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [framed, active, typing, view])

  // When the last answer takes the workbench away, focus lands on the wrap-up instead of the page body.
  useEffect(() => {
    if (moved && active === null) wrapUp.current?.focus()
  }, [moved, active])

  const moveOn = (after: CheckpointView) => {
    setMoved(true)
    setActive(firstOpenRef(after))
  }

  const onAnswered = (r: CheckpointAnswerResult, passed: boolean) => {
    if (!task) return
    onView(r.view)
    postToParent({ subject: 'id.checkpoint.answered', ref: task.ref, done: r.view.done })
    // A miss stays on screen so the learner can try again or move on; where each request takes one answer (a
    // diagnostic, a work simulation) it is final, so the colleague moves on (the server refuses a second answer).
    if (r.correct || passed || view.oneAnswer) moveOn(r.view)
  }

  if (view.tasks.length === 0) {
    return (
      <p className="px-6 py-16 text-center text-fg text-[15px]" role="status">
        This checkpoint has no requests yet. Tell your instructor.
      </p>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-start">
      <section
        className={`grid gap-3 p-4 rounded-xl border border-edge/10 bg-surface-alt ${
          framed ? '' : 'lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto'
        }`}
        aria-label="Requests from colleagues"
      >
        <header className="flex items-baseline justify-between gap-2 pb-2 border-b border-edge/10">
          <strong className="text-[13px] text-fg"># data-requests</strong>
          <span className="text-[12px] text-slate-mid">
            {answered} of {total} answered
          </span>
        </header>
        <ol className="grid gap-2.5" ref={thread} aria-live="polite" aria-relevant="additions text">
          {opening && (
            <li className="px-3.5 py-3 rounded-lg border-l-4 border-green-light bg-green-light/10 text-[14px] text-fg leading-relaxed">
              {opening}
            </li>
          )}
          {shown.map((t) => {
            const answer = view.answers[t.ref]
            return (
              <li key={t.ref} className="grid gap-1.5">
                <RequestBubble
                  task={t}
                  n={view.tasks.indexOf(t) + 1}
                  typing={t.ref === active && typing}
                />
                {answer && isSettled(answer) && (
                  <Reply task={t} answer={answer} deciding={t.ref === active} />
                )}
              </li>
            )
          })}
          {finished && (
            <li className="grid">
              <Bubble who="Your manager">
                {standalone
                  ? `That’s everything for now. You got ${right} of ${total} right${
                      view.scorePct === null ? '' : ` (${view.scorePct}%)`
                    }.`
                  : 'That’s everything for now. Your course has been updated.'}
              </Bubble>
            </li>
          )}
        </ol>
        <div ref={wrapUp} tabIndex={-1} className="outline-hidden">
          {active === null && !view.done && (
            <p className="text-[13px] text-slate-mid" role="status">
              All requests answered. Finishing up…
            </p>
          )}
          {finished && <span className="sr-only">All requests answered.</span>}
        </div>
      </section>

      {task && (
        <CheckpointWorkbench
          key={task.ref}
          task={task}
          schema={view.schema}
          diagnostic={view.diagnostic}
          oneAnswer={view.oneAnswer}
          client={client}
          focusEditor={moved}
          onAnswered={onAnswered}
          onMoveOn={() => moveOn(view)}
          onSessionEnded={onSessionEnded}
        />
      )}
    </div>
  )
}

function RequestBubble({ task, n, typing }: { task: CheckpointTask; n: number; typing: boolean }) {
  const who = task.from ?? `Request ${n}`
  return (
    <Bubble who={who} plain={!task.from}>
      {typing ? (
        <>
          <span className="inline-flex gap-1 py-1" aria-hidden="true">
            {[0, 150, 300].map((d) => (
              <span
                key={d}
                className="w-1.5 h-1.5 rounded-full bg-slate-mid motion-safe:animate-bounce"
                style={{ animationDelay: `${d}ms` }}
              />
            ))}
          </span>
          <span className="sr-only">
            {task.from ? `${firstName(task.from)} is typing` : 'Loading the request'}
          </span>
        </>
      ) : (
        task.prompt
      )}
    </Bubble>
  )
}

/**
 * What the thread shows under a settled request: the learner's reply, and the colleague's answer to it. While the
 * learner is still deciding after a miss (`deciding`), the workbench speaks for the colleague instead.
 */
function Reply({
  task,
  answer,
  deciding,
}: {
  task: CheckpointTask
  answer: CheckpointAnswerState
  deciding: boolean
}) {
  const kind = replyKind(answer)
  const first = firstName(task.from, 'They')
  const tries = answer.tries > 1 ? ` · ${answer.tries} tries` : ''
  return (
    <>
      <Bubble who="You" mine>
        {kind === 'passed' ? (
          'I have not learned this one yet.'
        ) : (
          <>
            <SentReport answer={answer} />
            <span
              className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                kind === 'right' ? 'bg-emerald-400/20 text-on-primary' : 'bg-ink/15 text-on-primary'
              }`}
            >
              {kind === 'right' ? '✓ Right' : 'Not quite'}
              {tries}
            </span>
          </>
        )}
      </Bubble>
      {task.from && !(deciding && kind === 'missed') && (
        <Bubble who={task.from}>
          {kind === 'right'
            ? 'Perfect, that is exactly it. Thanks!'
            : kind === 'passed'
              ? `No problem! It is in your course; ${first} will ask again later.`
              : missReply(task.ref, task.from)}
        </Bubble>
      )}
    </>
  )
}

/**
 * The learner's reply as the report they sent: the first rows of what their query returned and how many there were,
 * with the query behind a toggle. An answer recorded before results were kept shows the query instead.
 */
function SentReport({ answer }: { answer: CheckpointAnswerState }) {
  const [open, setOpen] = useState(false)
  const p = answer.preview
  if (!p && !answer.error)
    return answer.sql ? (
      <code className="block whitespace-pre-wrap font-mono text-[12px] leading-relaxed">
        {answer.sql}
      </code>
    ) : null
  const shown = p ? p.rows.slice(0, REPLY_ROWS) : []
  return (
    <>
      {!p ? (
        <span className="block">My query did not run.</span>
      ) : p.columns.length === 0 ? (
        <span className="block">No rows came back.</span>
      ) : (
        <div className="overflow-x-auto rounded-md bg-ink/15">
          <table className="text-[11px] font-mono border-collapse">
            <thead>
              <tr>
                {p.columns.map((c, i) => (
                  <th key={i} className="px-2 py-1 text-left font-bold whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, ri) => (
                <tr key={ri} className="border-t border-on-primary/15">
                  {p.columns.map((_, ci) => (
                    <td key={ci} className="px-2 py-0.5 whitespace-nowrap">
                      {cellText(row[ci])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {p && p.columns.length > 0 && (
        <span className="block mt-1 text-[11px] opacity-80">
          {p.rowCount} {p.rowCount === 1 ? 'row' : 'rows'}
          {p.rowCount > shown.length ? ` · first ${shown.length} shown` : ''}
        </span>
      )}
      {answer.sql && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="block mt-1 text-[11px] font-semibold underline underline-offset-2 opacity-90 hover:opacity-100"
          >
            {open ? 'Hide query' : 'Show query'}
          </button>
          {open && (
            <code className="block mt-1 whitespace-pre-wrap font-mono text-[12px] leading-relaxed">
              {answer.sql}
            </code>
          )}
        </>
      )}
    </>
  )
}

function Bubble({
  who,
  mine,
  plain,
  children,
}: {
  who: string
  mine?: boolean
  /** A request with no sender: no avatar. */
  plain?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`flex gap-2 items-start max-w-[92%] motion-safe:animate-fade-in ${mine ? 'justify-self-end' : ''}`}
    >
      {!mine && !plain && (
        <span
          className="flex-none grid place-items-center w-[30px] h-[30px] rounded-full bg-green-light text-on-accent text-[11px] font-extrabold"
          aria-hidden="true"
        >
          {initials(who)}
        </span>
      )}
      <div
        className={`min-w-0 px-3 py-2 ${
          mine
            ? 'rounded-[14px_14px_4px_14px] bg-green text-on-primary'
            : 'rounded-[14px_14px_14px_4px] bg-ink/6 text-fg'
        }`}
      >
        <span className={`block text-[11px] font-bold ${mine ? 'opacity-80' : 'text-slate-mid'}`}>
          {who}
        </span>
        <div className="mt-0.5 text-[14px] leading-normal">{children}</div>
      </div>
    </div>
  )
}
