import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { AnalyticsTabs } from '@/components/AnalyticsTabs'
import { fetchInstitutionAnalytics, type InstitutionAnalytics } from '@/services/analyticsService'
import { getInstitution, type InstitutionDetail } from '@/services/institutionsService'
import { downloadCsv, filenameSlug } from '@/lib/csv'

/**
 * Institution + cohort overview analytics. URL: /admin/institutions/:id/analytics.
 *
 * Uses ?cohortId=... to filter scope. When unset, shows institution-wide
 * aggregates plus a per-cohort breakdown table; when set, scopes everything
 * to that cohort. The cohort dropdown updates the URL (replace) so back/forward
 * works and the page is shareable.
 */
export function AdminInstitutionAnalyticsPage() {
  const { institutionId = '' } = useParams<{ institutionId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { getToken } = useAuth()
  const cohortId = searchParams.get('cohortId') ?? ''

  const [detail, setDetail] = useState<InstitutionDetail | null>(null)
  const [analytics, setAnalytics] = useState<InstitutionAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Institution detail (for the cohort dropdown options) loads once.
  useEffect(() => {
    if (!institutionId) return
    getInstitution(getToken, institutionId)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load institution'))
  }, [institutionId, getToken])

  const refresh = useCallback(async () => {
    if (!institutionId) return
    setLoading(true)
    setError(null)
    try {
      const a = await fetchInstitutionAnalytics(getToken, institutionId, cohortId || undefined)
      setAnalytics(a)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [institutionId, cohortId, getToken])

  useEffect(() => {
    refresh()
  }, [refresh])

  function setCohort(next: string) {
    const params = new URLSearchParams(searchParams)
    if (next) params.set('cohortId', next)
    else params.delete('cohortId')
    setSearchParams(params, { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav />
      <div className="max-w-5xl mx-auto px-6 py-12">
        <button
          onClick={() => navigate('/admin/institutions')}
          className="text-[12px] text-slate-mid hover:text-[#f5f3ee] transition-colors mb-3"
        >
          ← Back to institutions
        </button>

        <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-1">Analytics</p>
            <h1 className="font-display font-extrabold text-[24px] text-[#f5f3ee] tracking-tight">
              {detail?.name ?? 'Institution analytics'}
            </h1>
          </div>

          {detail && detail.cohorts.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="cohort-filter" className="text-[12px] text-slate-mid">
                Filter:
              </label>
              <select
                id="cohort-filter"
                value={cohortId}
                onChange={(e) => setCohort(e.target.value)}
                className="bg-[#111111] border border-white/10 rounded-lg px-3 py-1.5 text-[13px] text-[#f5f3ee] focus:outline-none focus:border-white/30"
              >
                <option value="">All cohorts</option>
                {detail.cohorts.map((c) => (
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
          active="overview"
          available={['overview', 'engagement']}
        />

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 mb-6">
            <p className="text-[13px] text-red-400">{error}</p>
          </div>
        )}

        {loading && !analytics ? (
          <p className="text-[13px] text-slate-mid">Loading…</p>
        ) : !analytics ? null : (
          <AnalyticsSections analytics={analytics} />
        )}
      </div>
    </div>
  )
}

// ── Sections ───────────────────────────────────────────────────────────────

function AnalyticsSections({ analytics }: { analytics: InstitutionAnalytics }) {
  const isFiltered = analytics.cohort !== null
  // Filename slug used to name CSVs — institution + (optional) cohort.
  const slug = filenameSlug(analytics.institution.name, analytics.cohort?.name ?? null)

  return (
    <div className="space-y-6">
      {isFiltered && analytics.cohort && (
        <p className="text-[13px] text-slate-light">
          Showing data for cohort <span className="font-semibold text-[#f5f3ee]">{analytics.cohort.name}</span>.
        </p>
      )}

      {/* Stat cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">Overview</h2>
          <CsvButton
            onClick={() =>
              downloadCsv({
                filename: `${slug}-overview`,
                headers: [
                  'institution',
                  'cohort',
                  'total_students',
                  'active_last_30_days',
                  'completed_simulations',
                  'started_simulations',
                  'completion_rate_pct',
                  'avg_overall_score',
                ],
                rows: [
                  [
                    analytics.institution.name,
                    analytics.cohort?.name ?? '(all cohorts)',
                    analytics.totalStudents,
                    analytics.activeStudentsLast30Days,
                    analytics.completedSimulations,
                    analytics.startedSimulations,
                    analytics.completionRate,
                    analytics.avgOverallScore,
                  ],
                ],
              })
            }
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Students" value={analytics.totalStudents} />
          <StatCard label="Active (30d)" value={analytics.activeStudentsLast30Days} />
          <StatCard label="Completed sims" value={analytics.completedSimulations} />
          <StatCard
            label="Completion rate"
            value={
              analytics.completionRate !== null
                ? `${analytics.completionRate}%`
                : '—'
            }
            sublabel={
              analytics.startedSimulations > 0
                ? `${analytics.startedSimulations} started`
                : undefined
            }
          />
          <StatCard
            label="Avg score"
            value={analytics.avgOverallScore !== null ? analytics.avgOverallScore : '—'}
            accent={scoreColor(analytics.avgOverallScore)}
          />
        </div>
      </div>

      {/* Per-track */}
      <BreakdownTable
        title="By track"
        rows={analytics.byTrack}
        rowKey="Track"
        emptyHint="No completed simulations yet."
        onExport={() =>
          downloadCsv({
            filename: `${slug}-by-track`,
            headers: ['track', 'completions', 'avg_score'],
            rows: analytics.byTrack.map((r) => [r.key, r.count, r.avg]),
          })
        }
      />

      {/* Per-dimension */}
      <BreakdownTable
        title="By dimension"
        rows={analytics.byDimension}
        rowKey="Dimension"
        emptyHint="No dimension scores yet."
        onExport={() =>
          downloadCsv({
            filename: `${slug}-by-dimension`,
            headers: ['dimension', 'scored_count', 'avg_score'],
            rows: analytics.byDimension.map((r) => [r.key, r.count, r.avg]),
          })
        }
      />

      {/* Per-cohort (only shown when not filtered) */}
      {!isFiltered && analytics.byCohort && (
        <CohortBreakdownTable
          rows={analytics.byCohort}
          onExport={() =>
            downloadCsv({
              filename: `${slug}-by-cohort`,
              headers: ['cohort', 'students', 'completed_simulations', 'avg_overall_score'],
              rows: (analytics.byCohort ?? []).map((r) => [
                r.name,
                r.totalStudents,
                r.completedSimulations,
                r.avgOverallScore,
              ]),
            })
          }
        />
      )}
    </div>
  )
}

function CsvButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] font-semibold text-slate-mid hover:text-[#f5f3ee] transition-colors"
      title="Download as CSV"
    >
      ↓ CSV
    </button>
  )
}

function StatCard({
  label,
  value,
  accent,
  sublabel,
}: {
  label: string
  value: string | number
  accent?: string
  sublabel?: string
}) {
  return (
    <div className="bg-[#111111] rounded-xl border border-white/10 p-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid mb-2">{label}</p>
      <p className="font-display font-extrabold text-[28px]" style={{ color: accent ?? '#f5f3ee' }}>
        {value}
      </p>
      {sublabel && <p className="text-[11px] text-slate-mid mt-1">{sublabel}</p>}
    </div>
  )
}

function BreakdownTable({
  title,
  rows,
  rowKey,
  emptyHint,
  onExport,
}: {
  title: string
  rows: Array<{ key: string; count: number; avg: number }>
  rowKey: string
  emptyHint: string
  onExport?: () => void
}) {
  return (
    <div className="bg-[#111111] rounded-xl border border-white/10 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">{title}</h2>
        {onExport && rows.length > 0 && <CsvButton onClick={onExport} />}
      </div>
      {rows.length === 0 ? (
        <p className="text-[13px] text-slate-mid">{emptyHint}</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-widest text-slate-mid border-b border-white/10">
              <th className="font-semibold py-2">{rowKey}</th>
              <th className="font-semibold py-2 text-right">Count</th>
              <th className="font-semibold py-2 text-right">Avg score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-white/5 last:border-0">
                <td className="py-2 text-[#f5f3ee] capitalize">{r.key}</td>
                <td className="py-2 text-right text-slate-light">{r.count}</td>
                <td className="py-2 text-right font-semibold" style={{ color: scoreColor(r.avg) }}>
                  {r.avg}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function CohortBreakdownTable({
  rows,
  onExport,
}: {
  rows: Array<{
    cohortId: string | null
    name: string
    totalStudents: number
    completedSimulations: number
    avgOverallScore: number | null
  }>
  onExport?: () => void
}) {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        // Push "(no cohort)" to the bottom
        if (a.cohortId === null) return 1
        if (b.cohortId === null) return -1
        return a.name.localeCompare(b.name)
      }),
    [rows],
  )

  return (
    <div className="bg-[#111111] rounded-xl border border-white/10 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">By cohort</h2>
        {onExport && sorted.length > 0 && <CsvButton onClick={onExport} />}
      </div>
      {sorted.length === 0 ? (
        <p className="text-[13px] text-slate-mid">No memberships yet.</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-widest text-slate-mid border-b border-white/10">
              <th className="font-semibold py-2">Cohort</th>
              <th className="font-semibold py-2 text-right">Students</th>
              <th className="font-semibold py-2 text-right">Completed sims</th>
              <th className="font-semibold py-2 text-right">Avg score</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.cohortId ?? 'none'} className="border-b border-white/5 last:border-0">
                <td className={`py-2 ${r.cohortId === null ? 'italic text-slate-mid' : 'text-[#f5f3ee]'}`}>
                  {r.name}
                </td>
                <td className="py-2 text-right text-slate-light">{r.totalStudents}</td>
                <td className="py-2 text-right text-slate-light">{r.completedSimulations}</td>
                <td
                  className="py-2 text-right font-semibold"
                  style={{ color: scoreColor(r.avgOverallScore) }}
                >
                  {r.avgOverallScore ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// Same thresholds the dashboard's competency profile uses.
function scoreColor(score: number | null): string {
  if (score === null) return '#888'
  if (score >= 80) return '#2d9e5f'
  if (score >= 60) return '#d4830a'
  return '#c0392b'
}
