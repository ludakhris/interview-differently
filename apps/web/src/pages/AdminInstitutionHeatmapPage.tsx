import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { AnalyticsTabs } from '@/components/AnalyticsTabs'
import {
  fetchHeatmap,
  type HeatmapResponse,
  type HeatmapStudent,
} from '@/services/analyticsService'
import { getInstitution, type InstitutionDetail } from '@/services/institutionsService'
import { downloadCsv, filenameSlug } from '@/lib/csv'

/**
 * Competency heatmap. Rows = students in scope, columns = dimensions, cells
 * = averaged score banded into Strong (≥80, green) / Proficient (≥60, amber)
 * / Developing (<60, red), with empty cells for "no data yet."
 *
 * URL state: ?cohortId=... shared with sibling analytics pages, plus
 * ?sort=name|avg|<dimension> and ?names=1 (anonymous by default — the
 * "for sharing" use case wants names hidden unless the admin opts in).
 *
 * Sticky headers + first column let large cohorts scroll without losing
 * orientation.
 */

type SortKey = 'label' | 'avg' | string // string = a dimension name
type SortDir = 'asc' | 'desc'

export function AdminInstitutionHeatmapPage() {
  const { institutionId = '' } = useParams<{ institutionId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { getToken } = useAuth()
  const cohortId = searchParams.get('cohortId') ?? ''
  const showNames = searchParams.get('names') === '1'
  const sort = (searchParams.get('sort') as SortKey) || 'label'
  const dir = (searchParams.get('dir') as SortDir) || 'asc'

  const [detail, setDetail] = useState<InstitutionDetail | null>(null)
  const [data, setData] = useState<HeatmapResponse | null>(null)
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
      const d = await fetchHeatmap(getToken, institutionId, cohortId || undefined)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load heatmap')
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

  const sortedStudents = useMemo(() => {
    if (!data) return []
    return sortStudents(data.students, sort, dir)
  }, [data, sort, dir])

  function clickSort(key: SortKey) {
    if (sort === key) {
      patchParams({ dir: dir === 'asc' ? 'desc' : 'asc' })
    } else {
      // Sensible defaults: scores sort high→low first, names low→high
      patchParams({ sort: key, dir: key === 'label' ? 'asc' : 'desc' })
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav />
      <div className="max-w-6xl mx-auto px-6 py-12 print:py-4">
        <button
          onClick={() => navigate('/admin/institutions')}
          className="text-[12px] text-slate-mid hover:text-[#f5f3ee] transition-colors mb-3 print:hidden"
        >
          ← Back to institutions
        </button>

        <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-1">Analytics</p>
            <h1 className="font-display font-extrabold text-[24px] text-[#f5f3ee] tracking-tight">
              {detail?.name ?? 'Institution analytics'}
            </h1>
            {data?.cohort && (
              <p className="text-[12px] text-slate-mid mt-1">
                Cohort: <span className="text-[#f5f3ee]">{data.cohort.name}</span>
              </p>
            )}
          </div>

          {detail && detail.cohorts.length > 0 && (
            <div className="flex items-center gap-2 print:hidden">
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

        <div className="print:hidden">
          <AnalyticsTabs
            institutionId={institutionId}
            active="heatmap"
            available={['overview', 'engagement', 'heatmap']}
          />
        </div>

        {/* Toolbar — anonymise toggle + CSV + Print */}
        {data && data.students.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3 print:hidden">
            <label className="flex items-center gap-2 text-[12px] text-slate-mid cursor-pointer">
              <input
                type="checkbox"
                checked={showNames}
                onChange={(e) => patchParams({ names: e.target.checked ? '1' : null })}
                className="accent-green"
              />
              Show names &amp; emails
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.print()}
                className="text-[11px] font-semibold text-slate-mid hover:text-[#f5f3ee] transition-colors"
                title="Print or save as PDF"
              >
                ↗ Print / PDF
              </button>
              <button
                onClick={() =>
                  downloadCsv({
                    filename: filenameSlug(
                      data.institution.name,
                      data.cohort?.name ?? null,
                      'heatmap',
                    ),
                    headers: [
                      showNames ? 'name' : 'student',
                      ...(showNames ? ['email'] : []),
                      'completions',
                      'avg_score',
                      ...data.dimensions,
                    ],
                    rows: sortedStudents.map((s) => [
                      showNames ? (s.displayName ?? s.anonymousLabel) : s.anonymousLabel,
                      ...(showNames ? [s.email] : []),
                      Math.round(s.completedCount),
                      s.avgScore,
                      ...data.dimensions.map((d) => s.scoresByDimension[d]),
                    ]),
                  })
                }
                className="text-[11px] font-semibold text-slate-mid hover:text-[#f5f3ee] transition-colors"
              >
                ↓ CSV
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 mb-6">
            <p className="text-[13px] text-red-400">{error}</p>
          </div>
        )}

        {loading && !data ? (
          <p className="text-[13px] text-slate-mid">Loading…</p>
        ) : !data ? null : data.students.length === 0 ? (
          <p className="text-[13px] text-slate-mid">No students in scope yet.</p>
        ) : (
          <HeatmapTable
            data={data}
            students={sortedStudents}
            showNames={showNames}
            sort={sort}
            dir={dir}
            onSort={clickSort}
            onRowClick={(userId) =>
              navigate(`/admin/institutions/${institutionId}/students/${encodeURIComponent(userId)}`)
            }
          />
        )}

        {/* Legend — also visible in print */}
        {data && data.students.length > 0 && (
          <div className="mt-4 flex items-center gap-4 text-[11px] text-slate-mid">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: cellBg(85) }} />
              Strong (≥80)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: cellBg(70) }} />
              Proficient (60–79)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: cellBg(40) }} />
              Developing (&lt;60)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-white/5 border border-white/10" />
              No data
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Table ──────────────────────────────────────────────────────────────────

