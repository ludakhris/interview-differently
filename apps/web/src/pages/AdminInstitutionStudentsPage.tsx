import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { AnalyticsTabs } from '@/components/AnalyticsTabs'
import { fetchStudentRoster, type RosterResponse, type RosterStudent } from '@/services/analyticsService'
import { getInstitution, type InstitutionDetail } from '@/services/institutionsService'
import { downloadCsv, filenameSlug } from '@/lib/csv'

/**
 * Students roster. One row per member in scope with simulations, immersive
 * interviews and assessments rolled up; click through to the student detail
 * page. Anonymous by default like the heatmap (?names=1 reveals).
 */

type SortKey = 'label' | 'sims' | 'avg' | 'pre' | 'post' | 'gain' | 'active'

export function AdminInstitutionStudentsPage() {
  const { institutionId = '' } = useParams<{ institutionId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { getToken } = useAuth()
  const cohortId = searchParams.get('cohortId') ?? ''
  const showNames = searchParams.get('names') === '1'
  const sort = (searchParams.get('sort') as SortKey) || 'label'
  const dir = searchParams.get('dir') === 'desc' ? 'desc' : 'asc'

  const [detail, setDetail] = useState<InstitutionDetail | null>(null)
  const [data, setData] = useState<RosterResponse | null>(null)
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
      setData(await fetchStudentRoster(getToken, institutionId, cohortId || undefined))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load students')
    } finally {
      setLoading(false)
    }
  }, [institutionId, cohortId, getToken])

  useEffect(() => {
    refresh()
  }, [refresh])

  function patchParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === '') params.delete(k)
      else params.set(k, v)
    }
    setSearchParams(params, { replace: true })
  }

  const label = useCallback(
    (s: RosterStudent) => (showNames ? (s.displayName ?? s.email ?? s.anonymousLabel) : s.anonymousLabel),
    [showNames],
  )

  const rows = useMemo(() => {
    if (!data) return []
    const num = (v: number | string | null) => (v == null ? -Infinity : typeof v === 'string' ? Date.parse(v) : v)
    const key = (s: RosterStudent): number | string => {
      switch (sort) {
        case 'sims': return s.completedSimulations
        case 'avg': return num(s.avgScore)
        case 'pre': return num(s.prePercent)
        case 'post': return num(s.postPercent)
        case 'gain': return num(gain(s))
        case 'active': return num(s.lastActiveAt)
        default: return label(s)
      }
    }
    return [...data.students].sort((a, b) => {
      const x = key(a), y = key(b)
      const c = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : Number(x) - Number(y)
      return dir === 'asc' ? c : -c
    })
  }, [data, sort, dir, label])

  function clickSort(k: SortKey) {
    if (sort === k) patchParams({ dir: dir === 'asc' ? 'desc' : 'asc' })
    else patchParams({ sort: k, dir: k === 'label' ? 'asc' : 'desc' })
  }

  const Th = ({ k, children, right, first }: { k: SortKey; children: React.ReactNode; right?: boolean; first?: boolean }) => (
    <th className={`py-2 ${right ? 'text-right px-2' : 'text-left pr-4'} ${first ? 'pl-5' : ''} font-bold whitespace-nowrap`}>
      <button onClick={() => clickSort(k)} className={`hover:text-[#f5f3ee] transition-colors ${sort === k ? 'text-[#f5f3ee]' : ''}`}>
        {children}
        {sort === k && <span className="ml-1 text-[9px]">{dir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </th>
  )

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav />
      <div className="max-w-6xl mx-auto px-6 py-12">
        <button onClick={() => navigate('/admin/institutions')} className="text-[12px] text-slate-mid hover:text-[#f5f3ee] transition-colors mb-3">
          ← Back to institutions
        </button>

        <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-1">Analytics</p>
            <h1 className="font-display font-extrabold text-[24px] text-[#f5f3ee] tracking-tight">{detail?.name ?? 'Institution analytics'}</h1>
            {data?.cohort && (
              <p className="text-[12px] text-slate-mid mt-1">
                Cohort: <span className="text-[#f5f3ee]">{data.cohort.name}</span>
              </p>
            )}
          </div>
          {detail && detail.cohorts.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="cohort-filter" className="text-[12px] text-slate-mid">
                Filter:
              </label>
              <select
                id="cohort-filter"
                value={cohortId}
                onChange={(e) => patchParams({ cohortId: e.target.value || null })}
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

        <AnalyticsTabs institutionId={institutionId} active="students" available={['overview', 'engagement', 'heatmap', 'assessments', 'students']} />

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 mb-4">
            <p className="text-[13px] text-red-400">{error}</p>
          </div>
        )}

        {loading ? (
          <p className="text-[13px] text-slate-mid">Loading…</p>
        ) : !data || data.students.length === 0 ? (
          <div className="bg-[#111111] rounded-xl border border-white/10 px-6 py-12 text-center">
            <p className="text-[13px] text-slate-mid">No students in scope yet.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <label className="flex items-center gap-2 text-[12px] text-slate-mid cursor-pointer">
                <input type="checkbox" checked={showNames} onChange={(e) => patchParams({ names: e.target.checked ? '1' : null })} className="accent-green" />
                Show names &amp; emails
              </label>
              <button
                onClick={() =>
                  downloadCsv({
                    filename: filenameSlug(data.institution.name, data.cohort?.name ?? null, 'students'),
                    headers: [
                      showNames ? 'name' : 'student',
                      ...(showNames ? ['email'] : []),
                      'cohorts',
                      'completed_simulations',
                      'immersive_completed',
                      'avg_score',
                      'assessments_submitted',
                      'pre_pct',
                      'post_pct',
                      'improvement_pts',
                      'last_active',
                    ],
                    rows: rows.map((s) => [
                      label(s),
                      ...(showNames ? [s.email] : []),
                      s.cohorts.join('; '),
                      s.completedSimulations,
                      s.immersiveCompleted,
                      s.avgScore,
                      s.assessmentsSubmitted,
                      s.prePercent,
                      s.postPercent,
                      gain(s),
                      s.lastActiveAt,
                    ]),
                  })
                }
                className="text-[11px] font-semibold text-slate-mid hover:text-[#f5f3ee] transition-colors"
              >
                ↓ CSV
              </button>
            </div>

            <div className="bg-[#111111] rounded-xl border border-white/10 overflow-x-auto">
              <table className="min-w-full text-[12px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-slate-mid border-b border-white/10">
                    <Th k="label" first>Student</Th>
                    {!cohortId && <th className="py-2 pr-4 text-left font-bold">Cohort</th>}
                    <Th k="sims" right>Sims</Th>
                    <Th k="avg" right>Avg score</Th>
                    <Th k="pre" right>Pre</Th>
                    <Th k="post" right>Post</Th>
                    <Th k="gain" right>% Improvement</Th>
                    <Th k="active" right>Last active</Th>
                    <th className="pr-5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr
                      key={s.userId}
                      onClick={() => navigate(`/admin/institutions/${institutionId}/students/${encodeURIComponent(s.userId)}`)}
                      className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] cursor-pointer"
                    >
                      <td className="py-3 pl-5 pr-4">
                        <p className="text-[#f5f3ee]">{label(s)}</p>
                        {showNames && s.displayName && s.email && <p className="text-[11px] text-white/40">{s.email}</p>}
                      </td>
                      {!cohortId && <td className="py-3 pr-4 text-slate-mid">{s.cohorts.join(', ') || '—'}</td>}
                      <td className="py-3 px-2 text-right font-mono text-slate-light">
                        {s.completedSimulations}
                        {s.immersiveCompleted > 0 && <span className="text-white/30"> +{s.immersiveCompleted}</span>}
                      </td>
                      <td className="py-3 px-2 text-right font-mono" style={{ color: scoreColor(s.avgScore) }}>
                        {s.avgScore ?? '—'}
                      </td>
                      <td className={`py-3 px-2 text-right font-mono ${s.prePercent == null ? 'text-white/25' : 'text-[#d4830a]'}`}>{s.prePercent == null ? '—' : `${s.prePercent}%`}</td>
                      <td className={`py-3 px-2 text-right font-mono ${s.postPercent == null ? 'text-white/25' : 'text-[#2d9e5f]'}`}>{s.postPercent == null ? '—' : `${s.postPercent}%`}</td>
                      <td className="py-3 px-2 text-right font-mono font-semibold" style={{ color: gainColor(gain(s)) }}>
                        {gain(s) == null ? '—' : `${gain(s)! > 0 ? '+' : ''}${gain(s)}%`}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-white/40 whitespace-nowrap">
                        {s.lastActiveAt ? new Date(s.lastActiveAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'never'}
                      </td>
                      <td className="py-3 pr-5 text-right text-[11px] text-slate-mid">View →</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** post − pre in percentage points; null unless both exist. */
function gain(s: RosterStudent): number | null {
  return s.prePercent == null || s.postPercent == null ? null : s.postPercent - s.prePercent
}

function gainColor(v: number | null): string {
  if (v == null) return 'rgba(255,255,255,0.3)'
  return v > 0 ? '#2d9e5f' : v < 0 ? '#ef4444' : '#b0bec5'
}

function scoreColor(score: number | null): string {
  if (score == null) return 'rgba(255,255,255,0.3)'
  if (score >= 80) return '#2d9e5f'
  if (score >= 60) return '#d4830a'
  return '#ef4444'
}
