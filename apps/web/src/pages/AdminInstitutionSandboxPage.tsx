import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { AnalyticsTabs } from '@/components/AnalyticsTabs'
import { getInstitution, type InstitutionDetail } from '@/services/institutionsService'
import {
  fetchSandboxActivity,
  listCohortTools,
  type SandboxActivity,
  type SandboxStudent,
} from '@/services/toolsService'

/**
 * Live monitor for the SQL sandbox: every student in a cohort with the
 * queries they've run (raw text, newest first). Manual refresh — no polling.
 * Lives at /admin/institutions/:id/sandbox?cohortId=...
 */
const AUTO_REFRESH_OPTIONS = [2, 5, 10, 30, 60] // seconds
const AUTO_REFRESH_DEFAULT = 30
const VISIBLE_QUERY_OPTIONS = [1, 2, 3, 5, 10] // queries shown per student before expanding
const VISIBLE_QUERIES_DEFAULT = 2

export function AdminInstitutionSandboxPage() {
  const { institutionId = '' } = useParams<{ institutionId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { getToken } = useAuth()
  const cohortId = searchParams.get('cohortId') ?? ''

  const [detail, setDetail] = useState<InstitutionDetail | null>(null)
  // Only cohorts with the sql-sandbox tool enabled — null until resolved.
  const [cohorts, setCohorts] = useState<InstitutionDetail['cohorts'] | null>(null)
  const [data, setData] = useState<SandboxActivity | null>(null)
  const [loading, setLoading] = useState(false)
  const [auto, setAuto] = useState(false)
  const [autoSec, setAutoSec] = useState(AUTO_REFRESH_DEFAULT)
  const [visibleQueries, setVisibleQueries] = useState(VISIBLE_QUERIES_DEFAULT)
  // Bumped by Expand all / Collapse all; each card applies it once per change.
  const [bulk, setBulk] = useState<{ open: boolean; seq: number } | null>(null)
  const inFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!institutionId) return
    getInstitution(getToken, institutionId)
      .then(async (d) => {
        setDetail(d)
        const flags = await Promise.all(d.cohorts.map((c) => listCohortTools(getToken, c.id)))
        const enabled = d.cohorts.filter((_, i) =>
          flags[i].some((t) => t.toolKey === 'sql-sandbox' && t.enabled)
        )
        setCohorts(enabled)
        // No "all cohorts" view here — default to the first enabled cohort.
        if (!enabled.some((c) => c.id === searchParams.get('cohortId')) && enabled.length > 0) {
          setSearchParams({ cohortId: enabled[0].id }, { replace: true })
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load institution'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutionId, getToken])

  // `silent` (auto-refresh ticks) skips the button's loading state so it doesn't flicker.
  const refresh = useCallback(
    async (silent = false) => {
      if (!cohortId || !cohorts?.some((c) => c.id === cohortId)) return
      if (!silent) setLoading(true)
      setError(null)
      inFlight.current = true
      try {
        setData(await fetchSandboxActivity(getToken, cohortId))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load activity')
      } finally {
        inFlight.current = false
        if (!silent) setLoading(false)
      }
    },
    [cohortId, cohorts, getToken]
  )

  useEffect(() => {
    setData(null)
    refresh()
  }, [refresh])

  // Auto-refresh: poll while enabled. Skips ticks while the tab is hidden or the
  // previous request is still running, so a slow API never stacks up requests.
  useEffect(() => {
    if (!auto) return
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !inFlight.current) void refresh(true)
    }, autoSec * 1000)
    return () => clearInterval(timer)
  }, [auto, autoSec, refresh])

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav />
      <div className="max-w-screen-2xl mx-auto px-6 py-12">
        <button
          onClick={() => navigate('/admin/institutions')}
          className="text-[12px] text-slate-mid hover:text-[#f5f3ee] transition-colors mb-3"
        >
          ← Back to institutions
        </button>

        <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-1">
              Analytics
            </p>
            <h1 className="font-display font-extrabold text-[24px] text-[#f5f3ee] tracking-tight">
              {detail?.name ?? 'SQL activity'}
            </h1>
          </div>

          {cohorts && cohorts.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="cohort-filter" className="text-[12px] text-slate-mid">
                Filter:
              </label>
              <select
                id="cohort-filter"
                value={cohortId}
                onChange={(e) => setSearchParams({ cohortId: e.target.value }, { replace: true })}
                className="bg-[#111111] border border-white/10 rounded-lg px-3 py-1.5 text-[13px] text-[#f5f3ee] focus:outline-none focus:border-white/30"
              >
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <AnalyticsTabs
          institutionId={institutionId}
          active="sandbox"
          available={[
            'overview',
            'engagement',
            'heatmap',
            'assessments',
            'students',
            'sandbox',
            'activity',
          ]}
        />

        <div className="flex items-center flex-wrap gap-x-5 gap-y-2 mb-4">
          <button
            onClick={() => refresh()}
            disabled={loading || !cohortId}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[13px] font-semibold text-[#f5f3ee] disabled:opacity-40 transition-colors"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <label className="flex items-center gap-1.5 text-[12px] text-slate-mid cursor-pointer select-none">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
              className="accent-[#2d9e5f]"
            />
            Auto-refresh every
          </label>
          <select
            aria-label="Auto-refresh interval"
            value={autoSec}
            onChange={(e) => setAutoSec(Number(e.target.value))}
            className="bg-[#111111] border border-white/10 rounded-lg px-2 py-1 text-[12px] text-[#f5f3ee] focus:outline-none focus:border-white/30"
          >
            {AUTO_REFRESH_OPTIONS.map((sec) => (
              <option key={sec} value={sec}>
                {sec}s
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[12px] text-slate-mid">
            Show last
            <select
              aria-label="Queries shown per student"
              value={visibleQueries}
              onChange={(e) => setVisibleQueries(Number(e.target.value))}
              className="bg-[#111111] border border-white/10 rounded-lg px-2 py-1 text-[12px] text-[#f5f3ee] focus:outline-none focus:border-white/30"
            >
              {VISIBLE_QUERY_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => setBulk((b) => ({ open: true, seq: (b?.seq ?? 0) + 1 }))}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[13px] font-semibold text-[#f5f3ee] transition-colors"
          >
            Expand all
          </button>
          <button
            onClick={() => setBulk((b) => ({ open: false, seq: (b?.seq ?? 0) + 1 }))}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[13px] font-semibold text-[#f5f3ee] transition-colors"
          >
            Collapse all
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 mb-6">
            <p className="text-[13px] text-red-400">{error}</p>
          </div>
        )}

        {cohorts && cohorts.length === 0 && (
          <p className="text-[13px] text-slate-mid">
            No cohort in this institution has the SQL sandbox tool enabled.
          </p>
        )}

        {data && (
          <>
            <p className="text-[12px] text-slate-mid mb-4">
              Updated {new Date(data.generatedAt).toLocaleTimeString()} · queries kept{' '}
              {data.retentionDays} days · showing latest 100 per student
            </p>
            <div className="space-y-3">
              {data.students.map((s) => (
                <StudentCard key={s.userId} s={s} limit={visibleQueries} bulk={bulk} />
              ))}
              {data.students.length === 0 && (
                <p className="text-[13px] text-slate-mid">No students in this cohort.</p>
              )}
            </div>
            {data.unassigned.length > 0 && (
              <div className="mt-8">
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-amber-400 mb-1">
                  Not in a cohort
                </h2>
                <p className="text-[12px] text-slate-mid mb-3">
                  These institution members ran queries but have no cohort, so they belong to no
                  cohort roster. Add them to a cohort to see them above.
                </p>
                <div className="space-y-3">
                  {data.unassigned.map((s) => (
                    <StudentCard key={s.userId} s={s} limit={visibleQueries} bulk={bulk} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function StudentCard({
  s,
  limit,
  bulk,
}: {
  s: SandboxStudent
  limit: number
  bulk: { open: boolean; seq: number } | null
}) {
  // Local state, so it survives Refresh (cards are keyed by userId).
  const [expanded, setExpanded] = useState(false)
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (!bulk) return
    if (ref.current) ref.current.open = bulk.open
    if (!bulk.open) setExpanded(false)
  }, [bulk])
  const hidden = s.queries.length - limit
  const shown = expanded ? s.queries : s.queries.slice(0, limit)
  return (
    <details
      ref={ref}
      open={s.queryCount > 0}
      className="bg-[#111111] rounded-xl border border-white/10"
    >
      <summary className="cursor-pointer px-5 py-3 flex items-center justify-between gap-4">
        <span className="text-[14px] font-semibold text-[#f5f3ee]">
          {s.name}
          {s.email && s.email !== s.name && (
            <span className="ml-2 text-[12px] font-normal text-slate-mid">{s.email}</span>
          )}
        </span>
        <span className="text-[12px] text-slate-mid whitespace-nowrap">
          {s.queryCount} {s.queryCount === 1 ? 'query' : 'queries'}
          {s.errorCount > 0 && (
            <span className="text-red-400">
              {' '}
              · {s.errorCount} {s.errorCount === 1 ? 'error' : 'errors'}
            </span>
          )}
          {s.lastQueryAt && <> · last {new Date(s.lastQueryAt).toLocaleString()}</>}
        </span>
      </summary>
      {s.queries.length === 0 ? (
        <p className="px-5 pb-4 text-[12px] text-slate-mid">No queries yet.</p>
      ) : (
        <ul className="border-t border-white/10 divide-y divide-white/5">
          {shown.map((q) => (
            <li key={q.id} className="px-5 py-3">
              <div className="flex items-center gap-2 text-[11px] text-slate-mid mb-1.5">
                <span className={q.ok ? 'text-green' : 'text-red-400'}>
                  {q.ok ? '● ok' : '● error'}
                </span>
                <span>{new Date(q.createdAt).toLocaleString()}</span>
                <span>· {q.datasetSlug}</span>
                {q.ok && q.rowCount != null && (
                  <span>
                    · {q.rowCount} {q.rowCount === 1 ? 'row' : 'rows'}
                  </span>
                )}
                {q.durationMs != null && <span>· {q.durationMs} ms</span>}
              </div>
              <pre className="text-[12px] text-[#f5f3ee] font-mono whitespace-pre-wrap break-words">
                {q.queryText}
              </pre>
              {q.errorMessage && (
                <p className="mt-1 text-[12px] text-red-400 font-mono">{q.errorMessage}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full border-t border-white/10 px-5 py-2 text-left text-[12px] font-semibold text-slate-mid hover:text-[#f5f3ee] transition-colors"
        >
          {expanded ? 'Show fewer' : `Show ${hidden} older ${hidden === 1 ? 'query' : 'queries'}`}
        </button>
      )}
    </details>
  )
}
