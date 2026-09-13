import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import CodeMirror, { Prec, keymap, type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { PostgreSQL, sql } from '@codemirror/lang-sql'
import { AlertTriangle, ChevronDown, ChevronRight, Play, RotateCcw } from 'lucide-react'
import { Nav } from '@/components/Nav'
import { SandboxDb, ROW_CAP, type SandboxResult } from '@/lib/sql/sandboxDb'
import { sandboxEditorTheme } from '@/lib/sql/editorTheme'
import {
  fetchMyDataset,
  fetchMyDatasets,
  type DatasetDetail,
  type DatasetSummary,
  type SchemaTable,
} from '@/services/datasetsService'

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

  // Keep the Mod-Enter keymap pointed at the latest `run` without rebuilding
  // the editor extensions on every keystroke. Prec.highest so it beats the
  // default keymap's Mod-Enter (insertBlankLine).
  const runRef = useRef(run)
  runRef.current = run
  const extensions = useMemo(
    () => [
      Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => (runRef.current(), true) }])),
      sandboxEditorTheme,
      sql({
        dialect: PostgreSQL,
        upperCaseKeywords: true,
        ...schemaForCompletion(dataset?.schemaSummary ?? []),
      }),
    ],
    [dataset?.schemaSummary],
  )

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
              <CodeMirror
                ref={editorRef}
                value={query}
                onChange={setQuery}
                theme="dark"
                height={`${editorHeight}px`}
                placeholder="SELECT * FROM customers LIMIT 10;"
                extensions={extensions}
                basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
                style={{ fontSize: 13, height: '100%' }}
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

// ── Subcomponents ─────────────────────────────────────────────────────────

// Feeds lang-sql's completion: table names (with row counts) rank above
// keywords, and `table.` / alias completion lists columns with their types.
function schemaForCompletion(tables: SchemaTable[]) {
  return {
    schema: Object.fromEntries(
      tables.map((t) => [t.table, t.columns.map((c) => ({ label: c.name, detail: c.type, type: 'property', boost: 2 }))]),
    ),
    tables: tables.map((t) => ({ label: t.table, detail: `${t.rowCount} rows`, type: 'class', boost: 3 })),
  }
}

// Postgres data_type → short badge + colour. Anything unknown renders dim.
function typeBadge(type: string): { label: string; cls: string } {
  if (/int/.test(type)) return { label: 'int', cls: 'text-sky-400 bg-sky-400/10' }
  if (/numeric|decimal|double|real|money/.test(type)) return { label: 'num', cls: 'text-emerald-400 bg-emerald-400/10' }
  if (/date|time/.test(type)) return { label: type.startsWith('time') ? 'ts' : 'date', cls: 'text-amber-400 bg-amber-400/10' }
  if (/bool/.test(type)) return { label: 'bool', cls: 'text-violet-400 bg-violet-400/10' }
  if (/text|char/.test(type)) return { label: 'text', cls: 'text-slate-light bg-white/5' }
  return { label: type.slice(0, 6), cls: 'text-white/40 bg-white/5' }
}

function SchemaTree({ tables, onPick }: { tables: SchemaTable[]; onPick: (name: string) => void }) {
  // First table open by default so the rail isn't a wall of columns.
  const [open, setOpen] = useState<Record<string, boolean>>(() => (tables[0] ? { [tables[0].table]: true } : {}))
  return (
    <ul className="space-y-0.5">
      {tables.map((t) => {
        const expanded = open[t.table] ?? false
        return (
          <li key={t.table}>
            <div className="flex items-center gap-1 group">
              <button
                onClick={() => setOpen((o) => ({ ...o, [t.table]: !expanded }))}
                className="flex items-center gap-1 flex-1 min-w-0 py-1 text-left text-[#f5f3ee] hover:text-green-light transition-colors"
              >
                {expanded ? (
                  <ChevronDown size={12} className="text-white/30 flex-shrink-0" />
                ) : (
                  <ChevronRight size={12} className="text-white/30 flex-shrink-0" />
                )}
                <span className="font-mono text-[12px] font-semibold truncate">{t.table}</span>
              </button>
              <button
                onClick={() => onPick(t.table)}
                title={`${t.rowCount} rows — click to insert table name`}
                className="font-mono text-[10px] text-white/30 group-hover:text-white/60 hover:!text-green-light px-1.5 py-0.5 rounded bg-white/5 transition-colors"
              >
                {t.rowCount}
              </button>
            </div>
            {expanded && (
              <ul className="ml-4 mb-2 border-l border-white/8 pl-2.5">
                {t.columns.map((c) => {
                  const b = typeBadge(c.type)
                  return (
                    <li key={c.name}>
                      <button
                        onClick={() => onPick(c.name)}
                        title={`${c.type} — click to insert`}
                        className="w-full flex items-center justify-between gap-2 py-[3px] group/col"
                      >
                        <span className="font-mono text-[11px] text-white/60 group-hover/col:text-[#f5f3ee] truncate transition-colors">
                          {c.name}
                        </span>
                        <span className={`font-mono text-[9px] px-1 py-px rounded ${b.cls}`}>{b.label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}

const NUMERIC_RE = /^-?\d+(\.\d+)?$/

function ResultsGrid({ result }: { result: SandboxResult }) {
  if (result.columns.length === 0) {
    return (
      <p className="px-5 py-6 text-[13px] text-slate-mid font-mono">
        {result.command || 'OK'} — no rows returned.
      </p>
    )
  }
  // Right-align a column when every non-null value in it looks numeric.
  const numeric = result.columns.map((_, ci) =>
    result.rows.every((r) => r[ci] == null || typeof r[ci] === 'number' || NUMERIC_RE.test(String(r[ci]))),
  )
  return (
    <table className="min-w-full text-[12px] font-mono border-collapse">
      <thead className="sticky top-0 z-10 bg-[#111111] shadow-[0_1px_0_rgba(255,255,255,0.08)]">
        <tr>
          <th className="px-3 py-2 text-right text-[10px] text-white/25 font-normal w-10">#</th>
          {result.columns.map((c, i) => (
            <th
              key={i}
              className={`px-3 py-2 text-[10px] uppercase tracking-widest text-slate-light font-bold whitespace-nowrap ${
                numeric[i] ? 'text-right' : 'text-left'
              }`}
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.map((row, ri) => (
          <tr key={ri} className="odd:bg-white/[0.02] hover:bg-[#2d9e5f]/10">
            <td className="px-3 py-1.5 text-right text-white/25">{ri + 1}</td>
            {row.map((v, ci) => (
              <td
                key={ci}
                className={`px-3 py-1.5 whitespace-nowrap ${numeric[ci] ? 'text-right text-[#f5f3ee]' : 'text-left text-[#f5f3ee]/85'}`}
              >
                {formatCell(v)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function formatCell(v: unknown): React.ReactNode {
  if (v === null || v === undefined) return <span className="text-white/25 italic">null</span>
  if (typeof v === 'boolean')
    return v ? <span className="text-emerald-400">true</span> : <span className="text-white/40">false</span>
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
