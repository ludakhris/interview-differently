/**
 * Pure aggregation for the admin usage dashboard (#42, Phase 1). No Prisma in
 * here: the service loads rows, this turns them into the response, and the
 * unit tests feed it fixtures.
 *
 * Everything is derived from activity we already record, so "active" means
 * "did something recorded" (started a scenario, ran a query, began an
 * assessment) — browse-only visits are invisible until Phase 2.
 *
 * All rows are loaded and filtered in memory. Fine at pilot scale; push the
 * range filter into SQL before the tables get large.
 */

export type UsageRange = '7d' | '30d' | '90d' | 'all'
export const USAGE_RANGES: UsageRange[] = ['7d', '30d', '90d', 'all']
export type UsageSource = 'scenario' | 'immersive' | 'assessment' | 'sql'

const DAY_MS = 86_400_000

export interface UsageInput {
  now: Date
  range: UsageRange
  /** Browser `Date.getTimezoneOffset()` (UTC − local, minutes) so buckets are in the admin's local time. */
  tzOffsetMinutes: number
  /** Users left out of every number (admin / test accounts). */
  excludedUserIds: Set<string>
  users: { id: string; email: string | null; displayName: string | null }[]
  scenarios: {
    scenarioId: string
    status: string
    title: string | null
    track: string | null
    mode: string | null
  }[]
  simAttempts: { userId: string; scenarioId: string; startedAt: Date }[]
  simResults: {
    userId: string
    scenarioId: string
    scenarioTitle: string
    completedAt: Date
    overallScore: number
  }[]
  immersive: { userId: string; scenarioId: string; status: string; createdAt: Date }[]
  assessments: { id: string; title: string; deliveryIds: string[] }[]
  assessmentAttempts: {
    userId: string
    deliveryId: string
    startedAt: Date
    submittedAt: Date | null
    submittedLate: boolean
    /** Percent (0-100) once submitted, else null. */
    scorePercent: number | null
  }[]
  sqlLogs: { userId: string; datasetSlug: string; ok: boolean; createdAt: Date }[]
  cohorts: {
    id: string
    name: string
    institutionName: string
    memberIds: string[]
    toolsEnabled: { 'sql-sandbox': boolean; assessments: boolean }
  }[]
}

interface Ev {
  userId: string
  at: Date
  src: UsageSource
  /** scenarioId | assessmentId | datasetSlug */
  key: string
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d
const avg = (xs: number[]) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)
const pct = (num: number, den: number) =>
  den > 0 ? Math.min(100, Math.round((num / den) * 100)) : null
const maxDate = (ds: Date[]) =>
  ds.length ? new Date(Math.max(...ds.map((d) => d.getTime()))) : null

