import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import type { ScenarioNode, SqlSpec } from '@id/types'
import { SqlWorkbench } from './SqlWorkbench'
import { ResultsGrid } from './ResultsGrid'
import { SandboxDb, type SandboxResult } from '@/lib/sql/sandboxDb'
import { compareResults } from '@/lib/sql/compare'
import { fetchMyDataset, type DatasetDetail } from '@/services/datasetsService'

/**
 * SQL question node for simulations (#25 Phase 4).
 *
 * Loads the node's dataset into a private PGlite instance, lets the
 * candidate run queries freely, then grades one submission: the submitted
 * query and the author's reference query both run in rolled-back
 * transactions and their result sets are compared. After submitting, the
 * expected output is shown (and the reference query can be revealed) so the
 * node teaches as well as scores.
 */

export interface SqlSubmission {
  sql: string
  correct: boolean
  reason?: string
}

interface Props {
  node: ScenarioNode
  onSubmit: (payload: SqlSubmission) => void
  onHintUsed?: (nodeId: string) => void
}

export function SqlNode({ node, onSubmit, onHintUsed }: Props) {
  const spec = node.sql as SqlSpec
  const { getToken } = useAuth()
  const [dataset, setDataset] = useState<DatasetDetail | null>(null)
  const [db, setDb] = useState<SandboxDb | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sql, setSql] = useState('')
  const [hintShown, setHintShown] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [outcome, setOutcome] = useState<{ correct: boolean; reason?: string; expected: SandboxResult } | null>(null)
  const [showReference, setShowReference] = useState(false)

  useEffect(() => {
    let cancelled = false
    let instance: SandboxDb | null = null
    fetchMyDataset(getToken, spec.datasetSlug)
      .then(async (d) => {
        if (cancelled) return
        setDataset(d)
        instance = new SandboxDb(d.setupSql)
        await instance.load()
        if (!cancelled) setDb(instance)
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load dataset'))
    return () => {
      cancelled = true
      void instance?.close()
    }
  }, [getToken, spec.datasetSlug])

  const submit = useCallback(async () => {
    if (!db || !sql.trim() || submitting) return
    setSubmitting(true)
    try {
      let student: SandboxResult
      try {
        student = await db.runIsolated(sql.trim())
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'query failed'
        const expected = await db.runIsolated(spec.referenceSql)
        setOutcome({ correct: false, reason, expected })
        onSubmit({ sql, correct: false, reason })
        return
      }
      const expected = await db.runIsolated(spec.referenceSql)
      const cmp = compareResults(student, expected, { ordered: !!spec.ordered, strictColumns: !!spec.strictColumns })
      setOutcome({ correct: cmp.match, reason: cmp.reason, expected })
      onSubmit({ sql, correct: cmp.match, ...(cmp.reason ? { reason: cmp.reason } : {}) })
    } finally {
      setSubmitting(false)
    }
  }, [db, sql, submitting, spec, onSubmit])

  return (
    <div className="bg-[#111111] rounded-2xl border border-white/10 p-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40 mb-1">Hands-on SQL</p>
      {spec.context && <p className="text-[13px] text-slate-mid leading-relaxed mb-2">{spec.context}</p>}
      <p className="text-[16px] text-[#f5f3ee] leading-relaxed mb-4">{spec.prompt}</p>

      {loadError ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3">
          <p className="text-[13px] text-red-400">{loadError}</p>
        </div>
      ) : (
        <SqlWorkbench db={db} tables={dataset?.schemaSummary ?? []} value={sql} onChange={setSql} editorHeight={180} resultsHeight={260} />
      )}

      {(spec.ordered || spec.strictColumns) && !outcome && (
        <p className="text-[11px] text-white/40 mt-2">
          {spec.ordered && 'Row order matters for this question. '}
          {spec.strictColumns && 'Column names must match the ones asked for.'}
        </p>
      )}

      {/* Hint + submit */}
      {!outcome && (
        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            {spec.hint &&
              (hintShown ? (
                <div className="pl-3 border-l-2 border-amber-400/50 text-amber-200/90 text-[13px] leading-relaxed max-w-xl">{spec.hint}</div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm('Show the hint? Your highest possible score on this question drops from Strong to Proficient.')) return
                    setHintShown(true)
                    onHintUsed?.(node.nodeId)
                  }}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-white/15 bg-white/5 text-white/65 hover:border-white/25 hover:text-[#f5f3ee] transition-colors"
                >
                  <span aria-hidden>💡</span> Need a hint?
                </button>
              ))}
          </div>
          <button
            onClick={submit}
            disabled={!db || submitting || !sql.trim()}
            className="bg-green hover:bg-green-light text-white font-display font-semibold text-[14px] px-6 py-2.5 rounded-lg disabled:opacity-40 transition-colors"
          >
            {submitting ? 'Checking…' : 'Submit answer'}
          </button>
        </div>
      )}

      {/* Outcome */}
      {outcome && (
        <div className="mt-5 space-y-4">
          <p className="text-[11px] text-white/40">
            Submitted — this verdict is final. You can keep running queries above to explore, but they won't be re-graded.
          </p>
          <div
            className={`rounded-xl border px-4 py-3 ${
              outcome.correct ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'
            }`}
          >
            <p className={`text-[11px] font-bold uppercase tracking-widest mb-0.5 ${outcome.correct ? 'text-emerald-400' : 'text-amber-400'}`}>
              {outcome.correct ? 'Matches the expected output' : 'Not quite'}
            </p>
            <p className="text-[13px] text-[#f5f3ee]/85">
              {outcome.correct
                ? 'Your query returns exactly the rows the business asked for.'
                : `Your result ${outcome.reason ? `— ${outcome.reason}` : 'differs from the expected output'}. Compare it with what was expected below.`}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-[#0d0d0d] border-b border-white/8">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">Expected output</p>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-white/40">{outcome.expected.rowCount} rows</span>
                <button onClick={() => setShowReference((v) => !v)} className="text-[11px] font-semibold text-slate-mid hover:text-[#f5f3ee] transition-colors">
                  {showReference ? 'Hide reference query' : 'Show reference query'}
                </button>
              </div>
            </div>
            {showReference && (
              <pre className="px-4 py-3 bg-[#0a0a0a] border-b border-white/8 font-mono text-[12px] text-[#f5f3ee]/85 whitespace-pre-wrap">{spec.referenceSql}</pre>
            )}
            <div className="max-h-[260px] overflow-auto bg-[#0a0a0a]">
              <ResultsGrid result={outcome.expected} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
