import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import CodeMirror from '@uiw/react-codemirror'
import { PostgreSQL, sql } from '@codemirror/lang-sql'
import { Nav } from '@/components/Nav'
import { sandboxEditorTheme } from '@/lib/sql/editorTheme'
import {
  createDataset,
  deleteDataset,
  getDataset,
  listCohortOptions,
  listDatasets,
  setDatasetCohorts,
  updateDataset,
  validateDatasetSql,
  type AdminDatasetSummary,
  type CohortOption,
  type DatasetDetail,
  type SchemaTable,
} from '@/services/datasetsService'

/**
 * Admin page for SQL sandbox datasets (#25).
 *
 * Master-detail like /admin/institutions: datasets on the left, the selected
 * one's editor on the right. Saving runs the setup script through PGlite on
 * the server — a script that fails to execute is rejected, so a published
 * dataset always builds cleanly in the student's browser.
 */

type GetToken = () => Promise<string | null>

export function AdminDatasetsPage() {
  const { getToken } = useAuth()
  const [datasets, setDatasets] = useState<AdminDatasetSummary[]>([])
  const [cohorts, setCohorts] = useState<CohortOption[]>([])
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null)
  const [detail, setDetail] = useState<DatasetDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [list, opts] = await Promise.all([listDatasets(getToken), listCohortOptions(getToken)])
      setDatasets(list)
      setCohorts(opts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load datasets')
    }
  }, [getToken])

  useEffect(() => {
    setLoading(true)
    refresh().finally(() => setLoading(false))
  }, [refresh])

  useEffect(() => {
    if (!selectedId || selectedId === 'new') {
      setDetail(null)
      return
    }
    getDataset(getToken, selectedId)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load dataset'))
  }, [selectedId, getToken])

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav />
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-1">Admin · Tools</p>
          <h1 className="font-display font-extrabold text-[24px] text-[#f5f3ee] tracking-tight">SQL Datasets</h1>
          <p className="text-[13px] text-slate-mid mt-1">
            Postgres setup scripts students can query in the SQL Sandbox. Assign a dataset to a cohort to enable the tool for its members.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 mb-4">
            <p className="text-[13px] text-red-400">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">Datasets</h2>
              <button
                onClick={() => setSelectedId('new')}
                className="text-[12px] font-semibold text-green-light hover:text-green transition-colors"
              >
                + New
              </button>
            </div>
            {loading ? (
              <p className="text-[13px] text-slate-mid">Loading…</p>
            ) : datasets.length === 0 ? (
              <p className="text-[13px] text-slate-mid">No datasets yet.</p>
            ) : (
              <ul className="space-y-1">
                {datasets.map((d) => (
                  <li key={d.id}>
                    <button
                      onClick={() => setSelectedId(d.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                        selectedId === d.id ? 'bg-white/10 border border-white/15' : 'border border-transparent hover:bg-white/5'
                      }`}
                    >
                      <p className="text-[13px] font-semibold text-[#f5f3ee]">{d.name}</p>
                      <p className="text-[11px] text-slate-mid">
                        <span className="font-mono">{d.slug}</span> · {d.schemaSummary.length} table{d.schemaSummary.length !== 1 ? 's' : ''} ·{' '}
                        {d.cohortCount} cohort{d.cohortCount !== 1 ? 's' : ''}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="min-w-0">
            {selectedId === 'new' ? (
              <DatasetEditor
                key="new"
                getToken={getToken}
                cohorts={cohorts}
                onSaved={async (saved) => {
                  await refresh()
                  setSelectedId(saved.id)
                }}
              />
            ) : !selectedId ? (
              <div className="bg-[#111111] rounded-xl border border-white/10 px-6 py-12 text-center">
                <p className="text-[13px] text-slate-mid">Select a dataset to edit it, or create a new one.</p>
              </div>
            ) : !detail ? (
              <p className="text-[13px] text-slate-mid">Loading…</p>
            ) : (
              <DatasetEditor
                key={detail.id}
                getToken={getToken}
                cohorts={cohorts}
                initial={detail}
                onSaved={async () => {
                  await refresh()
                  setDetail(await getDataset(getToken, detail.id))
                }}
                onDeleted={async () => {
                  setSelectedId(null)
                  await refresh()
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Editor ─────────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-[#111111] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-[#f5f3ee] placeholder:text-white/25 focus:outline-none focus:border-white/30'

function DatasetEditor({
  getToken,
  cohorts,
  initial,
  onSaved,
  onDeleted,
}: {
  getToken: GetToken
  cohorts: CohortOption[]
  initial?: DatasetDetail
  onSaved: (saved: DatasetDetail) => Promise<void>
  onDeleted?: () => Promise<void>
}) {
  const navigate = useNavigate()
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [setupSql, setSetupSql] = useState(initial?.setupSql ?? '')
  const [cohortIds, setCohortIds] = useState<string[]>(initial?.cohortIds ?? [])
  const [schema, setSchema] = useState<SchemaTable[] | null>(initial?.schemaSummary ?? null)
  const [validating, setValidating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const validate = async () => {
    setValidating(true)
    setMsg(null)
    try {
      const s = await validateDatasetSql(getToken, setupSql)
      setSchema(s)
      setMsg({ kind: 'ok', text: `Script OK — ${s.length} table${s.length !== 1 ? 's' : ''}, ${s.reduce((n, t) => n + t.rowCount, 0)} rows.` })
    } catch (e) {
      setSchema(null)
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Validation failed' })
    } finally {
      setValidating(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const payload = { slug, name, description: description.trim() || null, setupSql }
      const saved = initial ? await updateDataset(getToken, initial.id, payload) : await createDataset(getToken, payload)
      await setDatasetCohorts(getToken, saved.id, cohortIds)
      setSchema(saved.schemaSummary)
      setMsg({ kind: 'ok', text: 'Saved.' })
      await onSaved(saved)
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  const byInstitution = cohorts.reduce<Record<string, CohortOption[]>>((acc, c) => {
    ;(acc[c.institutionName] ??= []).push(c)
    return acc
  }, {})

  const totalRows = schema?.reduce((n, t) => n + t.rowCount, 0) ?? 0

  return (
    <div className="bg-[#111111] rounded-xl border border-white/10 overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px]">
        {/* ── Script ── */}
        <div className="p-6 space-y-4 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-3">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="SQL Fundamentals" className={`${inputCls} mt-1`} />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">Slug</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="sql-fundamentals"
                className={`${inputCls} mt-1 font-mono`}
              />
            </label>
          </div>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One line shown to students (optional)"
              className={`${inputCls} mt-1`}
            />
          </label>

          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">Setup SQL</span>
              <span className="font-mono text-[10px] text-white/30">{setupSql.split('\n').length} lines</span>
            </div>
            <div className="rounded-lg border border-white/10 overflow-hidden bg-[#0d0d0d]">
              <CodeMirror
                value={setupSql}
                onChange={setSetupSql}
                theme="dark"
                height="420px"
                placeholder={'CREATE TABLE customers (...);\nINSERT INTO customers VALUES (...);'}
                extensions={[sandboxEditorTheme, sql({ dialect: PostgreSQL })]}
                basicSetup={{ lineNumbers: true, foldGutter: true }}
                style={{ fontSize: 12 }}
              />
            </div>
            <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed">
              Plain Postgres. Keep it deterministic — no <span className="font-mono">RANDOM()</span> or <span className="font-mono">NOW()</span>; use{' '}
              <span className="font-mono">CURRENT_DATE - n</span> for relative dates so every student gets identical data.
            </p>
          </div>
        </div>

        {/* ── Side rail: schema · cohorts · meta ── */}
        <aside className="border-t lg:border-t-0 lg:border-l border-white/8 bg-[#0d0d0d] p-5 space-y-6">
          <section>
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">Schema</p>
              {schema && (
                <span className="font-mono text-[10px] text-white/30">
                  {schema.length} tables · {totalRows} rows
                </span>
              )}
            </div>
            {!schema || schema.length === 0 ? (
              <p className="text-[12px] text-white/40">Validate the script to see its tables here.</p>
            ) : (
              <ul className="space-y-1.5">
                {schema.map((t) => (
                  <li key={t.table} className="rounded-lg border border-white/8 px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-[12px] font-semibold text-[#f5f3ee] truncate">{t.table}</span>
                      <span className="font-mono text-[10px] text-white/30 flex-shrink-0">{t.rowCount} rows</span>
                    </div>
                    <p className="font-mono text-[10px] text-white/40 truncate mt-0.5">{t.columns.map((c) => c.name).join(', ')}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid mb-1">Cohorts with access</p>
            <p className="text-[11px] text-white/40 mb-2 leading-relaxed">
              The cohort also needs the SQL Sandbox tool switched on under Institutions &amp; Cohorts.
            </p>
            {cohorts.length === 0 ? (
              <p className="text-[12px] text-white/40">No cohorts exist yet.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(byInstitution).map(([inst, list]) => (
                  <div key={inst}>
                    <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">{inst}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((c) => {
                        const on = cohortIds.includes(c.id)
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setCohortIds((ids) => (on ? ids.filter((x) => x !== c.id) : [...ids, c.id]))}
                            className={`px-2.5 py-1 rounded-full text-[12px] border transition-colors ${
                              on
                                ? 'bg-[#1a6b3c]/30 border-[#2d9e5f]/60 text-[#f5f3ee]'
                                : 'border-white/10 text-slate-mid hover:border-white/30'
                            }`}
                          >
                            {c.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {initial && (
            <section className="font-mono text-[10px] text-white/30 space-y-1">
              <p>hash {initial.setupHash.slice(0, 12)}</p>
              <p>dialect {initial.dialect}</p>
            </section>
          )}
        </aside>
      </div>

      {/* ── Action bar ── */}
      <div className="sticky bottom-0 flex items-center justify-between gap-4 px-6 py-3 border-t border-white/8 bg-[#0d0d0d]">
        <div className="flex items-center gap-4 min-w-0">
          {initial && onDeleted && (
            <button
              onClick={async () => {
                if (!confirm(`Delete dataset "${initial.name}"? Cohorts will lose access.`)) return
                try {
                  await deleteDataset(getToken, initial.id)
                  await onDeleted()
                } catch (e) {
                  setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Delete failed' })
                }
              }}
              className="text-[11px] text-red-400/70 hover:text-red-400 transition-colors flex-shrink-0"
            >
              Delete
            </button>
          )}
          {initial && (
            <button
              onClick={() => navigate(`/tools/sql?dataset=${encodeURIComponent(initial.slug)}`)}
              className="text-[11px] text-slate-mid hover:text-[#f5f3ee] transition-colors flex-shrink-0"
            >
              Open in sandbox →
            </button>
          )}
          {msg && (
            <p className={`text-[12px] font-mono truncate ${msg.kind === 'ok' ? 'text-green-light' : 'text-red-400'}`} title={msg.text}>
              {msg.text}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={validate}
            disabled={validating || !setupSql.trim()}
            className="px-3 py-1.5 rounded-md border border-white/15 hover:border-white/30 text-[12px] font-semibold text-[#f5f3ee] disabled:opacity-50 transition-colors"
          >
            {validating ? 'Validating…' : 'Validate'}
          </button>
          <button
            onClick={save}
            disabled={saving || !slug.trim() || !name.trim() || !setupSql.trim()}
            className="px-3 py-1.5 rounded-md bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[12px] font-semibold text-white disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : initial ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
