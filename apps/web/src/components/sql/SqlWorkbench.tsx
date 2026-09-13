import { useCallback, useRef, useState } from 'react'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { AlertTriangle, Play, Table2 } from 'lucide-react'
import { SqlEditor } from './SqlEditor'
import { ResultsGrid } from './ResultsGrid'
import { SchemaTree } from './SchemaTree'
import { ROW_CAP, type SandboxDb, type SandboxResult } from '@/lib/sql/sandboxDb'
import type { SchemaTable } from '@/services/datasetsService'

interface Props {
  db: SandboxDb | null // null while the dataset is still loading
  tables: SchemaTable[]
  value: string
  onChange: (v: string) => void
  editorHeight?: number
  resultsHeight?: number
}

/**
 * Compact editor + run + results block for embedding a SQL question inside
 * an assessment or simulation. Shares one SandboxDb across every question on
 * the page; the caller owns the query text so it can be autosaved.
 */
export function SqlWorkbench({ db, tables, value, onChange, editorHeight = 160, resultsHeight = 240 }: Props) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SandboxResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSchema, setShowSchema] = useState(false)
  const editorRef = useRef<ReactCodeMirrorRef>(null)

  /** Drops a table/column name at the cursor of this workbench's editor. */
  const insertAtCursor = useCallback(
    (text: string) => {
      const view = editorRef.current?.view
      if (!view) {
        onChange(value + text)
        return
      }
      const { from, to } = view.state.selection.main
      view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
      view.focus()
    },
    [onChange, value],
  )

  const run = useCallback(async () => {
    if (!db || !value.trim() || running) return
    setRunning(true)
    setError(null)
    try {
      setResult(await db.run(value.trim()))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Query failed')
    } finally {
      setRunning(false)
    }
  }, [db, value, running])

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden bg-[#0d0d0d]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
        <button
          onClick={run}
          disabled={!db || running || !value.trim()}
          className="inline-flex items-center gap-2 pl-3 pr-3.5 py-1 rounded-full bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[12px] font-semibold text-white disabled:opacity-40 transition-colors"
        >
          <Play size={11} fill="currentColor" />
          {running ? 'Running…' : 'Run'}
          <span className="font-mono text-[10px] text-white/60">⌘↵</span>
        </button>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-white/40">
            {!db ? 'loading dataset…' : result ? `${result.rowCount} row${result.rowCount !== 1 ? 's' : ''} · ${result.durationMs} ms` : ''}
            {result && result.rowCount > ROW_CAP && <span className="text-amber-400 ml-2">showing first {ROW_CAP}</span>}
          </span>
          <button
            onClick={() => setShowSchema((v) => !v)}
            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold transition-colors ${
              showSchema ? 'text-[#2d9e5f]' : 'text-slate-mid hover:text-[#f5f3ee]'
            }`}
          >
            <Table2 size={12} /> Schema
          </button>
        </div>
      </div>
      {showSchema && (
        <div className="px-4 py-3 border-b border-white/8 bg-[#0a0a0a] max-h-[260px] overflow-y-auto">
          <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2">Tables — click a name to insert it</p>
          <SchemaTree tables={tables} onPick={insertAtCursor} />
        </div>
      )}
      <SqlEditor
        ref={editorRef}
        value={value}
        onChange={onChange}
        onRun={run}
        tables={tables}
        height={editorHeight}
        placeholder="Write your query here…"
      />
      <div className="border-t border-white/8 overflow-auto bg-[#0a0a0a]" style={{ maxHeight: resultsHeight }}>
        {error && (
          <div className="m-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 flex gap-2">
            <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-[#f5f3ee]/85 font-mono whitespace-pre-wrap">{error}</p>
          </div>
        )}
        {result ? (
          <ResultsGrid result={result} />
        ) : !error ? (
          <p className="px-4 py-4 text-[12px] text-white/30">Run your query to check the output before moving on.</p>
        ) : null}
      </div>
    </div>
  )
}
