import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { DimensionTrendChart } from '@/components/DimensionTrendChart'
import {
  fetchStudentDetail,
  type StudentDetailResponse,
} from '@/services/analyticsService'

/**
 * Admin drill-down for a single student inside an institution. Linked from
 * the cohort breakdown rows on the analytics overview (and eventually
 * heatmap rows). Shows profile + memberships, the per-dimension trend
 * chart, and the full completion history.
 *
 * Guarded by AdminRoute. Backend additionally checks the student is a
 * member of the requested institution before returning, so a full admin
 * can't poke arbitrary user IDs.
 */
export function AdminStudentDetailPage() {
  const { institutionId = '', userId = '' } = useParams<{ institutionId: string; userId: string }>()
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const [data, setData] = useState<StudentDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!institutionId || !userId) return
    setLoading(true)
    setError(null)
    fetchStudentDetail(getToken, institutionId, userId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load student'))
      .finally(() => setLoading(false))
  }, [institutionId, userId, getToken])

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav />
      <div className="max-w-4xl mx-auto px-6 py-12">
        <button
          onClick={() => navigate(`/admin/institutions/${institutionId}/analytics`)}
          className="text-[12px] text-slate-mid hover:text-[#f5f3ee] transition-colors mb-3"
        >
          ← Back to analytics
        </button>

        {/* Privacy callout — be explicit this is an admin view */}
        <div className="mb-6 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2">
          <p className="text-[11px] uppercase tracking-widest font-bold text-amber-400">
            Admin view — student detail
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 mb-6">
            <p className="text-[13px] text-red-400">{error}</p>
          </div>
        )}

        {loading && !data ? (
          <p className="text-[13px] text-slate-mid">Loading…</p>
        ) : !data ? null : (
          <StudentSections data={data} />
        )}
      </div>
    </div>
  )
}

function StudentSections({ data }: { data: StudentDetailResponse }) {
  const displayName = data.user.displayName ?? data.user.email ?? data.user.id
  const cohortNames = data.memberships
    .map((m) => m.cohort?.name)
    .filter((n): n is string => Boolean(n))
  const overallAvg = data.completions.length
    ? Math.round(
        data.completions.reduce((s, c) => s + c.overallScore, 0) / data.completions.length,
      )
    : null

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-[#111111] rounded-xl border border-white/10 p-6">
        <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-1">
          {data.institution.name}
        </p>
        <h1 className="font-display font-extrabold text-[24px] text-[#f5f3ee] tracking-tight mb-2">
          {displayName}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-mid">
          {data.user.email && <span>{data.user.email}</span>}
          {cohortNames.length > 0 && (
            <span>
              Cohort{cohortNames.length > 1 ? 's' : ''}:{' '}
              <span className="text-[#f5f3ee]">{cohortNames.join(', ')}</span>
            </span>
          )}
          {data.user.createdAt && (
            <span>Joined {new Date(data.user.createdAt).toLocaleDateString()}</span>
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Completions" value={data.completions.length} />
        <MiniStat
          label="Avg score"
          value={overallAvg ?? '—'}
          accent={scoreColor(overallAvg)}
        />
        <MiniStat label="Immersive sessions" value={data.immersiveSessions.length} />
        <MiniStat
          label="Dimensions tracked"
          value={Object.keys(data.dimensionSeries).length}
        />
      </div>

      {/* Per-dimension trend chart */}
      <div className="bg-[#111111] rounded-xl border border-white/10 p-6">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-mid mb-4">
          Per-dimension trend
        </h2>
        <DimensionTrendChart series={data.dimensionSeries} />
      </div>

      {/* Completion history */}
      <div className="bg-[#111111] rounded-xl border border-white/10 p-6">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-mid mb-4">
          Completion history
        </h2>
        {data.completions.length === 0 ? (
          <p className="text-[13px] text-slate-mid">No completions yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {[...data.completions]
              .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
              .map((c) => (
                <li key={c.id} className="py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#f5f3ee] truncate" title={c.scenarioTitle}>
                      {c.scenarioTitle}
                    </p>
                    <p className="text-[11px] text-slate-mid">
                      {c.track} · {new Date(c.completedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span
                      className="text-[14px] font-bold"
                      style={{ color: scoreColor(c.overallScore) }}
                    >
                      {c.overallScore}
                    </span>
                    <a
                      href={`/scenario/${c.scenarioId}/feedback/${c.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-slate-mid hover:text-[#f5f3ee] transition-colors"
                    >
                      View feedback ↗
                    </a>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </div>

      {/* Immersive sessions */}
      {data.immersiveSessions.length > 0 && (
        <div className="bg-[#111111] rounded-xl border border-white/10 p-6">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-mid mb-4">
            Immersive sessions
          </h2>
          <ul className="divide-y divide-white/5">
            {[...data.immersiveSessions]
              .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
              .map((s) => (
                <li key={s.id} className="py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-[13px] text-[#f5f3ee] truncate" title={s.scenarioId}>
                      {s.scenarioId}
                    </p>
                    <p className="text-[11px] text-slate-mid">
                      {new Date(s.startedAt).toLocaleDateString()} · {s.responseCount} response
                      {s.responseCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span
                    className="text-[11px] font-semibold capitalize"
                    style={{ color: s.status === 'completed' ? '#2d9e5f' : '#888' }}
                  >
                    {s.status}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: string
}) {
  return (
    <div className="bg-[#111111] rounded-lg border border-white/10 p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-mid mb-1">{label}</p>
      <p className="font-display font-bold text-[20px]" style={{ color: accent ?? '#f5f3ee' }}>
        {value}
      </p>
    </div>
  )
}

function scoreColor(score: number | null): string {
  if (score === null) return '#888'
  if (score >= 80) return '#2d9e5f'
  if (score >= 60) return '#d4830a'
  return '#c0392b'
}