export function buildUsage(input: UsageInput) {
  const { now, range, excludedUserIds } = input
  const rangeMs = range === 'all' ? null : { '7d': 7, '30d': 30, '90d': 90 }[range] * DAY_MS
  const rangeStart = rangeMs ? new Date(now.getTime() - rangeMs) : null
  const prevStart = rangeMs && rangeStart ? new Date(rangeStart.getTime() - rangeMs) : null
  const inRange = (d: Date) => !rangeStart || d >= rangeStart
  const inPrev = (d: Date) => !!prevStart && !!rangeStart && d >= prevStart && d < rangeStart
  const keep = (userId: string) => !excludedUserIds.has(userId)

  const local = (d: Date) => new Date(d.getTime() - input.tzOffsetMinutes * 60_000)
  const dayKey = (d: Date) => local(d).toISOString().slice(0, 10)

  const userName = new Map(input.users.map((u) => [u.id, u]))
  const nameOf = (id: string) => {
    const u = userName.get(id)
    return u?.displayName ?? u?.email ?? `${id.slice(0, 12)}…`
  }

  const deliveryToAssessment = new Map<string, string>()
  for (const a of input.assessments)
    for (const d of a.deliveryIds) deliveryToAssessment.set(d, a.id)

  // ── Unified activity events ──────────────────────────────────────────────
  const attemptPairs = new Set(input.simAttempts.map((a) => `${a.userId}|${a.scenarioId}`))
  const events: Ev[] = []
  for (const a of input.simAttempts)
    if (keep(a.userId))
      events.push({ userId: a.userId, at: a.startedAt, src: 'scenario', key: a.scenarioId })
  // Results with no matching attempt row (older data) still count as activity.
  for (const r of input.simResults)
    if (keep(r.userId) && !attemptPairs.has(`${r.userId}|${r.scenarioId}`))
      events.push({ userId: r.userId, at: r.completedAt, src: 'scenario', key: r.scenarioId })
  for (const s of input.immersive)
    if (keep(s.userId))
      events.push({ userId: s.userId, at: s.createdAt, src: 'immersive', key: s.scenarioId })
  for (const a of input.assessmentAttempts) {
    const key = deliveryToAssessment.get(a.deliveryId)
    if (key && keep(a.userId))
      events.push({ userId: a.userId, at: a.startedAt, src: 'assessment', key })
  }
  for (const q of input.sqlLogs)
    if (keep(q.userId))
      events.push({ userId: q.userId, at: q.createdAt, src: 'sql', key: q.datasetSlug })

  const rangeEvents = events.filter((e) => inRange(e.at))

  // ── Overview ─────────────────────────────────────────────────────────────
  const firstSeen = new Map<string, Date>()
  for (const e of events) {
    const f = firstSeen.get(e.userId)
    if (!f || e.at < f) firstSeen.set(e.userId, e.at)
  }
  const activeSince = (days: number) =>
    new Set(
      events.filter((e) => e.at >= new Date(now.getTime() - days * DAY_MS)).map((e) => e.userId)
    ).size
  const activeInRange = new Set(rangeEvents.map((e) => e.userId))
  const newUsers = [...activeInRange].filter(
    (id) => !rangeStart || firstSeen.get(id)! >= rangeStart
  ).length

  // Per-day series: the range (capped at 180 days for "all"), oldest first, empty days included.
  const spanDays = rangeMs ? rangeMs / DAY_MS : 180
  const dayUsers = new Map<string, Set<string>>()
  const dayEvents = new Map<string, number>()
  for (const e of rangeEvents) {
    const k = dayKey(e.at)
    dayEvents.set(k, (dayEvents.get(k) ?? 0) + 1)
    if (!dayUsers.has(k)) dayUsers.set(k, new Set())
    dayUsers.get(k)!.add(e.userId)
  }
  const perDay = Array.from({ length: spanDays }, (_, i) => {
    const date = dayKey(new Date(now.getTime() - (spanDays - 1 - i) * DAY_MS))
    return { date, activeUsers: dayUsers.get(date)?.size ?? 0, events: dayEvents.get(date) ?? 0 }
  })

  // heatmap[weekday 0=Sun..6][hour 0..23]
  const heatmap = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  for (const e of rangeEvents) {
    const l = local(e.at)
    heatmap[l.getUTCDay()][l.getUTCHours()]++
  }

  const eventsBySource = { scenario: 0, immersive: 0, assessment: 0, sql: 0 } as Record<
    UsageSource,
    number
  >
  for (const e of rangeEvents) eventsBySource[e.src]++

  const overview = {
    activeUsers: {
      d7: activeSince(7),
      d30: activeSince(30),
      d90: activeSince(90),
      all: firstSeen.size,
    },
    rangeActiveUsers: activeInRange.size,
    newUsers,
    returningUsers: activeInRange.size - newUsers,
    totalEvents: rangeEvents.length,
    eventsBySource,
    perDay,
    heatmap,
  }

  // ── Scenarios ────────────────────────────────────────────────────────────
  const scenarioIds = new Set(input.scenarios.map((s) => s.scenarioId))
  for (const a of input.simAttempts) scenarioIds.add(a.scenarioId)
  for (const r of input.simResults) scenarioIds.add(r.scenarioId)
  for (const s of input.immersive) scenarioIds.add(s.scenarioId)
  const scenarioMeta = new Map(input.scenarios.map((s) => [s.scenarioId, s]))
  const resultTitle = new Map(input.simResults.map((r) => [r.scenarioId, r.scenarioTitle]))

  const scenarios = [...scenarioIds].map((id) => {
    const meta = scenarioMeta.get(id)
    const attempts = input.simAttempts.filter((a) => a.scenarioId === id && keep(a.userId))
    const results = input.simResults.filter((r) => r.scenarioId === id && keep(r.userId))
    const sessions = input.immersive.filter((s) => s.scenarioId === id && keep(s.userId))
    const starts = (from: (d: Date) => boolean) =>
      attempts.filter((a) => from(a.startedAt)).length +
      sessions.filter((s) => from(s.createdAt)).length
    const startsInRange = starts(inRange)
    const completions =
      results.filter((r) => inRange(r.completedAt)).length +
      sessions.filter((s) => s.status === 'completed' && inRange(s.createdAt)).length
    const users = new Set([
      ...attempts.filter((a) => inRange(a.startedAt)).map((a) => a.userId),
      ...results.filter((r) => inRange(r.completedAt)).map((r) => r.userId),
      ...sessions.filter((s) => inRange(s.createdAt)).map((s) => s.userId),
    ])
    return {
      scenarioId: id,
      title: meta?.title ?? resultTitle.get(id) ?? id,
      track: meta?.track ?? null,
      mode: meta?.mode ?? null,
      status: meta?.status ?? 'unknown',
      starts: startsInRange,
      prevStarts: prevStart ? starts(inPrev) : null,
      uniqueUsers: users.size,
      completions,
      completionRate: pct(completions, startsInRange),
      avgScore: avg(results.filter((r) => inRange(r.completedAt)).map((r) => r.overallScore)),
      lastUsedAt:
        maxDate([
          ...attempts.map((a) => a.startedAt),
          ...results.map((r) => r.completedAt),
          ...sessions.map((s) => s.createdAt),
        ])?.toISOString() ?? null,
    }
  })

  // ── Assessments ──────────────────────────────────────────────────────────
  const assessmentRows = input.assessments.map((a) => {
    const ids = new Set(a.deliveryIds)
    const attempts = input.assessmentAttempts.filter((t) => ids.has(t.deliveryId) && keep(t.userId))
    const rng = attempts.filter((t) => inRange(t.startedAt))
    const submitted = rng.filter((t) => t.submittedAt)
    return {
      assessmentId: a.id,
      title: a.title,
      deliveries: a.deliveryIds.length,
      started: rng.length,
      prevStarted: prevStart ? attempts.filter((t) => inPrev(t.startedAt)).length : null,
      submitted: submitted.length,
      completionRate: pct(submitted.length, rng.length),
      avgScorePercent: avg(
        submitted.map((t) => t.scorePercent).filter((n): n is number => n != null)
      ),
      lateRate: pct(submitted.filter((t) => t.submittedLate).length, submitted.length),
      uniqueUsers: new Set(rng.map((t) => t.userId)).size,
      lastActivityAt: maxDate(attempts.map((t) => t.startedAt))?.toISOString() ?? null,
    }
  })

  // ── Tools ────────────────────────────────────────────────────────────────
  const toolDefs = [
    { key: 'sql-sandbox' as const, label: 'SQL Sandbox', src: 'sql' as const },
    { key: 'assessments' as const, label: 'Assessments', src: 'assessment' as const },
  ]
  const tools = toolDefs.map((t) => {
    const evs = rangeEvents.filter((e) => e.src === t.src)
    const users = new Set(evs.map((e) => e.userId))
    const cohortRows = input.cohorts
      .filter((c) => c.toolsEnabled[t.key])
      .map((c) => {
        const members = new Set(c.memberIds)
        const mine = evs.filter((e) => members.has(e.userId))
        return {
          cohortId: c.id,
          cohort: c.name,
          institution: c.institutionName,
          members: members.size,
          activeUsers: new Set(mine.map((e) => e.userId)).size,
          events: mine.length,
        }
      })
      .sort((a, b) => b.events - a.events || a.cohort.localeCompare(b.cohort))
    const sqlLogs =
      t.key === 'sql-sandbox'
        ? input.sqlLogs.filter((q) => keep(q.userId) && inRange(q.createdAt))
        : []
    const byDataset = new Map<string, { events: number; users: Set<string> }>()
    if (t.key === 'sql-sandbox') {
      for (const e of evs) {
        const d = byDataset.get(e.key) ?? { events: 0, users: new Set<string>() }
        d.events++
        d.users.add(e.userId)
        byDataset.set(e.key, d)
      }
    }
    return {
      key: t.key,
      label: t.label,
      enabledCohorts: cohortRows.length,
      cohortsWithUse: cohortRows.filter((c) => c.events > 0).length,
      activeUsers: users.size,
      events: evs.length,
      errorRate: sqlLogs.length ? pct(sqlLogs.filter((q) => !q.ok).length, sqlLogs.length) : null,
      cohorts: cohortRows,
      datasets: [...byDataset.entries()]
        .map(([slug, d]) => ({ slug, events: d.events, users: d.users.size }))
        .sort((a, b) => b.events - a.events),
    }
  })

  // ── Users ────────────────────────────────────────────────────────────────
  const scenarioTitle = new Map(scenarios.map((s) => [s.scenarioId, s.title]))
  const assessmentTitle = new Map(input.assessments.map((a) => [a.id, a.title]))
  const byUser = new Map<string, Ev[]>()
  for (const e of rangeEvents) byUser.set(e.userId, [...(byUser.get(e.userId) ?? []), e])
  const users = [...byUser.entries()]
    .map(([userId, evs]) => {
      const count = (src: UsageSource) => evs.filter((e) => e.src === src).length
      const top = (srcs: UsageSource[], label: (k: string) => string) => {
        const m = new Map<string, number>()
        for (const e of evs) if (srcs.includes(e.src)) m.set(e.key, (m.get(e.key) ?? 0) + 1)
        return [...m.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([k, n]) => ({ label: label(k), count: n }))
      }
      return {
        userId,
        name: nameOf(userId),
        email: userName.get(userId)?.email ?? null,
        total: evs.length,
        scenario: count('scenario') + count('immersive'),
        assessment: count('assessment'),
        sql: count('sql'),
        activeDays: new Set(evs.map((e) => dayKey(e.at))).size,
        firstSeenAt: firstSeen.get(userId)!.toISOString(),
        lastActiveAt: maxDate(evs.map((e) => e.at))!.toISOString(),
        topScenarios: top(['scenario', 'immersive'], (k) => scenarioTitle.get(k) ?? k),
        topAssessments: top(['assessment'], (k) => assessmentTitle.get(k) ?? k),
        topDatasets: top(['sql'], (k) => k),
      }
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, 100)

  return {
    range,
    generatedAt: now.toISOString(),
    overview,
    scenarios: scenarios.sort((a, b) => b.starts - a.starts || a.title.localeCompare(b.title)),
    tools,
    assessments: assessmentRows.sort(
      (a, b) => b.started - a.started || a.title.localeCompare(b.title)
    ),
    users,
  }
}

export type UsageReport = ReturnType<typeof buildUsage>
