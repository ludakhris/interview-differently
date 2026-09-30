import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { downloadCsv } from '@/lib/csv'
import {
  fetchUsage,
  type UsageAssessment,
  type UsageRange,
  type UsageReport,
  type UsageScenario,
  type UsageTool,
  type UsageUser,
} from '@/services/usageService'

/**
 * Platform-wide usage dashboard (#42, Phase 1) — full admins only.
 * Everything is derived from recorded activity, so "active" means "did
 * something" (started a scenario, ran a query, began an assessment).
 */

type Tab = 'overview' | 'scenarios' | 'tools' | 'assessments' | 'users'
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'scenarios', label: 'Scenarios' },
  { key: 'tools', label: 'Tools' },
  { key: 'assessments', label: 'Assessments' },
  { key: 'users', label: 'Users' },
]
const RANGES: { value: UsageRange; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function AdminUsagePage() {
  const { getToken } = useAuth()
  const [tab, setTab] = useState<Tab>('overview')
  const [range, setRange] = useState<UsageRange>('30d')
  const [includeAdmins, setIncludeAdmins] = useState(false)
  const [data, setData] = useState<UsageReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchUsage(getToken, { range, includeAdmins }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load usage')
    } finally {
      setLoading(false)
    }
  }, [getToken, range, includeAdmins])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav />
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-1">
              Platform
            </p>
            <h1 className="font-display font-extrabold text-[24px] text-[#f5f3ee] tracking-tight">
              Usage
            </h1>
          </div>
          <div className="flex items-center flex-wrap gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-[12px] text-slate-mid">
              Range:
              <select
                value={range}
                onChange={(e) => setRange(e.target.value as UsageRange)}
                className="bg-[#111111] border border-white/10 rounded-lg px-3 py-1.5 text-[13px] text-[#f5f3ee] focus:outline-none focus:border-white/30"
              >
                {RANGES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[12px] text-slate-mid cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeAdmins}
                onChange={(e) => setIncludeAdmins(e.target.checked)}
                className="accent-[#2d9e5f]"
              />
              Include admin accounts
            </label>
            <button
              onClick={() => void refresh()}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[13px] font-semibold text-[#f5f3ee] disabled:opacity-40 transition-colors"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="border-b border-white/10 mb-6">
          <nav className="flex items-center gap-1" aria-label="Usage sections">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-current={tab === t.key ? 'page' : undefined}
                className={`px-4 py-2.5 text-[13px] font-semibold transition-colors border-b-2 -mb-px ${
                  tab === t.key
                    ? 'text-[#f5f3ee] border-green'
                    : 'text-slate-mid hover:text-[#f5f3ee] border-transparent'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 mb-6">
            <p className="text-[13px] text-red-400">{error}</p>
          </div>
        )}

        {loading && !data ? (
          <p className="text-[13px] text-slate-mid">Loading…</p>
        ) : data ? (
          <>
            <p className="text-[12px] text-slate-mid mb-4">
              Updated {new Date(data.generatedAt).toLocaleTimeString()} ·{' '}
              {includeAdmins ? 'including' : 'excluding'} admin accounts · "active" = did something
              recorded (browse-only visits aren't tracked yet)
            </p>
            {tab === 'overview' && <Overview data={data} />}
            {tab === 'scenarios' && <Scenarios rows={data.scenarios} range={data.range} />}
            {tab === 'tools' && (
              <div className="space-y-6">
                {data.tools.map((t) => (
                  <ToolCard key={t.key} tool={t} />
                ))}
              </div>
            )}
            {tab === 'assessments' && <Assessments rows={data.assessments} range={data.range} />}
            {tab === 'users' && <Users rows={data.users} />}
          </>
        ) : null}
      </div>
    </div>
  )
}

// ── Shared bits ────────────────────────────────────────────────────────────

const card = 'bg-[#111111] rounded-xl border border-white/10'
const th = 'text-left text-[11px] font-bold uppercase tracking-widest text-slate-mid px-4 py-2.5'
const td = 'px-4 py-2.5 text-[13px] text-[#f5f3ee] align-top'

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className={`${card} px-5 py-4`}>
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">{label}</p>
      <p className="font-display font-extrabold text-[28px] text-[#f5f3ee] leading-tight mt-1">
        {value}
      </p>
      {sub && <p className="text-[12px] text-slate-mid mt-0.5">{sub}</p>}
    </div>
  )
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={`${card} p-6`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

function CsvButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[12px] font-semibold text-slate-mid hover:text-[#f5f3ee] transition-colors"
    >
      Export CSV
    </button>
  )
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—')

/** "67% (2/3)" — a rate is meaningless without its sample size. */
const rate = (pct: number | null, num: number, den: number) =>
  pct == null ? '—' : `${pct}% (${num}/${den})`

function Trend({ now, prev }: { now: number; prev: number | null }) {
  if (prev == null) return null
  const diff = now - prev
  if (diff === 0) return <span className="ml-1.5 text-[11px] text-slate-mid">–</span>
  return (
    <span
      className={`ml-1.5 text-[11px] whitespace-nowrap ${diff > 0 ? 'text-green' : 'text-red-400'}`}
    >
      {diff > 0 ? '▲' : '▼'} {Math.abs(diff)}
    </span>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-slate-mid">{children}</p>
}

// ── Overview ───────────────────────────────────────────────────────────────

function Overview({ data }: { data: UsageReport }) {
  const o = data.overview
  const maxDay = Math.max(1, ...o.perDay.map((d) => d.activeUsers))
  const maxCell = Math.max(1, ...o.heatmap.flat())
  const src = o.eventsBySource
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Active · 7 days" value={o.activeUsers.d7} />
        <Stat label="Active · 30 days" value={o.activeUsers.d30} />
        <Stat label="Active · 90 days" value={o.activeUsers.d90} />
        <Stat label="Ever active" value={o.activeUsers.all} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Active in range" value={o.rangeActiveUsers} />
        <Stat label="New in range" value={o.newUsers} sub="first activity ever" />
        <Stat label="Returning" value={o.returningUsers} sub="active before the range too" />
        <Stat label="Actions in range" value={o.totalEvents.toLocaleString()} />
      </div>

      <Section title="Active users per day">
        {o.totalEvents === 0 ? (
          <Empty>No activity in this range.</Empty>
        ) : (
          <>
            <div className="flex items-end gap-[2px] h-32">
              {o.perDay.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.activeUsers} active, ${d.events} actions`}
                  className="flex-1 bg-green/70 hover:bg-green rounded-t-sm min-h-[2px]"
                  style={{
                    height: `${(d.activeUsers / maxDay) * 100}%`,
                    opacity: d.activeUsers ? 1 : 0.15,
                  }}
                />
              ))}
            </div>
            <div className="flex justify-between text-[11px] text-slate-mid mt-1.5">
              <span>{o.perDay[0]?.date}</span>
              <span>peak {maxDay} users/day</span>
              <span>{o.perDay[o.perDay.length - 1]?.date}</span>
            </div>
          </>
        )}
      </Section>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Section title="When people use it (your local time)">
            <div className="overflow-x-auto">
              <div className="min-w-[520px]">
                <div className="grid grid-cols-[32px_repeat(24,1fr)] gap-[2px] text-[10px] text-slate-mid mb-1">
                  <span />
                  {Array.from({ length: 24 }, (_, h) => (
                    <span key={h} className="text-center">
                      {h % 3 === 0 ? h : ''}
                    </span>
                  ))}
                </div>
                {o.heatmap.map((row, dow) => (
                  <div
                    key={dow}
                    className="grid grid-cols-[32px_repeat(24,1fr)] gap-[2px] mb-[2px]"
                  >
                    <span className="text-[10px] text-slate-mid leading-4">{DAYS[dow]}</span>
                    {row.map((n, h) => (
                      <div
                        key={h}
                        title={`${DAYS[dow]} ${h}:00 — ${n} actions`}
                        className="h-4 rounded-[2px] bg-green"
                        style={{ opacity: n ? 0.15 + 0.85 * (n / maxCell) : 0.05 }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </Section>
        </div>
        <Section title="Actions by kind">
          <ul className="space-y-2 text-[13px]">
            {(
              [
                ['Scenarios started', src.scenario],
                ['Immersive sessions', src.immersive],
                ['Assessments started', src.assessment],
                ['SQL queries run', src.sql],
              ] as [string, number][]
            ).map(([label, n]) => (
              <li key={label} className="flex justify-between text-[#f5f3ee]">
                <span className="text-slate-mid">{label}</span>
                <span className="font-semibold">{n.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  )
}

// ── Scenarios ──────────────────────────────────────────────────────────────

function Scenarios({ rows, range }: { rows: UsageScenario[]; range: UsageRange }) {
  const [filter, setFilter] = useState<'all' | 'cold'>('all')
  // "Cold" = live scenarios nobody started in the range. Drafts aren't expected to have traffic.
  const shown =
    filter === 'cold' ? rows.filter((r) => r.starts === 0 && r.status === 'published') : rows
  const max = Math.max(1, ...rows.map((r) => r.starts))
  return (
    <Section
      title={`Scenarios (${shown.length})`}
      action={
        <div className="flex items-center gap-4">
          <div className="flex gap-1">
            {(['all', 'cold'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-lg text-[12px] font-semibold transition-colors ${
                  filter === f
                    ? 'bg-white/15 text-[#f5f3ee]'
                    : 'text-slate-mid hover:text-[#f5f3ee]'
                }`}
              >
                {f === 'all' ? 'All' : 'Not used'}
              </button>
            ))}
          </div>
          <CsvButton
            onClick={() =>
              downloadCsv({
                filename: `usage-scenarios-${range}`,
                headers: [
                  'scenario',
                  'track',
                  'status',
                  'starts',
                  'prev_starts',
                  'unique_users',
                  'completions',
                  'completion_rate_pct',
                  'avg_score',
                  'last_used',
                ],
                rows: rows.map((r) => [
                  r.title,
                  r.track,
                  r.status,
                  r.starts,
                  r.prevStarts,
                  r.uniqueUsers,
                  r.completions,
                  r.completionRate,
                  r.avgScore,
                  r.lastUsedAt,
                ]),
              })
            }
          />
        </div>
      }
    >
      {shown.length === 0 ? (
        <Empty>
          {filter === 'cold' ? 'Every published scenario was used in this range.' : 'No scenarios.'}
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className={th}>Scenario</th>
                <th className={th}>
                  Starts
                  {range !== 'all' && <span className="normal-case font-normal"> vs prev</span>}
                </th>
                <th className={th}>Users</th>
                <th className={th}>Completed</th>
                <th className={th}>Avg score</th>
                <th className={th}>Last used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {shown.map((r) => (
                <tr key={r.scenarioId}>
                  <td className={td}>
                    <p className="font-semibold">{r.title}</p>
                    <p className="text-[11px] text-slate-mid">
                      {[r.track, r.mode, r.status !== 'published' ? r.status : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </td>
                  <td className={td}>
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <div
                        className="h-1.5 rounded-full bg-green/80"
                        style={{ width: `${Math.max(2, (r.starts / max) * 80)}px` }}
                      />
                      <span>{r.starts}</span>
                      <Trend now={r.starts} prev={r.prevStarts} />
                    </div>
                  </td>
                  <td className={td}>{r.uniqueUsers}</td>
                  <td className={td}>{rate(r.completionRate, r.completions, r.starts)}</td>
                  <td className={td}>{r.avgScore ?? '—'}</td>
                  <td className={td}>{when(r.lastUsedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

// ── Tools ──────────────────────────────────────────────────────────────────

function ToolCard({ tool }: { tool: UsageTool }) {
  const unused = tool.cohorts.filter((c) => c.events === 0).length
  return (
    <Section title={tool.label}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Active users" value={tool.activeUsers} />
        <Stat
          label={tool.key === 'sql-sandbox' ? 'Queries run' : 'Attempts started'}
          value={tool.events.toLocaleString()}
        />
        <Stat
          label="Cohorts using it"
          value={`${tool.cohortsWithUse} / ${tool.enabledCohorts}`}
          sub={unused ? `${unused} enabled but unused` : undefined}
        />
        {tool.errorRate != null && <Stat label="Query error rate" value={`${tool.errorRate}%`} />}
      </div>

      {tool.cohorts.length === 0 ? (
        <Empty>No cohort has this tool enabled.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className={th}>Cohort</th>
                <th className={th}>Members</th>
                <th className={th}>Active users</th>
                <th className={th}>{tool.key === 'sql-sandbox' ? 'Queries' : 'Attempts'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tool.cohorts.map((c) => (
                <tr key={c.cohortId}>
                  <td className={td}>
                    <p className="font-semibold">{c.cohort}</p>
                    <p className="text-[11px] text-slate-mid">{c.institution}</p>
                  </td>
                  <td className={td}>{c.members}</td>
                  <td className={td}>
                    {c.activeUsers} / {c.members}
                  </td>
                  <td className={td}>
                    {c.events === 0 ? (
                      <span className="text-amber-400">unused</span>
                    ) : (
                      c.events.toLocaleString()
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tool.datasets.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid mb-2">
            By dataset
          </p>
          <ul className="text-[13px] space-y-1">
            {tool.datasets.map((d) => (
              <li key={d.slug} className="flex justify-between text-[#f5f3ee]">
                <span>{d.slug}</span>
                <span className="text-slate-mid">
                  {d.events.toLocaleString()} queries · {d.users} {d.users === 1 ? 'user' : 'users'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  )
}

// ── Assessments ────────────────────────────────────────────────────────────

function Assessments({ rows, range }: { rows: UsageAssessment[]; range: UsageRange }) {
  const max = Math.max(1, ...rows.map((r) => r.started))
  return (
    <Section
      title={`Assessments (${rows.length})`}
      action={
        <CsvButton
          onClick={() =>
            downloadCsv({
              filename: `usage-assessments-${range}`,
              headers: [
                'assessment',
                'deliveries',
                'started',
                'prev_started',
                'submitted',
                'completion_rate_pct',
                'avg_score_pct',
                'late_rate_pct',
                'unique_users',
                'last_activity',
              ],
              rows: rows.map((r) => [
                r.title,
                r.deliveries,
                r.started,
                r.prevStarted,
                r.submitted,
                r.completionRate,
                r.avgScorePercent,
                r.lateRate,
                r.uniqueUsers,
                r.lastActivityAt,
              ]),
            })
          }
        />
      }
    >
      {rows.length === 0 ? (
        <Empty>No assessments yet.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className={th}>Assessment</th>
                <th className={th}>Deliveries</th>
                <th className={th}>
                  Started
                  {range !== 'all' && <span className="normal-case font-normal"> vs prev</span>}
                </th>
                <th className={th}>Users</th>
                <th className={th}>Submitted</th>
                <th className={th}>Avg score</th>
                <th className={th}>Late</th>
                <th className={th}>Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.assessmentId}>
                  <td className={`${td} font-semibold`}>{r.title}</td>
                  <td className={td}>{r.deliveries}</td>
                  <td className={td}>
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <div
                        className="h-1.5 rounded-full bg-green/80"
                        style={{ width: `${Math.max(2, (r.started / max) * 70)}px` }}
                      />
                      <span>{r.started}</span>
                      <Trend now={r.started} prev={r.prevStarted} />
                    </div>
                  </td>
                  <td className={td}>{r.uniqueUsers}</td>
                  <td className={td}>{rate(r.completionRate, r.submitted, r.started)}</td>
                  <td className={td}>
                    {r.avgScorePercent == null ? '—' : `${r.avgScorePercent}%`}
                  </td>
                  <td className={td}>{r.lateRate == null ? '—' : `${r.lateRate}%`}</td>
                  <td className={td}>{when(r.lastActivityAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

// ── Users ──────────────────────────────────────────────────────────────────

function Users({ rows }: { rows: UsageUser[] }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <Section
      title={`Most active users (top ${rows.length})`}
      action={
        <CsvButton
          onClick={() =>
            downloadCsv({
              filename: 'usage-users',
              headers: [
                'name',
                'email',
                'total_actions',
                'scenarios',
                'assessments',
                'sql_queries',
                'active_days',
                'first_seen',
                'last_active',
              ],
              rows: rows.map((u) => [
                u.name,
                u.email,
                u.total,
                u.scenario,
                u.assessment,
                u.sql,
                u.activeDays,
                u.firstSeenAt,
                u.lastActiveAt,
              ]),
            })
          }
        />
      }
    >
      {rows.length === 0 ? (
        <Empty>No user activity in this range.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className={th}>User</th>
                <th className={th}>Actions</th>
                <th className={th}>Scenarios</th>
                <th className={th}>Assessments</th>
                <th className={th}>SQL</th>
                <th className={th}>Active days</th>
                <th className={th}>Last active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((u) => (
                <UserRow
                  key={u.userId}
                  u={u}
                  open={open === u.userId}
                  onToggle={() => setOpen(open === u.userId ? null : u.userId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

function UserRow({ u, open, onToggle }: { u: UsageUser; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-white/[0.03]">
        <td className={td}>
          <p className="font-semibold">
            <span className="text-slate-mid mr-1.5">{open ? '▾' : '▸'}</span>
            {u.name}
          </p>
          {u.email && u.email !== u.name && (
            <p className="text-[11px] text-slate-mid ml-4">{u.email}</p>
          )}
        </td>
        <td className={`${td} font-semibold`}>{u.total}</td>
        <td className={td}>{u.scenario}</td>
        <td className={td}>{u.assessment}</td>
        <td className={td}>{u.sql}</td>
        <td className={td}>{u.activeDays}</td>
        <td className={td}>{when(u.lastActiveAt)}</td>
      </tr>
      {open && (
        <tr className="bg-white/[0.02]">
          <td colSpan={7} className="px-4 pb-4 pt-1">
            <p className="text-[12px] text-slate-mid mb-2 ml-4">First seen {when(u.firstSeenAt)}</p>
            <div className="grid md:grid-cols-3 gap-4 ml-4">
              <TopList title="Scenarios" items={u.topScenarios} />
              <TopList title="Assessments" items={u.topAssessments} />
              <TopList title="SQL datasets" items={u.topDatasets} />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function TopList({ title, items }: { title: string; items: { label: string; count: number }[] }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid mb-1">{title}</p>
      {items.length === 0 ? (
        <p className="text-[12px] text-slate-mid">—</p>
      ) : (
        <ul className="text-[12px] text-[#f5f3ee] space-y-0.5">
          {items.map((i) => (
            <li key={i.label} className="flex justify-between gap-3">
              <span className="truncate">{i.label}</span>
              <span className="text-slate-mid">{i.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
