import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { Clock } from 'lucide-react'
import type { StudentQuestion } from '@id/types'
import { Nav } from '@/components/Nav'
import { SqlWorkbench } from '@/components/sql/SqlWorkbench'
import { SandboxDb } from '@/lib/sql/sandboxDb'
import { fetchAttempt, saveAnswers, submitAttempt, type AttemptPaper } from '@/services/assessmentsService'

/**
 * Take an assessment (#25). One section at a time; every question in the
 * section is on screen. Answers autosave 1.5s after the last change and on
 * section change. A single in-browser PGlite instance backs every SQL
 * question on the paper. Submit (or the deadline) grades server-side.
 */

const AUTOSAVE_MS = 1500
const NAV_HEIGHT = 57

export function AssessmentAttemptPage() {
  const { attemptId = '' } = useParams()
  const { getToken } = useAuth()
  const navigate = useNavigate()

  const [paper, setPaper] = useState<AttemptPaper | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [sectionIx, setSectionIx] = useState(0)
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [submitting, setSubmitting] = useState(false)
  const [db, setDb] = useState<SandboxDb | null>(null)
  const dirtyRef = useRef<Record<string, string>>({})
  const timerRef = useRef<number | null>(null)

  // ── Load paper + dataset ──
  useEffect(() => {
    let cancelled = false
    let instance: SandboxDb | null = null
    fetchAttempt(getToken, attemptId)
      .then(async (p) => {
        if (cancelled) return
        if (p.submittedAt) {
          navigate(`/tools/assessments/attempt/${attemptId}/result`, { replace: true })
          return
        }
        setPaper(p)
        setAnswers(p.answers)
        instance = new SandboxDb(p.dataset.setupSql)
        await instance.load()
        if (!cancelled) setDb(instance)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load attempt'))
    return () => {
      cancelled = true
      void instance?.close()
    }
  }, [getToken, attemptId, navigate])

  // ── Autosave ──
  const flush = useCallback(async () => {
    const pending = dirtyRef.current
    if (Object.keys(pending).length === 0) return
    dirtyRef.current = {}
    setSaveState('saving')
    try {
      await saveAnswers(getToken, attemptId, pending)
      setSaveState(Object.keys(dirtyRef.current).length ? 'dirty' : 'saved')
    } catch {
      dirtyRef.current = { ...pending, ...dirtyRef.current }
      setSaveState('error')
    }
  }, [getToken, attemptId])

  const setAnswer = useCallback(
    (qid: string, value: string) => {
      setAnswers((a) => ({ ...a, [qid]: value }))
      dirtyRef.current[qid] = value
      setSaveState('dirty')
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => void flush(), AUTOSAVE_MS)
    },
    [flush],
  )

  // ── Submit ──
  const submit = useCallback(
    async (auto = false) => {
      if (submitting) return
      if (!auto && !confirm('Submit your answers? You cannot change them afterwards.')) return
      setSubmitting(true)
      if (timerRef.current) window.clearTimeout(timerRef.current)
      try {
        // Untouched starter queries count as the student's answer.
        const starters: Record<string, string> = {}
        for (const sec of paper?.sections ?? []) {
          for (const q of sec.questions) {
            if (q.type === 'sql' && q.starterSql && !(answers[q.id] ?? dirtyRef.current[q.id])?.trim()) starters[q.id] = q.starterSql
          }
        }
        await submitAttempt(getToken, attemptId, { ...starters, ...answers, ...dirtyRef.current })
        navigate(`/tools/assessments/attempt/${attemptId}/result`, { replace: true })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Submit failed')
        setSubmitting(false)
      }
    },
    [submitting, getToken, attemptId, answers, navigate, paper],
  )

  // ── Deadline countdown → auto-submit ──
  const deadline = paper?.deadlineAt ? new Date(paper.deadlineAt).getTime() : null
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!deadline) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [deadline])
  const remainingMs = deadline ? deadline - now : null
  useEffect(() => {
    if (remainingMs !== null && remainingMs <= 0 && paper && !submitting) void submit(true)
  }, [remainingMs, paper, submitting, submit])

  const section = paper?.sections[sectionIx]
  const answeredCount = useMemo(
    () => paper?.sections.flatMap((s) => s.questions).filter((q) => answers[q.id]?.trim()).length ?? 0,
    [paper, answers],
  )
  const totalCount = paper?.sections.reduce((n, s) => n + s.questions.length, 0) ?? 0
  const hasStarters = paper?.sections.some((s) => s.questions.some((q) => q.type === 'sql' && !!q.starterSql)) ?? false

  const goTo = (ix: number) => {
    void flush()
    setSectionIx(ix)
    window.scrollTo({ top: 0 })
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <Nav trackLabel="Assessment" />
        <div className="max-w-xl mx-auto px-6 py-12">
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3">
            <p className="text-[13px] text-red-400">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!paper || !section) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-slate-mid text-[14px]">Loading your paper…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Nav trackLabel={paper.label} stepLabel={`Section ${sectionIx + 1} of ${paper.sections.length}`} />
      <div className="flex flex-1" style={{ minHeight: `calc(100vh - ${NAV_HEIGHT}px)` }}>
        {/* ── Sidebar ── */}
        <aside className="flex flex-col w-[240px] flex-shrink-0 bg-[#0d0d0d] border-r border-white/8 sticky top-[57px] self-start" style={{ height: `calc(100vh - ${NAV_HEIGHT}px)` }}>
          <div className="h-[3px] w-full flex-shrink-0 bg-[#2d9e5f]" />
          <div className="px-5 pt-5 pb-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#2d9e5f]">{paper.title}</p>
            {remainingMs !== null && (
              <p
                className={`mt-2 inline-flex items-center gap-1.5 font-mono text-[13px] ${
                  remainingMs < 5 * 60 * 1000 ? 'text-red-400' : 'text-[#f5f3ee]'
                }`}
              >
                <Clock size={13} /> {formatRemaining(remainingMs)}
              </p>
            )}
          </div>
          <nav className="flex-1 overflow-y-auto px-3 pb-3">
            {paper.sections.map((s, i) => {
              const done = s.questions.filter((q) => answers[q.id]?.trim()).length
              return (
                <button
                  key={s.id}
                  onClick={() => goTo(i)}
                  className={`w-full text-left px-2 py-2 rounded-lg mb-0.5 transition-colors ${
                    i === sectionIx ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                >
                  <p className="text-[12px] font-semibold text-[#f5f3ee] truncate">
                    {i + 1}. {s.title}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    {s.questions.map((q) => (
                      <span
                        key={q.id}
                        className={`h-1.5 flex-1 rounded-full ${answers[q.id]?.trim() ? 'bg-[#2d9e5f]' : 'bg-white/10'}`}
                      />
                    ))}
                    <span className="font-mono text-[10px] text-white/30 ml-1">
                      {done}/{s.questions.length}
                    </span>
                  </div>
                </button>
              )
            })}
          </nav>
          <div className="px-5 py-4 border-t border-white/8">
            <p className="font-mono text-[11px] text-white/40 mb-2">
              {answeredCount}/{totalCount} answered ·{' '}
              <span className={saveState === 'error' ? 'text-red-400' : undefined}>
                {saveState === 'saving' ? 'saving…' : saveState === 'dirty' ? 'unsaved' : saveState === 'error' ? 'save failed' : 'saved'}
              </span>
            </p>
            <button
              onClick={() => submit()}
              disabled={submitting}
              className="w-full px-3 py-2 rounded-md bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[12px] font-semibold text-white disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Submitting…' : 'Submit assessment'}
            </button>
          </div>
        </aside>

        {/* ── Questions ── */}
        <main className="flex-1 min-w-0 max-w-4xl px-8 py-8">
          {sectionIx === 0 && (
            <div className="mb-6 rounded-xl border border-white/10 bg-[#0d0d0d] px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40 mb-2">How this works</p>
              <ul className="text-[13px] text-[#f5f3ee]/80 leading-relaxed space-y-1 list-disc pl-5">
                <li>Answers save as you go. Submit when you're done{paper.deadlineAt ? ' — or when the timer runs out' : ''}.</li>
                <li>
                  On SQL questions, press <span className="font-semibold text-[#f5f3ee]">Run</span> (⌘↵) to see your query's output before moving on. Only the query left in the editor is graded.
                </li>
                <li>
                  Click <span className="font-semibold text-[#f5f3ee]">Schema</span> to open the table and column list beside the editor; clicking a name inserts it at the cursor.
                </li>
                {hasStarters && <li>Some questions start you off with an example query — edit it or replace it entirely.</li>}
              </ul>
            </div>
          )}
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid mb-1">
            Section {sectionIx + 1} of {paper.sections.length}
          </p>
          <h2 className="font-display font-extrabold text-[22px] text-[#f5f3ee] tracking-tight mb-6">{section.title}</h2>

          <ol className="space-y-8">
            {section.questions.map((q, i) => (
              <li key={q.id} className="bg-[#111111] rounded-2xl border border-white/10 p-6">
                <div className="flex items-start gap-3 mb-4">
                  <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-white/5 text-[12px] font-bold text-slate-light flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40 mb-1">
                      {q.type === 'mc' ? 'Multiple choice' : 'Hands-on SQL'}
                    </p>
                    <p className="text-[15px] text-[#f5f3ee] leading-relaxed">{renderPrompt(q.prompt)}</p>
                  </div>
                </div>
                <QuestionBody
                  q={q}
                  value={answers[q.id] ?? (q.type === 'sql' ? q.starterSql ?? '' : '')}
                  onChange={(v) => setAnswer(q.id, v)}
                  db={db}
                  tables={paper.dataset.schemaSummary}
                />
              </li>
            ))}
          </ol>

          <div className="flex items-center justify-between mt-8">
            <button
              onClick={() => goTo(sectionIx - 1)}
              disabled={sectionIx === 0}
              className="text-[12px] font-semibold text-slate-mid hover:text-[#f5f3ee] disabled:opacity-30 transition-colors"
            >
              ← Previous section
            </button>
            {sectionIx < paper.sections.length - 1 ? (
              <button
                onClick={() => goTo(sectionIx + 1)}
                className="px-4 py-2 rounded-md border border-white/15 hover:border-white/30 text-[12px] font-semibold text-[#f5f3ee] transition-colors"
              >
                Next section →
              </button>
            ) : (
              <button
                onClick={() => submit()}
                disabled={submitting}
                className="px-4 py-2 rounded-md bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[12px] font-semibold text-white disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Submitting…' : 'Submit assessment'}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────────────────

function QuestionBody({
  q,
  value,
  onChange,
  db,
  tables,
}: {
  q: StudentQuestion
  value: string
  onChange: (v: string) => void
  db: SandboxDb | null
  tables: AttemptPaper['dataset']['schemaSummary']
}) {
  if (q.type === 'mc') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-10">
        {q.options.map((o) => {
          const on = value === o.key
          return (
            <button
              key={o.key}
              onClick={() => onChange(o.key)}
              className={`flex items-start gap-3 text-left px-4 py-3 rounded-xl border transition-colors ${
                on ? 'border-[#2d9e5f]/70 bg-[#1a6b3c]/20' : 'border-white/10 hover:border-white/25 bg-[#0d0d0d]'
              }`}
            >
              <span
                className={`flex-shrink-0 w-6 h-6 rounded-md text-[11px] font-bold flex items-center justify-center ${
                  on ? 'bg-[#2d9e5f] text-white' : 'bg-white/10 text-slate-light'
                }`}
              >
                {o.key}
              </span>
              <span className="text-[13px] text-[#f5f3ee]/90 leading-snug pt-0.5">{renderPrompt(o.text)}</span>
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <div className="ml-10">
      <SqlWorkbench db={db} tables={tables} value={value} onChange={onChange} autoRun={!!q.starterSql} />
      {q.starterSql && value === q.starterSql && (
        <p className="text-[11px] text-amber-200/80 mt-2">
          We've started you off with an example query — edit it or replace it entirely. It's graded as-is if you leave it unchanged.
        </p>
      )}
      {(q.ordered || q.strictColumns) && (
        <p className="text-[11px] text-white/40 mt-2">
          {q.ordered && 'Row order matters for this question. '}
          {q.strictColumns && 'Column names must match the ones asked for.'}
        </p>
      )}
    </div>
  )
}

/** Renders `code` spans from the markdown prompt as inline mono. */
function renderPrompt(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`)/g)
  return parts.map((p, i) =>
    p.startsWith('`') && p.endsWith('`') ? (
      <code key={i} className="font-mono text-[13px] bg-white/8 px-1.5 py-0.5 rounded text-[#f5f3ee]">
        {p.slice(1, -1)}
      </code>
    ) : (
      <span key={i}>{p}</span>
    ),
  )
}

function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}
