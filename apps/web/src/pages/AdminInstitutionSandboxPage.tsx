import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { AnalyticsTabs } from '@/components/AnalyticsTabs'
import { getInstitution, type InstitutionDetail } from '@/services/institutionsService'
import {
  fetchSandboxActivity,
  listCohortTools,
  type SandboxActivity,
} from '@/services/toolsService'

/**
 * Live monitor for the SQL sandbox: every student in a cohort with the
 * queries they've run (raw text, newest first). Manual refresh — no polling.
 * Lives at /admin/institutions/:id/sandbox?cohortId=...
 */
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

  const refresh = useCallback(async () => {
    if (!cohortId || !cohorts?.some((c) => c.id === cohortId)) return
    setLoading(true)
    setError(null)
    try {
      setData(await fetchSandboxActivity(getToken, cohortId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity')
    } finally {
      setLoading(false)
    }
  }, [cohortId, cohorts, getToken])

  useEffect(() => {
    setData(null)
    refresh()
  }, [refresh])

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
            <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-1">
              Analytics
            </p>
            <h1 className="font-display font-extrabold text-[24px] text-[#f5f3ee] tracking-tight">
              {detail?.name ?? 'SQL activity'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {cohorts && cohorts.length > 0 && (
              <select
                aria-label="Cohort"
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
            )}
            <button
              onClick={refresh}
              disabled={loading || !cohortId}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[13px] font-semibold text-[#f5f3ee] disabled:opacity-40 transition-colors"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <AnalyticsTabs
          institutionId={institutionId}
          active="sandbox"
          available={['overview', 'engagement', 'heatmap', 'assessments', 'students', 'sandbox']}
        />

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
                <details
                  key={s.userId}
                  open={s.queryCount > 0}
                  className="bg-[#111111] rounded-xl border border-white/10"
                >
                  <summary className="cursor-pointer px-5 py-3 flex items-center justify-between gap-4">
                    <span className="text-[14px] font-semibold text-[#f5f3ee]">
                      {s.name}
                      {s.email && s.email !== s.name && (
                        <span className="ml-2 text-[12px] font-normal text-slate-mid">
                          {s.email}
                        </span>
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
                      {s.queries.map((q) => (
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
                            <p className="mt-1 text-[12px] text-red-400 font-mono">
                              {q.errorMessage}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              ))}
              {data.students.length === 0 && (
                <p className="text-[13px] text-slate-mid">No students in this cohort.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
