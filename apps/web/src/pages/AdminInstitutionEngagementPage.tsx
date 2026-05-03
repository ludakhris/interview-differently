import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { AnalyticsTabs } from '@/components/AnalyticsTabs'
import {
  fetchScenarioEngagement,
  type ScenarioEngagementResponse,
  type ScenarioEngagementRow,
} from '@/services/analyticsService'
import { getInstitution, type InstitutionDetail } from '@/services/institutionsService'
import { downloadCsv, filenameSlug } from '@/lib/csv'

/**
 * Per-scenario engagement: starts, completions, drops, retried users, avg score.
 * Lives at /admin/institutions/:id/engagement and shares the cohort filter
 * convention with the overview page (?cohortId=...).
 */
export function AdminInstitutionEngagementPage() {
  const { institutionId = '' } = useParams<{ institutionId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { getToken } = useAuth()
  const cohortId = searchParams.get('cohortId') ?? ''

  const [detail, setDetail] = useState<InstitutionDetail | null>(null)
  const [data, setData] = useState<ScenarioEngagementResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      const d = await fetchScenarioEngagement(getToken, institutionId, cohortId || undefined)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load engagement')
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

        <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
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
          active="engagement"
          available={['overview', 'engagement', 'heatmap']}
        />

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 mb-6">
            <p className="text-[13px] text-red-400">{error}</p>
          </div>
        )}

        {loading && !data ? (
          <p className="text-[13px] text-slate-mid">Loading…</p>
        ) : !data ? null : (
          <EngagementTable data={data} />
        )}
      </div>
    </div>
  )
}

// ── Table ──────────────────────────────────────────────────────────────────

function EngagementTable({ data }: { data: ScenarioEngagementResponse }) {
  const slug = filenameSlug(data.institution.name, data.cohort?.name ?? null, 'engagement')

  return (
    <div className="bg-[#111111] rounded-xl border border-white/10 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">
            By scenario
          </h2>
          {data.cohort && (
            <p className="text-[12px] text-slate-mid mt-1">
              Cohort: <span className="text-[#f5f3ee]">{data.cohort.name}</span>
            </p>
          )}
        </div>
        {data.scenarios.length > 0 && (
          <button
            onClick={() =>
              downloadCsv({
                filename: slug,
                headers: [
                  'scenario_title',
                  'scenario_id',
                  'mode',
                  'starts',
                  'completions',
                  'completion_rate_pct',
                  'drops',
                  'retried_users',
                  'avg_score',
                ],
                rows: data.scenarios.map((r) => [
                  r.scenarioTitle,
                  r.scenarioId,
                  r.mode,
                  r.starts,
                  r.completions,
                  r.completionRate,
                  r.drops,
                  r.retriedUsers,
                  r.avgScore,
                ]),
              })
            }
            className="text-[11px] font-semibold text-slate-mid hover:text-[#f5f3ee] transition-colors"
            title="Download as CSV"
          >
            ↓ CSV
          </button>
        )}
      </div>

      {data.scenarios.length === 0 ? (
        <p className="text-[13px] text-slate-mid">
          No scenario activity yet — students need to start at least one simulation.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-slate-mid border-b border-white/10">
                <th className="font-semibold py-2 pr-3">Scenario</th>
                <th className="font-semibold py-2 px-2 text-right">Starts</th>
                <th className="font-semibold py-2 px-2 text-right">Completed</th>
                <th className="font-semibold py-2 px-2 text-right">Rate</th>
                <th className="font-semibold py-2 px-2 text-right">Drops</th>
                <th className="font-semibold py-2 px-2 text-right">Retried</th>
                <th className="font-semibold py-2 pl-2 text-right">Avg score</th>
              </tr>
            </thead>
            <tbody>
              {data.scenarios.map((r) => (
                <ScenarioRow key={r.scenarioId} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ScenarioRow({ row }: { row: ScenarioEngagementRow }) {
  return (
    <tr className="border-b border-white/5 last:border-0 align-top">
      <td className="py-2 pr-3 max-w-[260px]">
        <p className="text-[#f5f3ee] truncate" title={row.scenarioTitle}>
          {row.scenarioTitle}
        </p>
        <p className="text-[10px] text-slate-mid font-mono truncate" title={row.scenarioId}>
          {row.mode !== 'traditional' && (
            <span className="uppercase tracking-wider mr-2 text-amber-400/80">{row.mode}</span>
          )}
          {row.scenarioId}
        </p>
      </td>
      <td className="py-2 px-2 text-right text-slate-light">{row.starts}</td>
      <td className="py-2 px-2 text-right text-slate-light">{row.completions}</td>
      <td className="py-2 px-2 text-right" style={{ color: rateColor(row.completionRate) }}>
        {row.completionRate !== null ? `${row.completionRate}%` : '—'}
      </td>
      <td className="py-2 px-2 text-right text-slate-light">{row.drops}</td>
      <td className="py-2 px-2 text-right text-slate-light">{row.retriedUsers}</td>
      <td className="py-2 pl-2 text-right font-semibold" style={{ color: scoreColor(row.avgScore) }}>
        {row.avgScore ?? '—'}
      </td>
    </tr>
  )
}

function rateColor(rate: number | null): string {
  if (rate === null) return '#888'
  if (rate >= 80) return '#2d9e5f'
  if (rate >= 50) return '#d4830a'
  return '#c0392b'
}

function scoreColor(score: number | null): string {
  if (score === null) return '#888'
  if (score >= 80) return '#2d9e5f'
  if (score >= 60) return '#d4830a'
  return '#c0392b'
}
