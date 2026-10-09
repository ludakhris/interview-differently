import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { AnalyticsTabs } from '@/components/AnalyticsTabs'
import { getInstitution, type InstitutionDetail } from '@/services/institutionsService'
import {
  fetchAssessmentActivity,
  type AssessmentActivity,
  type AssessmentActivityStudent,
} from '@/services/analyticsService'

/**
 * Live progress monitor for assessments: for each assessment delivered to a cohort, every student
 * as not started / in progress (answered of total) / submitted. Progress only, never scores.
 * Lives at /admin/institutions/:id/assessment-activity?cohortId=...
 */
const AUTO_REFRESH_OPTIONS = [5, 10, 30, 60] // seconds
const AUTO_REFRESH_DEFAULT = 30

const STATUS_LABEL = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
} as const

export function AdminInstitutionAssessmentActivityPage() {
  const { institutionId = '' } = useParams<{ institutionId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { getToken } = useAuth()
  const cohortId = searchParams.get('cohortId') ?? ''

  const [detail, setDetail] = useState<InstitutionDetail | null>(null)
  const [data, setData] = useState<AssessmentActivity | null>(null)
  const [loading, setLoading] = useState(false)
  const [auto, setAuto] = useState(false)
  const [autoSec, setAutoSec] = useState(AUTO_REFRESH_DEFAULT)
  const inFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!institutionId) return
    getInstitution(getToken, institutionId)
      .then((d) => {
        setDetail(d)
        // No "all cohorts" view: progress is per class, so default to the first cohort.
        if (!d.cohorts.some((c) => c.id === searchParams.get('cohortId')) && d.cohorts.length > 0) {
          setSearchParams({ cohortId: d.cohorts[0].id }, { replace: true })
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load institution'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutionId, getToken])

  // `silent` (auto-refresh ticks) skips the button's loading state so it doesn't flicker.
  const refresh = useCallback(
    async (silent = false) => {
      if (!cohortId || !detail?.cohorts.some((c) => c.id === cohortId)) return
      if (!silent) setLoading(true)
      setError(null)
      inFlight.current = true
      try {
        setData(await fetchAssessmentActivity(getToken, institutionId, cohortId))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load activity')
      } finally {
        inFlight.current = false
        if (!silent) setLoading(false)
      }
    },
    [cohortId, detail, institutionId, getToken]
  )

  useEffect(() => {
    setData(null)
    void refresh()
  }, [refresh])

  // Skips ticks while the tab is hidden or the previous request is still running.
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
              {detail?.name ?? 'Assessment activity'}
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
                onChange={(e) => setSearchParams({ cohortId: e.target.value }, { replace: true })}
                className="bg-[#111111] border border-white/10 rounded-lg px-3 py-1.5 text-[13px] text-[#f5f3ee] focus:outline-none focus:border-white/30"
              >
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
          active="activity"
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
            onClick={() => void refresh()}
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
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 mb-6">
            <p className="text-[13px] text-red-400">{error}</p>
          </div>
        )}

        {detail && detail.cohorts.length === 0 && (
          <p className="text-[13px] text-slate-mid">This institution has no cohorts yet.</p>
        )}

        {data && (
          <>
            <p className="text-[12px] text-slate-mid mb-4">
              Updated {new Date(data.generatedAt).toLocaleTimeString()} · progress is answers saved
              out of questions drawn, not a score
            </p>
            <div className="space-y-6">
              {data.deliveries.map((d) => (
                <DeliveryPanel key={d.id} delivery={d} />
              ))}
              {data.deliveries.length === 0 && (
                <p className="text-[13px] text-slate-mid">
                  No assessment has been delivered to {data.cohort.name}.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function DeliveryPanel({ delivery: d }: { delivery: AssessmentActivity['deliveries'][number] }) {
  const total = d.students.length
  return (
    <section className="bg-[#111111] rounded-xl border border-white/10">
      <header className="px-5 py-4 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[#f5f3ee]">
            {d.assessmentTitle} <span className="font-normal text-slate-mid">· {d.label}</span>
          </h2>
          {(d.opensAt || d.closesAt || d.timeLimitMinutes) && (
            <p className="text-[12px] text-slate-mid mt-0.5">
              {d.opensAt && <>opens {new Date(d.opensAt).toLocaleString()}</>}
              {d.closesAt && <> · closes {new Date(d.closesAt).toLocaleString()}</>}
              {d.timeLimitMinutes && <> · {d.timeLimitMinutes} min limit</>}
            </p>
          )}
        </div>
        <p className="text-[12px] text-slate-mid whitespace-nowrap">
          <span className="text-green">{d.counts.submitted} submitted</span> ·{' '}
          <span className="text-amber-400">{d.counts.inProgress} in progress</span> ·{' '}
          {d.counts.notStarted} not started
        </p>
      </header>
      {total === 0 ? (
        <p className="px-5 pb-4 text-[12px] text-slate-mid">No students in this cohort.</p>
      ) : (
        <ul className="border-t border-white/10 divide-y divide-white/5">
          {d.students.map((s) => (
            <StudentRow key={s.userId} s={s} />
          ))}
        </ul>
      )}
    </section>
  )
}

function StudentRow({ s }: { s: AssessmentActivityStudent }) {
  const pct =
    s.status === 'submitted'
      ? 100
      : s.questionCount > 0
        ? Math.round((s.answeredCount / s.questionCount) * 100)
        : 0
  const color = s.status === 'submitted' ? 'bg-green' : 'bg-amber-400'
  return (
    <li className="px-5 py-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-4">
      <span className="text-[13px] text-[#f5f3ee] truncate">
        {s.name}
        {s.email && s.email !== s.name && (
          <span className="ml-2 text-[12px] text-slate-mid">{s.email}</span>
        )}
      </span>
      <div className="flex items-center gap-3">
        <div
          className="h-2 flex-1 rounded-full bg-white/10 overflow-hidden"
          role="progressbar"
          aria-label={`${s.name} progress`}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[12px] font-mono text-slate-light whitespace-nowrap w-24 text-right">
          {s.status === 'not_started'
            ? '—'
            : s.status === 'submitted'
              ? 'done'
              : `${s.answeredCount} of ${s.questionCount}`}
        </span>
      </div>
      <span className="text-[12px] text-slate-mid text-right">
        {STATUS_LABEL[s.status]}
        {s.status === 'in_progress' && s.lastActivityAt && (
          <> · saved {new Date(s.lastActivityAt).toLocaleTimeString()}</>
        )}
        {s.status === 'submitted' && s.submittedAt && (
          <> · {new Date(s.submittedAt).toLocaleString()}</>
        )}
      </span>
    </li>
  )
}
