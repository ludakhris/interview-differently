import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { AlertTriangle, Play, RotateCcw } from 'lucide-react'
import { Nav } from '@/components/Nav'
import { SqlEditor } from '@/components/sql/SqlEditor'
import { SchemaTree } from '@/components/sql/SchemaTree'
import { ResultsGrid } from '@/components/sql/ResultsGrid'
import { SandboxDb, ROW_CAP, type SandboxResult } from '@/lib/sql/sandboxDb'
import { fetchMyDataset, fetchMyDatasets, type DatasetDetail, type DatasetSummary } from '@/services/datasetsService'

/**
 * SQL Sandbox (#25) — a DB-client-style workspace against a cohort dataset.
 *
 * Layout mirrors the simulation instrument panels: accent rail on the left
 * (schema + history), editor over results on the right with a draggable
 * splitter. The dataset's setup script is fetched once and loaded into a
 * private in-browser PGlite instance; running and resetting are local.
 */

const HISTORY_LIMIT = 20
const NAV_HEIGHT = 57
const MIN_EDITOR = 120
const MIN_RESULTS = 160

function historyKey(slug: string) {
  return `sql-sandbox:history:${slug}`
}

function readHistory(slug: string): string[] {
  try {
    const raw = localStorage.getItem(historyKey(slug))
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function pushHistory(slug: string, query: string): string[] {
  const next = [query, ...readHistory(slug).filter((q) => q !== query)].slice(0, HISTORY_LIMIT)
  try {
    localStorage.setItem(historyKey(slug), JSON.stringify(next))
  } catch {
    // storage full / disabled — history is a convenience only
  }
  return next
}

type DbState = { status: 'idle' | 'loading' | 'ready' | 'error'; message?: string }

export function SqlSandboxPage() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const slug = params.get('dataset')

  const [datasets, setDatasets] = useState<DatasetSummary[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [dataset, setDataset] = useState<DatasetDetail | null>(null)
  const [dbState, setDbState] = useState<DbState>({ status: 'idle' })
  const dbRef = useRef<SandboxDb | null>(null)

  const [query, setQuery] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SandboxResult | null>(null)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const editorRef = useRef<ReactCodeMirrorRef>(null)

  // ── Dataset list ──
  useEffect(() => {
    fetchMyDatasets(getToken)
      .then((list) => {
        setDatasets(list)
        if (!slug && list.length > 0) setParams({ dataset: list[0].slug }, { replace: true })
      })
      .catch((e) => setListError(e instanceof Error ? e.message : 'Failed to load datasets'))
  }, [getToken, slug, setParams])

  // ── Load selected dataset into PGlite ──
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    setDbState({ status: 'loading' })
    setDataset(null)
    setResult(null)
    setQueryError(null)
    setHistory(readHistory(slug))
    fetchMyDataset(getToken, slug)
      .then(async (d) => {
        if (cancelled) return
        setDataset(d)
        const db = new SandboxDb(d.setupSql)
        await db.load()
        if (cancelled) {
          await db.close()
          return
        }
        await dbRef.current?.close()
        dbRef.current = db
        setDbState({ status: 'ready' })
      })
      .catch((e) => {
        if (!cancelled) setDbState({ status: 'error', message: e instanceof Error ? e.message : 'Failed to load dataset' })
      })
    return () => {
      cancelled = true
    }
  }, [getToken, slug])

  useEffect(() => () => void dbRef.current?.close(), [])

  // ── Run ──
  const run = useCallback(async () => {
    const db = dbRef.current
    const text = query.trim()
    if (!db || !text || !slug || running) return
    setRunning(true)
    setQueryError(null)
    try {
      const r = await db.run(text)
      setResult(r)
      setHistory(pushHistory(slug, text))
    } catch (e) {
      // Keep the last good result visible under the error banner.
      setQueryError(e instanceof Error ? e.message : 'Query failed')
    } finally {
      setRunning(false)
    }
  }, [query, slug, running])

  const tables = useMemo(() => dataset?.schemaSummary ?? [], [dataset?.schemaSummary])

  const reset = useCallback(async () => {
    const db = dbRef.current
    if (!db) return
    setDbState({ status: 'loading' })
    setResult(null)
    setQueryError(null)
    try {
      await db.reset()
      setDbState({ status: 'ready' })
    } catch (e) {
      setDbState({ status: 'error', message: e instanceof Error ? e.message : 'Reset failed' })
    }
  }, [])

  /** Inserts text at the cursor (replacing any selection) and refocuses the editor. */
  const insertAtCursor = useCallback((text: string) => {
    const view = editorRef.current?.view
    if (!view) {
      setQuery((q) => q + text)
      return
    }
    const { from, to } = view.state.selection.main
    view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
    view.focus()
  }, [])

  const setAndFocus = useCallback((text: string) => {
    setQuery(text)
    requestAnimationFrame(() => editorRef.current?.view?.focus())
  }, [])

  // ── Splitter ──
  const bodyRef = useRef<HTMLDivElement>(null)
  const [editorHeight, setEditorHeight] = useState(260)
  const onSplitterDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = editorHeight
    const total = bodyRef.current?.clientHeight ?? 800
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(Math.max(startH + ev.clientY - startY, MIN_EDITOR), total - MIN_RESULTS)
      setEditorHeight(next)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const ready = dbState.status === 'ready'

  return (
    <div className="h-screen bg-[#0a0a0a] flex flex-col overflow-hidden">
      <Nav trackLabel="SQL Sandbox" stepLabel={dataset?.name} />

      {listError && (
        <div className="mx-6 mt-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3">
          <p className="text-[13px] text-red-400">{listError}</p>
        </div>
      )}

      {datasets && datasets.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-[#111111] rounded-xl border border-white/10 px-8 py-10 text-center max-w-md">
            <p className="text-[14px] text-[#f5f3ee] font-semibold">No datasets yet</p>
            <p className="text-[13px] text-slate-mid mt-1">
              Ask your instructor to enable the SQL Sandbox for your cohort and assign a dataset.
            </p>
            <button onClick={() => navigate('/dashboard')} className="mt-4 text-[12px] text-green-light hover:underline">
              ← Back to dashboard
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0" style={{ height: `calc(100vh - ${NAV_HEIGHT}px)` }}>
          {/* ── Rail ── */}
          <aside className="flex flex-col w-[240px] flex-shrink-0 bg-[#0d0d0d] border-r border-white/8">
            <div className="h-[3px] w-full flex-shrink-0 bg-[#2d9e5f]" />
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#2d9e5f]">Workspace</p>
              <button
                onClick={reset}
                disabled={!ready}
                title="Reset dataset — rebuilds your private copy from scratch"
                className="text-slate-mid hover:text-[#f5f3ee] disabled:opacity-30 transition-colors"
              >
                <RotateCcw size={14} />
              </button>
            </div>

            {datasets && datasets.length > 1 && (
              <div className="px-5 pb-4">
                <select
                  value={slug ?? ''}
                  onChange={(e) => setParams({ dataset: e.target.value })}
                  className="w-full bg-[#111111] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-[#f5f3ee] focus:outline-none focus:border-white/30"
                >
                  {datasets.map((d) => (
                    <option key={d.id} value={d.slug}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-6">
              <section>
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-2">Schema</p>
                {dataset ? (
                  <SchemaTree tables={dataset.schemaSummary} onPick={insertAtCursor} />
                ) : (
                  <p className="text-[12px] text-slate-mid">Loading…</p>
                )}
              </section>

              {history.length > 0 && (
                <section>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-2">History</p>
                  <ul className="space-y-0.5">
                    {history.map((h, i) => (
                      <li key={i}>
                        <button
                          onClick={() => setAndFocus(h)}
                          title={h}
                          className="w-full text-left font-mono text-[11px] text-white/50 hover:text-[#f5f3ee] truncate py-0.5 transition-colors"
                        >
                          {h.replace(/\s+/g, ' ')}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </aside>

          {/* ── Editor + results ── */}
          <div ref={bodyRef} className="flex-1 min-w-0 flex flex-col">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/8 bg-[#0d0d0d]">
              <div className="flex items-center gap-3">
                <button
                  onClick={run}
                  disabled={!ready || running || !query.trim()}
                  className="inline-flex items-center gap-2 pl-3 pr-3.5 py-1.5 rounded-full bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[12px] font-semibold text-white disabled:opacity-40 transition-colors"
                >
                  <Play size={12} fill="currentColor" />
                  {running ? 'Running…' : 'Run'}
                  <span className="font-mono text-[10px] text-white/60 ml-0.5">⌘↵</span>
                </button>
                {dbState.status === 'loading' && (
                  <span className="text-[11px] text-amber-400">Building your private copy…</span>
                )}
              </div>
              <p className="text-[11px] text-white/30">
                Your own copy of the data. Break it freely — <RotateCcw size={10} className="inline -mt-0.5" /> rebuilds it.
              </p>
            </div>

            {/* Editor */}
            <div style={{ height: editorHeight }} className="flex-shrink-0 bg-[#0d0d0d]">
              <SqlEditor
                ref={editorRef}
                value={query}
                onChange={setQuery}
                onRun={run}
                tables={tables}
                height={editorHeight}
                placeholder="SELECT * FROM customers LIMIT 10;"
              />
            </div>

            {/* Splitter */}
            <div
              onMouseDown={onSplitterDown}
              className="h-[5px] flex-shrink-0 cursor-row-resize bg-white/5 hover:bg-[#2d9e5f]/60 transition-colors"
              title="Drag to resize"
            />

            {/* Results */}
            <div className="flex-1 min-h-0 flex flex-col bg-[#0a0a0a]">
              {queryError && (
                <div className="m-4 mb-0 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 flex gap-3">
                  <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-red-400 mb-0.5">Query error</p>
                    <p className="text-[13px] text-[#f5f3ee]/85 font-mono whitespace-pre-wrap">{queryError}</p>
                  </div>
                </div>
              )}
              {dbState.status === 'error' && (
                <div className="m-4 mb-0 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3">
                  <p className="text-[13px] text-red-400 font-mono">{dbState.message}</p>
                </div>
              )}

              <div className="flex-1 min-h-0 overflow-auto">
                {result ? (
                  <ResultsGrid result={result} />
                ) : ready ? (
                  <p className="px-5 py-8 text-[12px] text-white/30">
                    Write a query above and press <span className="font-mono">⌘↵</span>. Click a table or column in the rail to drop its name into the editor.
                  </p>
                ) : null}
              </div>

              {/* Status strip */}
              <div className="flex items-center justify-between px-5 py-1.5 border-t border-white/8 bg-[#0d0d0d] font-mono text-[11px] text-white/40">
                <span className={queryError ? 'text-red-400' : undefined}>
                  {queryError
                    ? 'error'
                    : result
                      ? `${result.rowCount} row${result.rowCount !== 1 ? 's' : ''} · ${result.durationMs} ms`
                      : ready
                        ? 'ready'
                        : dbState.status}
                </span>
                <span className="flex items-center gap-3">
                  {result && result.rowCount > ROW_CAP && (
                    <span className="text-amber-400">showing first {ROW_CAP}</span>
                  )}
                  <span>postgres · pglite</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
