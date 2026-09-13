// SqlQuestionEditor — inline editor for sql nodes (#25 Phase 4).
// Prompt, dataset, reference query with a live "Test query" run, grading
// flags, optional hint, rubric dimension.

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import type { ScenarioNode, SqlSpec } from '@id/types'
import { EditShell, Field, TextInput, Textarea, SelectInput, SectionLabel } from './shared'
import { SqlEditor } from '@/components/sql/SqlEditor'
import { ResultsGrid } from '@/components/sql/ResultsGrid'
import { SandboxDb, type SandboxResult } from '@/lib/sql/sandboxDb'
import { fetchMyDatasets, type DatasetSummary } from '@/services/datasetsService'
import { fetchMyDataset } from '@/services/datasetsService'

interface Props {
  node: ScenarioNode
  onDone: (updated: ScenarioNode) => void
}

export function SqlQuestionEditor({ node, onDone }: Props) {
  const spec = node.sql as SqlSpec
  const { getToken } = useAuth()
  const [prompt, setPrompt] = useState(spec.prompt)
  const [context, setContext] = useState(spec.context ?? '')
  const [datasetSlug, setDatasetSlug] = useState(spec.datasetSlug)
  const [referenceSql, setReferenceSql] = useState(spec.referenceSql)
  const [ordered, setOrdered] = useState(!!spec.ordered)
  const [strictColumns, setStrictColumns] = useState(!!spec.strictColumns)
  const [hint, setHint] = useState(spec.hint ?? '')
  const [dimension, setDimension] = useState(node.sqlSignalDimensions?.[0] ?? 'Technical Accuracy')

  const [datasets, setDatasets] = useState<DatasetSummary[]>([])
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'error'; result?: SandboxResult; error?: string }>({ state: 'idle' })
  const dbRef = useRef<{ slug: string; db: SandboxDb } | null>(null)

  useEffect(() => {
    fetchMyDatasets(getToken).then(setDatasets).catch(() => setDatasets([]))
  }, [getToken])
  useEffect(() => () => void dbRef.current?.db.close(), [])

  const selected = datasets.find((d) => d.slug === datasetSlug)

  async function testQuery() {
    if (!datasetSlug || !referenceSql.trim()) return
    setTest({ state: 'running' })
    try {
      if (dbRef.current?.slug !== datasetSlug) {
        await dbRef.current?.db.close()
        const full = await fetchMyDataset(getToken, datasetSlug)
        const db = new SandboxDb(full.setupSql)
        await db.load()
        dbRef.current = { slug: datasetSlug, db }
      }
      const result = await dbRef.current.db.runIsolated(referenceSql.trim())
      setTest({ state: 'ok', result })
    } catch (e) {
      setTest({ state: 'error', error: e instanceof Error ? e.message : 'Query failed' })
    }
  }

  function finish() {
    const next: SqlSpec = {
      prompt,
      ...(context.trim() ? { context: context.trim() } : {}),
      datasetSlug,
      referenceSql,
      ...(ordered ? { ordered: true } : {}),
      ...(strictColumns ? { strictColumns: true } : {}),
      ...(hint.trim() ? { hint: hint.trim() } : {}),
    }
    onDone({
      ...node,
      narrative: prompt,
      sql: next,
      sqlSignalDimensions: dimension.trim() ? [dimension.trim()] : undefined,
    })
  }

  return (
    <EditShell emoji="🗄️" kindLabel="SQL Question" onDone={finish}>
      <Field label="Business ask (the prompt)">
        <Textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Which states have more than 10 customers?" />
      </Field>
      <Field label="Context (optional, shown above the prompt)">
        <TextInput value={context} onChange={(e) => setContext(e.target.value)} placeholder="e.g. Marketing wants a state-level loyalty push." />
      </Field>

      <SectionLabel label="Dataset & reference query" />
      <Field label="Dataset">
        <SelectInput
          value={datasetSlug}
          onChange={(e) => {
            setDatasetSlug(e.target.value)
            setTest({ state: 'idle' })
          }}
          options={[
            ...(datasets.length === 0 ? [{ value: datasetSlug, label: datasetSlug || 'Loading datasets…' }] : []),
            ...datasets.map((d) => ({ value: d.slug, label: `${d.name} (${d.slug})` })),
          ]}
        />
      </Field>
      <Field label="Reference query — its result set is the answer key">
        <div className="rounded-lg border border-white/12 overflow-hidden">
          <SqlEditor value={referenceSql} onChange={setReferenceSql} onRun={testQuery} tables={selected?.schemaSummary ?? []} height={160} placeholder="SELECT …" />
        </div>
      </Field>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={testQuery}
          disabled={!datasetSlug || !referenceSql.trim() || test.state === 'running'}
          className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-white/15 text-white/80 hover:border-white/30 disabled:opacity-40 transition-colors"
        >
          {test.state === 'running' ? 'Running…' : '▶ Test query'}
        </button>
        {test.state === 'ok' && test.result && (
          <span className="font-mono text-[11px] text-emerald-300">
            {test.result.rowCount} row{test.result.rowCount !== 1 ? 's' : ''} · {test.result.columns.length} col{test.result.columns.length !== 1 ? 's' : ''}
          </span>
        )}
        {test.state === 'error' && <span className="font-mono text-[11px] text-red-400">{test.error}</span>}
      </div>
      {test.state === 'ok' && test.result && (
        <div className="max-h-[220px] overflow-auto rounded-lg border border-white/10 bg-[#0a0a0a]">
          <ResultsGrid result={test.result} />
        </div>
      )}

      <SectionLabel label="Grading" />
      <div className="flex flex-wrap gap-4 text-[12px] text-white/70">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={ordered} onChange={(e) => setOrdered(e.target.checked)} className="accent-emerald-400" />
          Row order must match
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={strictColumns} onChange={(e) => setStrictColumns(e.target.checked)} className="accent-emerald-400" />
          Column names must match
        </label>
      </div>
      <p className="text-[11px] text-white/35 -mt-2">
        Without flags, any query returning the same rows (in any order, any column names) counts as correct. Numbers compare to 6 decimals.
      </p>
      <Field label="Rubric dimension this question scores">
        <TextInput value={dimension} onChange={(e) => setDimension(e.target.value)} placeholder="Technical Accuracy" />
      </Field>

      <SectionLabel label="Hint (optional)" />
      <Field label="Shown on request — using it caps the score at Proficient">
        <Textarea rows={2} value={hint} onChange={(e) => setHint(e.target.value)} placeholder="e.g. Group by state, then filter the groups with HAVING." />
      </Field>
    </EditShell>
  )
}
