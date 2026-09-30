/**
 * Frontend client for GET /api/admin/usage (#42) — full admins only.
 * Types mirror apps/api/src/usage/usage.aggregate.ts.
 */
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export type GetToken = () => Promise<string | null>
export type UsageRange = '7d' | '30d' | '90d' | 'all'

export interface UsageScenario {
  scenarioId: string
  title: string
  track: string | null
  mode: string | null
  status: string
  starts: number
  prevStarts: number | null
  uniqueUsers: number
  completions: number
  completionRate: number | null
  avgScore: number | null
  lastUsedAt: string | null
}

export interface UsageAssessment {
  assessmentId: string
  title: string
  deliveries: number
  started: number
  prevStarted: number | null
  submitted: number
  completionRate: number | null
  avgScorePercent: number | null
  lateRate: number | null
  uniqueUsers: number
  lastActivityAt: string | null
}

export interface UsageTool {
  key: 'sql-sandbox' | 'assessments'
  label: string
  enabledCohorts: number
  cohortsWithUse: number
  activeUsers: number
  events: number
  errorRate: number | null
  cohorts: {
    cohortId: string
    cohort: string
    institution: string
    members: number
    activeUsers: number
    events: number
  }[]
  datasets: { slug: string; events: number; users: number }[]
}

export interface UsageUser {
  userId: string
  name: string
  email: string | null
  total: number
  scenario: number
  assessment: number
  sql: number
  activeDays: number
  firstSeenAt: string
  lastActiveAt: string
  topScenarios: { label: string; count: number }[]
  topAssessments: { label: string; count: number }[]
  topDatasets: { label: string; count: number }[]
}

export interface UsageReport {
  range: UsageRange
  generatedAt: string
  overview: {
    activeUsers: { d7: number; d30: number; d90: number; all: number }
    rangeActiveUsers: number
    newUsers: number
    returningUsers: number
    totalEvents: number
    eventsBySource: { scenario: number; immersive: number; assessment: number; sql: number }
    perDay: { date: string; activeUsers: number; events: number }[]
    /** [weekday 0=Sun..6][hour 0..23] in the admin's local time. */
    heatmap: number[][]
  }
  scenarios: UsageScenario[]
  tools: UsageTool[]
  assessments: UsageAssessment[]
  users: UsageUser[]
}

export async function fetchUsage(
  getToken: GetToken,
  opts: { range: UsageRange; includeAdmins: boolean }
): Promise<UsageReport> {
  const token = await getToken()
  if (!token) throw new Error('Not signed in')
  const qs = new URLSearchParams({
    range: opts.range,
    includeAdmins: String(opts.includeAdmins),
    // Lets the server bucket the heatmap/daily series in the admin's local time.
    tz: String(new Date().getTimezoneOffset()),
  })
  const res = await fetch(`${API_URL}/api/admin/usage?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { message?: string | string[] }
      if (body.message)
        message = Array.isArray(body.message) ? body.message.join(', ') : body.message
    } catch {
      // not json — keep status text
    }
    throw new Error(message)
  }
  return res.json() as Promise<UsageReport>
}
