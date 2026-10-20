import { useEffect, useRef, useState } from 'react'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { AlertTriangle, Play } from 'lucide-react'
import type {
  CheckpointAnswerResult,
  CheckpointHelp,
  CheckpointHelpKind,
  CheckpointPreview,
  CheckpointRun,
  CheckpointTable,
  CheckpointTask,
} from '@id/types'
import { SqlEditor } from '@/components/sql/SqlEditor'
import { ResultsGrid } from '@/components/sql/ResultsGrid'
import type { SandboxResult } from '@/lib/sql/sandboxDb'
import {
  SHOWN_ROWS,
  firstName,
  missReason,
  runSummary,
  shapeLabel,
  visibleMarks,
} from '@/lib/checkpoint'
import { isSessionEnded, isUnavailable, type CheckpointClient } from '@/services/checkpointService'

const HELP: { kind: CheckpointHelpKind; label: string }[] = [
  { kind: 'hint', label: 'Hint' },
  { kind: 'explain', label: 'Explain it another way' },
  { kind: 'example', label: 'Show an example' },
]

type Action = 'run' | 'send' | 'pass' | CheckpointHelpKind

const toResult = (p: CheckpointPreview): SandboxResult => ({
  columns: p.columns,
  rows: p.rows,
  allRows: p.rows,
  rowCount: p.rowCount,
  command: '',
  durationMs: 0,
})

const BTN_PRIMARY =
  'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-green hover:bg-green-light text-[12px] font-semibold text-on-primary disabled:opacity-40 transition-colors'
const BTN_SECONDARY =
  'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-edge/15 text-[12px] font-semibold text-fg hover:bg-ink/5 disabled:opacity-40 transition-colors'
const BTN_QUIET =
  'px-2.5 py-1.5 rounded-full text-[12px] font-semibold text-slate-mid hover:text-fg hover:bg-ink/5 disabled:opacity-40 transition-colors'

/**
 * Where the learner answers the request on screen: the tables, the shape of what was asked for, a SQL editor, a
 * dry run whose rows the server checks one by one, sending (or, in a diagnostic, passing), and the coach. Every
 * query runs and is graded on the server; nothing here knows the answer.
 */