function HeatmapTable({
  data,
  students,
  showNames,
  sort,
  dir,
  onSort,
  onRowClick,
}: {
  data: HeatmapResponse
  students: HeatmapStudent[]
  showNames: boolean
  sort: SortKey
  dir: SortDir
  onSort: (key: SortKey) => void
  onRowClick: (userId: string) => void
}) {
  const arrow = (key: SortKey) => (sort === key ? (dir === 'asc' ? ' ↑' : ' ↓') : '')

  return (
    <div className="bg-[#111111] rounded-xl border border-white/10 overflow-x-auto print:overflow-visible print:border-0">
      <table className="w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
        <thead>
          <tr>
            <th
              className="sticky top-0 left-0 z-20 bg-[#111111] text-left px-3 py-2.5 text-[10px] uppercase tracking-widest text-slate-mid font-semibold cursor-pointer hover:text-[#f5f3ee] border-b border-r border-white/10"
              onClick={() => onSort('label')}
            >
              {showNames ? 'Student' : 'Anonymous ID'}
              {arrow('label')}
            </th>
            <th
              className="sticky top-0 z-10 bg-[#111111] text-right px-3 py-2.5 text-[10px] uppercase tracking-widest text-slate-mid font-semibold cursor-pointer hover:text-[#f5f3ee] border-b border-white/10"
              onClick={() => onSort('avg')}
            >
              Avg{arrow('avg')}
            </th>
            {data.dimensions.map((dim) => (
              <th
                key={dim}
                className="sticky top-0 z-10 bg-[#111111] text-center px-2 py-2.5 text-[10px] uppercase tracking-wider text-slate-mid font-semibold cursor-pointer hover:text-[#f5f3ee] border-b border-white/10 whitespace-nowrap"
                onClick={() => onSort(dim)}
                title={`Sort by ${dim}`}
              >
                {dim}
                {arrow(dim)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.userId} className="hover:bg-white/[0.02] transition-colors">
              <td
                className="sticky left-0 bg-[#111111] z-10 px-3 py-2 border-b border-r border-white/5 cursor-pointer"
                onClick={() => onRowClick(s.userId)}
                title="View student detail"
              >
                <p className="text-[#f5f3ee] font-semibold">
                  {showNames ? (s.displayName ?? s.anonymousLabel) : s.anonymousLabel}
                </p>
                <p className="text-[10px] text-slate-mid">
                  {showNames && s.email
                    ? s.email
                    : `${Math.round(s.completedCount)} completion${
                        Math.round(s.completedCount) === 1 ? '' : 's'
                      }`}
                </p>
              </td>
              <td
                className="px-3 py-2 text-right border-b border-white/5 font-bold"
                style={{ color: textColor(s.avgScore) }}
              >
                {s.avgScore ?? '—'}
              </td>
              {data.dimensions.map((dim) => {
                const v = s.scoresByDimension[dim]
                return (
                  <td
                    key={dim}
                    className="px-2 py-2 text-center border-b border-white/5 font-semibold"
                    style={{
                      backgroundColor: cellBg(v),
                      color: cellText(v),
                    }}
                  >
                    {v ?? ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Sort + colour helpers ──────────────────────────────────────────────────

function sortStudents(rows: HeatmapStudent[], key: SortKey, dir: SortDir): HeatmapStudent[] {
  const mult = dir === 'asc' ? 1 : -1
  const numericKeys = ['avg']
  return [...rows].sort((a, b) => {
    if (key === 'label') {
      return a.anonymousLabel.localeCompare(b.anonymousLabel) * mult
    }
    const aVal = key === 'avg' ? a.avgScore : a.scoresByDimension[key]
    const bVal = key === 'avg' ? b.avgScore : b.scoresByDimension[key]
    // Push nulls to the end regardless of direction so empty cells don't dominate the top.
    if (aVal == null && bVal == null) return 0
    if (aVal == null) return 1
    if (bVal == null) return -1
    return ((aVal as number) - (bVal as number)) * mult
  }) as HeatmapStudent[]
  void numericKeys
}

/**
 * Cell background colour. Same green / amber / red bands the rest of the
 * app uses for scores, but tuned to a paler tint so the numerals stay
 * readable in dark mode (and on print).
 */
function cellBg(score: number | null): string {
  if (score === null) return 'transparent'
  if (score >= 80) return 'rgba(45, 158, 95, 0.45)'
  if (score >= 60) return 'rgba(212, 131, 10, 0.40)'
  return 'rgba(192, 57, 43, 0.40)'
}

function cellText(score: number | null): string {
  if (score === null) return '#555'
  return '#f5f3ee'
}

function textColor(score: number | null): string {
  if (score === null) return '#888'
  if (score >= 80) return '#2d9e5f'
  if (score >= 60) return '#d4830a'
  return '#c0392b'
}
