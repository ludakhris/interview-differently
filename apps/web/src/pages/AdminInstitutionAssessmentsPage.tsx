import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { AnalyticsTabs } from '@/components/AnalyticsTabs'
import { fetchPrePost, type PrePostPair, type PrePostResponse } from '@/services/assessmentsService'
import { getInstitution, type InstitutionDetail } from '@/services/institutionsService'
import { downloadCsv, filenameSlug } from '@/lib/csv'

/**
 * Pre ↔ post assessment analytics (#25 Phase 3). One card per
 * (assessment, cohort) pair: section-level averages for each side and the
 * paired delta, then a per-student table. Anonymous by default like the
 * heatmap; ?names=1 reveals names and emails.
 */

export function AdminInstitutionAssessmentsPage() {
  const { institutionId = '' } = useParams<{ institutionId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { getToken } = useAuth()
  const cohortId = searchParams.get('cohortId') ?? ''
  const showNames = searchParams.get('names') === '1'

  const [detail, setDetail] = useState<InstitutionDetail | null>(null)
  const [data, setData] = useState<PrePostResponse | null>(null)
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
      setData(await fetchPrePost(getToken, institutionId, cohortId || undefined))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assessments')
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

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav />
      <div className="max-w-6xl mx-auto px-6 py-12">
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

        <AnalyticsTabs institutionId={institutionId} active="assessments" available={['overview', 'engagement', 'heatmap', 'assessments', 'students']} />

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 mb-4">
            <p className="text-[13px] text-red-400">{error}</p>
          </div>
        )}

        {loading ? (
          <p className="text-[13px] text-slate-mid">Loading…</p>
        ) : !data || data.pairs.length === 0 ? (
          <div className="bg-[#111111] rounded-xl border border-white/10 px-6 py-12 text-center">
            <p className="text-[13px] text-slate-mid">
              No assessment deliveries for {data?.cohort ? 'this cohort' : 'this institution'} yet. Schedule one under Tools ▾ → Assessments.
            </p>
          </div>
        ) : (
          <>
            <label className="flex items-center gap-2 text-[12px] text-slate-mid cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={showNames}
                onChange={(e) => patchParams({ names: e.target.checked ? '1' : null })}
                className="accent-green"
              />
              Show names &amp; emails
            </label>
            <div className="space-y-6">
              {data.pairs.map((pair) => (
                <PairCard key={`${pair.assessmentId}:${pair.cohort.id}`} pair={pair} showNames={showNames} institutionName={data.institution.name} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Pair card ──────────────────────────────────────────────────────────────

function PairCard({ pair, showNames, institutionName }: { pair: PrePostPair; showNames: boolean; institutionName: string }) {
  const keys = [{ id: 'overall', title: 'Overall' }, ...pair.sections]
  const label = (s: PrePostPair['students'][number]) => (showNames ? (s.displayName ?? s.email ?? s.anonymousLabel) : s.anonymousLabel)

  const exportCsv = () =>
    downloadCsv({
      filename: filenameSlug(institutionName, pair.cohort.name, pair.assessmentTitle, 'pre-post'),
      headers: [
        showNames ? 'name' : 'student',
        ...(showNames ? ['email'] : []),
        ...keys.flatMap((k) => [`${k.title} pre`, `${k.title} post`, `${k.title} improvement`]),
      ],
      rows: pair.students.map((s) => [
        label(s),
        ...(showNames ? [s.email] : []),
        ...keys.flatMap((k) => {
          const p = s.pre?.[k.id] ?? null
          const q = s.post?.[k.id] ?? null
          return [p, q, p != null && q != null ? q - p : null]
        }),
      ]),
    })

  return (
    <section className="bg-[#111111] rounded-2xl border border-white/10 overflow-hidden">
      <div className="h-1.5 w-full bg-[#2d9e5f]" />
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#2d9e5f]">{pair.cohort.name}</p>
            <h2 className="font-display font-bold text-[18px] text-[#f5f3ee] mt-0.5">{pair.assessmentTitle}</h2>
            <p className="text-[12px] text-slate-mid mt-1">
              {pair.pre ? `${pair.pre.submittedCount} pre` : 'no pre delivery'} · {pair.post ? `${pair.post.submittedCount} post` : 'no post delivery'} ·{' '}
              {pair.averages.pairedCount} completed both
            </p>
          </div>
          <div className="flex items-center gap-6">
            <Stat label="Pre" value={pair.averages.pre.overall} tone="text-[#d4830a]" />
            <Stat label="Post" value={pair.averages.post.overall} tone="text-[#2d9e5f]" />
            <Stat label="% Improvement" value={pair.averages.delta.overall} delta />
          </div>
        </div>

        <p className="text-[11px] text-white/40 mb-4">
          % Improvement = post score − pre score, in percentage points, averaged over the {pair.averages.pairedCount} student
          {pair.averages.pairedCount === 1 ? '' : 's'} who completed both.
          <span className="ml-3 inline-flex items-center gap-1.5"><span className="inline-block w-3 h-1.5 rounded-full bg-[#d4830a]" /> pre</span>
          <span className="ml-2 inline-flex items-center gap-1.5"><span className="inline-block w-3 h-1.5 rounded-full bg-[#2d9e5f]" /> post</span>
        </p>

        {/* Section averages */}
        <div className="overflow-x-auto mb-6">
          <table className="min-w-full text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-slate-mid">
                <th className="text-left py-2 pr-4 font-bold">Section</th>
                <th className="text-right py-2 px-3 font-bold">Pre</th>
                <th className="text-right py-2 px-3 font-bold">Post</th>
                <th className="text-right py-2 pl-3 font-bold">% Improvement</th>
                <th className="w-1/3 py-2 pl-4" />
              </tr>
            </thead>
            <tbody>
              {pair.sections.map((s) => {
                const p = pair.averages.pre[s.id]
                const q = pair.averages.post[s.id]
                const d = pair.averages.delta[s.id]
                return (
                  <tr key={s.id} className="border-t border-white/5">
                    <td className="py-2 pr-4 text-[#f5f3ee]">{s.title}</td>
                    <td className="text-right py-2 px-3 font-mono text-[#d4830a]">{pct(p)}</td>
                    <td className="text-right py-2 px-3 font-mono text-[#2d9e5f]">{pct(q)}</td>
                    <td className={`text-right py-2 pl-3 font-mono font-semibold ${deltaCls(d)}`}>{signed(d)}</td>
                    <td className="py-2 pl-4">
                      <Bars pre={p} post={q} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Students */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">Students</p>
          <button onClick={exportCsv} className="text-[11px] font-semibold text-slate-mid hover:text-[#f5f3ee] transition-colors">
            ↓ CSV
          </button>
        </div>
        {pair.students.length === 0 ? (
          <p className="text-[13px] text-slate-mid">No submitted attempts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-[12px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-slate-mid">
                  <th className="text-left py-2 pr-4 font-bold">Student</th>
                  {keys.map((k) => (
                    <th key={k.id} className="text-right py-2 px-2 font-bold whitespace-nowrap" title={k.title}>
                      {k.title.length > 14 ? `${k.title.slice(0, 13)}…` : k.title}
                    </th>
                  ))}
                  <th className="text-right py-2 pl-3 font-bold">% Improvement</th>
                </tr>
              </thead>
              <tbody>
                {pair.students.map((s) => (
                  <tr key={s.userId} className="border-t border-white/5">
                    <td className="py-2 pr-4">
                      <p className="text-[#f5f3ee]">{label(s)}</p>
                      {showNames && s.displayName && s.email && <p className="text-[11px] text-white/40">{s.email}</p>}
                    </td>
                    {keys.map((k) => (
                      <td key={k.id} className="text-right py-2 px-2 font-mono whitespace-nowrap">
                        <span className={s.pre?.[k.id] == null ? 'text-white/25' : 'text-[#d4830a]'}>{pct(s.pre?.[k.id] ?? null)}</span>
                        <span className="text-white/25"> → </span>
                        <span className={s.post?.[k.id] == null ? 'text-white/25' : 'text-[#2d9e5f]'}>{pct(s.post?.[k.id] ?? null)}</span>
                      </td>
                    ))}
                    <td className={`text-right py-2 pl-3 font-mono font-semibold ${deltaCls(s.delta)}`}>{signed(s.delta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function Stat({ label, value, delta, tone }: { label: string; value: number | null; delta?: boolean; tone?: string }) {
  return (
    <div className="text-right">
      <p className="text-[10px] uppercase tracking-widest text-white/40">{label}</p>
      <p className={`font-display font-extrabold text-[22px] leading-none mt-0.5 ${delta ? deltaCls(value) : (tone ?? 'text-[#f5f3ee]')}`}>
        {delta ? (value == null ? '—' : `${value > 0 ? '+' : ''}${value}%`) : pct(value)}
      </p>
    </div>
  )
}

function Bars({ pre, post }: { pre: number | null; post: number | null }) {
  return (
    <div className="space-y-1">
      <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
        <div className="h-full bg-[#d4830a]" style={{ width: `${pre ?? 0}%` }} />
      </div>
      <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
        <div className="h-full bg-[#2d9e5f]" style={{ width: `${post ?? 0}%` }} />
      </div>
    </div>
  )
}

function pct(v: number | null | undefined): string {
  return v == null ? '—' : `${v}%`
}

function signed(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v > 0 ? '+' : ''}${v}`
}

function deltaCls(v: number | null | undefined): string {
  if (v == null) return 'text-white/30'
  if (v > 0) return 'text-emerald-400'
  if (v < 0) return 'text-red-400'
  return 'text-slate-light'
}