export function CheckpointWorkbench({
  task,
  schema,
  diagnostic,
  oneAnswer,
  client,
  focusEditor,
  onAnswered,
  onMoveOn,
  onSessionEnded,
}: {
  task: CheckpointTask
  schema: CheckpointTable[]
  /** A diagnostic: the request may be passed. */
  diagnostic: boolean
  /** One answer per request (a diagnostic, a work simulation): after a miss the chat moves on, so no try again here. */
  oneAnswer: boolean
  client: CheckpointClient
  /** Put the cursor in the editor on arrival (a new request after an answer, not the first load). */
  focusEditor: boolean
  onAnswered: (result: CheckpointAnswerResult, passed: boolean) => void
  /** After a miss (where retries are allowed), go on to the next request without trying again. */
  onMoveOn: () => void
  onSessionEnded: () => void
}) {
  const [sql, setSql] = useState(task.starterSql ?? '')
  const [run, setRun] = useState<CheckpointRun | null>(null)
  const [help, setHelp] = useState<CheckpointHelp | null>(null)
  const [missed, setMissed] = useState<string | null>(null)
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState<{ text: string; retry: Action } | null>(null)
  // The one short line read out after an action (the grid and the coach's words are not).
  const [said, setSaid] = useState('')
  const editorRef = useRef<ReactCodeMirrorRef>(null)
  // After a miss, focus goes to the next action; after anything else, back to what had it if it was lost.
  const nextActionRef = useRef<HTMLButtonElement>(null)
  const refocus = useRef<HTMLElement | 'miss' | null>(null)
  const sqlRef = useRef(sql)
  sqlRef.current = sql
  const first = firstName(task.from)
  const sender = task.from ?? 'the request'

  useEffect(() => {
    if (!focusEditor) return
    const id = requestAnimationFrame(() => editorRef.current?.view?.focus())
    return () => cancelAnimationFrame(id)
  }, [focusEditor])

  useEffect(() => {
    if (busy) return
    const target = refocus.current
    refocus.current = null
    if (target === 'miss') nextActionRef.current?.focus()
    else if (
      target?.isConnected &&
      (!document.activeElement || document.activeElement === document.body)
    )
      target.focus()
  }, [busy])

  const act = async (what: Action) => {
    if (busy) return
    const text = sqlRef.current
    if ((what === 'run' || what === 'send') && !text.trim()) return
    refocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setBusy(what)
    setError(null)
    setSaid('')
    try {
      if (what === 'run') {
        const r = await client.run(text, task.ref)
        setRun(r)
        setSaid(runSummary(r))
      } else if (what === 'send' || what === 'pass') {
        const r = await client.answer(
          what === 'pass' ? { ref: task.ref, pass: true } : { ref: task.ref, sql: text }
        )
        if (what === 'send' && !r.correct && !oneAnswer) {
          setMissed(missReason(r))
          setSaid(`Not quite: ${missReason(r)}`)
          refocus.current = 'miss'
          if (r.preview) setRun({ preview: r.preview, error: null, check: null })
        }
        onAnswered(r, what === 'pass')
      } else {
        setHelp(null)
        setHelp(await client.help(task.ref, text, what))
        setSaid(`${HELP.find((h) => h.kind === what)?.label} ready below`)
      }
    } catch (e) {
      if (isSessionEnded(e)) return onSessionEnded()
      const coach = what !== 'run' && what !== 'send' && what !== 'pass'
      setError({
        text: isUnavailable(e)
          ? coach
            ? 'Your coach is unavailable right now. Try again in a moment.'
            : 'Grading is unavailable right now. Try again in a moment.'
          : (e as Error).message,
        retry: what,
      })
    } finally {
      setBusy(null)
    }
  }
  const runNow = () => void act('run')

  const want = task.expected
  const check = run?.check ?? null
  // Counted over the rows on screen only: the marks for the visible rows.
  const marks = run ? visibleMarks(run) : undefined
  const right = marks?.filter(Boolean).length ?? 0
  // Which wanted columns the run returned (by name, ignoring case); null before a checked run.
  const got =
    check && run?.preview && run.preview.columns.length > 0
      ? new Set(run.preview.columns.map((c) => c.toLowerCase()))
      : null
  const wants = task.from ? `What ${first} wants` : 'What is wanted'

  return (
    <section
      className="grid gap-3 p-4 rounded-xl border border-edge/10 bg-surface-alt"
      aria-label={`Workbench: replying to ${sender}`}
    >
      <header className="flex items-baseline justify-between gap-2 pb-2 border-b border-edge/10">
        <strong className="text-[13px] text-fg">Workbench</strong>
        <span className="text-[12px] text-slate-mid">Replying to {sender}</span>
      </header>

      {schema.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Tables">
          {schema.map((t) => (
            <details key={t.table} className="text-[12px] px-2.5 py-1 rounded-lg bg-ink/5">
              <summary className="cursor-pointer font-mono font-semibold text-fg">
                {t.table}{' '}
                <span className="font-sans font-normal text-slate-mid">({t.rowCount})</span>
              </summary>
              <span className="block max-w-[280px] mt-1 text-slate-mid font-mono">
                {t.columns.map((c) => c.name).join(', ')}
              </span>
            </details>
          ))}
        </div>
      )}

      {want && (
        <div
          className="grid gap-1.5 p-3 rounded-lg border border-dashed border-green-light/50 bg-green-light/5"
          aria-label={`${wants}: ${shapeLabel(want)}`}
        >
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-green-light">
            {task.from ? `${first} wants` : 'Wanted'}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {want.columns.map((c, i) => (
              <span
                key={i}
                data-present={got ? got.has(c.toLowerCase()) : undefined}
                className={`px-2 py-0.5 rounded-md border font-mono text-[12px] transition-colors ${
                  !got
                    ? 'border-edge/15 bg-surface text-fg'
                    : got.has(c.toLowerCase())
                      ? 'border-emerald-400/60 bg-emerald-400/10 text-fg'
                      : 'border-red-400/60 bg-red-400/10 text-fg'
                }`}
              >
                {c}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1" aria-hidden="true">
            {Array.from({ length: Math.min(want.rowCount, SHOWN_ROWS) }).map((_, i) => (
              <span
                key={i}
                className={`w-6 h-2.5 rounded-xs transition-colors duration-500 ${i < right ? 'bg-emerald-400' : 'bg-ink/10'}`}
              />
            ))}
            {want.rowCount > SHOWN_ROWS && (
              <em className="text-[12px] text-slate-mid not-italic">
                +{want.rowCount - SHOWN_ROWS}
              </em>
            )}
          </div>
          <span className="text-[12px] text-slate-mid">{shapeLabel(want)}</span>
        </div>
      )}

      <div className="rounded-lg border border-edge/10 overflow-hidden bg-surface-deep">
        <span className="sr-only" id={`sql-label-${task.ref}`}>
          Your SQL for {sender}
        </span>
        <div aria-labelledby={`sql-label-${task.ref}`} role="group">
          <SqlEditor
            ref={editorRef}
            value={sql}
            onChange={(v) => {
              setSql(v)
              setMissed(null)
            }}
            onRun={runNow}
            tables={schema}
            height={150}
            placeholder="SELECT … FROM … WHERE …"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={BTN_SECONDARY}
          disabled={!!busy || !sql.trim()}
          onClick={runNow}
        >
          <Play size={11} fill="currentColor" aria-hidden="true" />
          {busy === 'run' ? 'Running…' : 'Run'}
          <span className="font-mono text-[10px] text-ink/40" aria-hidden="true">
            ⌘↵
          </span>
        </button>
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={!!busy || !sql.trim()}
          onClick={() => void act('send')}
        >
          {busy === 'send' ? 'Sending…' : task.from ? `Send to ${first}` : 'Send'}
        </button>
        {diagnostic && (
          <button
            type="button"
            className={BTN_QUIET}
            disabled={!!busy}
            onClick={() => void act('pass')}
          >
            {busy === 'pass' ? 'Passing…' : 'Not learned this yet: pass'}
          </button>
        )}
        <span className="ml-auto text-[12px] text-slate-mid">Stuck?</span>
        {HELP.map((h) => (
          <button
            key={h.kind}
            type="button"
            className={BTN_QUIET}
            disabled={!!busy}
            onClick={() => void act(h.kind)}
          >
            {busy === h.kind ? 'Thinking…' : h.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 flex flex-wrap items-center gap-2"
          role="alert"
        >
          <AlertTriangle size={14} className="text-red-400 shrink-0" aria-hidden="true" />
          <p className="text-[13px] text-fg/85 flex-1">{error.text}</p>
          <button type="button" className={BTN_SECONDARY} onClick={() => void act(error.retry)}>
            Retry
          </button>
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {said}
      </p>

      {missed && (
        <div className="rounded-lg bg-red-400/10 px-3 py-2.5 motion-safe:animate-fade-in">
          <p className="text-[14px] text-fg mb-2">
            {task.from ? `${first}: “Hmm, not quite. ${missed}.”` : `Not quite. ${missed}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              ref={nextActionRef}
              type="button"
              className={BTN_SECONDARY}
              disabled={!!busy}
              onClick={() => {
                setMissed(null)
                editorRef.current?.view?.focus()
              }}
            >
              Try again
            </button>
            <button type="button" className={BTN_QUIET} disabled={!!busy} onClick={onMoveOn}>
              Move on
            </button>
          </div>
        </div>
      )}

      {busy && busy !== 'run' && busy !== 'send' && busy !== 'pass' && (
        <div
          className="h-2.5 rounded-full bg-violet-400/20 motion-safe:animate-pulse"
          aria-hidden="true"
        />
      )}
      {help && (
        <div className="rounded-lg border-l-4 border-violet-400 bg-violet-400/10 px-3.5 py-3 motion-safe:animate-fade-in">
          <span className="text-[12px] font-bold text-violet-400">
            {help.source === 'rules' ? 'Hint' : 'From your AI coach'} ·{' '}
            {HELP.find((h) => h.kind === help.kind)?.label}
          </span>
          <p className="text-[14px] text-fg leading-relaxed mt-1 whitespace-pre-wrap">
            {help.text}
          </p>
          {help.exampleSql && (
            <pre className="mt-2 px-3 py-2 rounded-md bg-surface-deep text-[12px] font-mono text-fg/85 overflow-x-auto">
              {help.exampleSql}
            </pre>
          )}
        </div>
      )}

      {run?.error && (
        <p className="text-[13px] font-semibold text-red-400">It did not run: {run.error}</p>
      )}
      {run?.preview && (
        <div className="grid gap-1.5">
          <p className="text-[12px] text-slate-mid">
            Your result: {run.preview.rowCount} {run.preview.rowCount === 1 ? 'row' : 'rows'}
            {run.preview.rowCount > SHOWN_ROWS ? ` (first ${SHOWN_ROWS} shown)` : ''}
            {check
              ? ` · ${right} of the first ${marks?.length ?? 0} ${task.from ? `are what ${first} needs` : 'are right'}${check.correct ? ' · ✓ matches' : ''}`
              : ''}
          </p>
          <div className="rounded-lg border border-edge/10 overflow-auto max-h-[280px] bg-surface">
            <ResultsGrid result={toResult(run.preview)} limit={SHOWN_ROWS} marks={marks} />
          </div>
        </div>
      )}
    </section>
  )
}
