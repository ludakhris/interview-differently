// Pure helpers for the Connected tools admin page: the workspace picker and the change history.

export interface PickWs {
  id: string
  name: string
  kind: string
  parentId: string | null
}

/** An agency with the providers under it; `agency` is null for providers that report to no listed agency. */
export interface PickGroup {
  agency: PickWs | null
  providers: PickWs[]
}

export const ID_PATTERN = /^[a-z0-9-]{2,40}$/

const byName = (a: PickWs, b: PickWs) => a.name.localeCompare(b.name)

/** Only agencies and providers can be chosen for a tool; organizations and colleges cannot. */
export const pickable = (all: PickWs[]): PickWs[] =>
  all.filter((w) => w.kind === 'agency' || w.kind === 'provider')

/** Agencies A to Z, each with its providers; providers with no listed agency come last. */
export function groupWorkspaces(list: PickWs[]): PickGroup[] {
  const agencies = list.filter((w) => w.kind === 'agency').sort(byName)
  const providers = list.filter((w) => w.kind === 'provider')
  const known = new Set(agencies.map((a) => a.id))
  const groups: PickGroup[] = agencies.map((agency) => ({
    agency,
    providers: providers.filter((p) => p.parentId === agency.id).sort(byName),
  }))
  const loose = providers.filter((p) => !p.parentId || !known.has(p.parentId)).sort(byName)
  if (loose.length) groups.push({ agency: null, providers: loose })
  return groups
}

/**
 * Keeps the groups that match a search (case-insensitive). An agency that matches shows all its
 * providers; one that does not stays visible when any of its providers match.
 */
export function filterGroups(groups: PickGroup[], query: string): PickGroup[] {
  const q = query.trim().toLowerCase()
  if (!q) return groups
  const hit = (w: PickWs) => w.name.toLowerCase().includes(q)
  return groups.flatMap((g) => {
    if (g.agency && hit(g.agency)) return [g]
    const providers = g.providers.filter(hit)
    return providers.length ? [{ agency: g.agency, providers }] : []
  })
}

/** A provider is covered when the agency it reports to is chosen. */
export function isCovered(selected: string[], w: PickWs): boolean {
  return w.kind === 'provider' && w.parentId !== null && selected.includes(w.parentId)
}

/** Ticks or unticks one workspace. Choosing an agency drops its providers, which it already covers. */
export function toggleWorkspace(selected: string[], w: PickWs, all: PickWs[]): string[] {
  if (selected.includes(w.id)) return selected.filter((id) => id !== w.id)
  if (isCovered(selected, w)) return selected
  if (w.kind !== 'agency') return [...selected, w.id]
  const under = new Set(all.filter((p) => p.parentId === w.id).map((p) => p.id))
  return [...selected.filter((id) => !under.has(id)), w.id]
}

/** Drops chosen providers whose agency is also chosen, so nothing is selected twice. */
export function normalizeSelection(selected: string[], all: PickWs[]): string[] {
  return selected.filter((id) => {
    const w = all.find((x) => x.id === id)
    return !(w && isCovered(selected, w))
  })
}

/** Stored ids the picker cannot show this person; they stay on the tool when it is saved. */
export const hiddenIds = (ids: string[], all: PickWs[]): string[] =>
  ids.filter((id) => !all.some((w) => w.id === id))

export const visibleIds = (ids: string[], all: PickWs[]): string[] =>
  ids.filter((id) => all.some((w) => w.id === id))

/** "Every workspace", "1 workspace", "3 workspaces". */
export function accessSummary(ids: string[]): string {
  if (ids.length === 0) return 'Every workspace'
  return `${ids.length} ${ids.length === 1 ? 'workspace' : 'workspaces'}`
}

/** The host of a URL for a compact list; the text itself when it is not a URL. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function truncate(text: string, max = 56): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

// ── History ────────────────────────────────────────────────────────────────

export const FIELD_LABELS: Record<string, string> = {
  id: 'Connection id',
  toolId: 'Tool id',
  name: 'Name',
  kind: 'Type',
  connectionId: 'Connection',
  retries: 'Can be retried',
  labelable: 'Can be a pre or post assessment',
  enabled: 'Status',
  workspaceIds: 'Available to',
  referenceLabel: 'Reference label',
  referenceHelp: 'Reference help',
  clientId: 'Client id',
  deploymentId: 'Deployment id',
  loginUrl: 'Login URL',
  launchUrl: 'Launch URL',
  jwksUrl: 'Key set URL',
}

export const KIND_LABEL: Record<string, string> = {
  interview: 'Practice lab',
  assessment: 'Graded assessment',
}

export interface HistoryLookup {
  workspaceName: (id: string) => string | null
  connectionName: (id: string) => string | null
}

export interface HistoryChange {
  subject: 'connection' | 'tool'
  subjectName: string
  action: 'created' | 'updated' | 'removed'
  changes: Record<string, { from: unknown; to: unknown }>
}

const EMPTY = 'none'

/** One stored value in words: a name for an id, On/Off or Yes/No for a switch, "none" for nothing. */
export function formatValue(field: string, value: unknown, lookup: HistoryLookup): string {
  if (value === null || value === undefined || value === '') return EMPTY
  if (field === 'workspaceIds' && Array.isArray(value)) {
    if (value.length === 0) return 'Every workspace'
    return value
      .map((id) => lookup.workspaceName(String(id)) ?? 'a workspace you cannot see')
      .join(', ')
  }
  if (typeof value === 'boolean') {
    if (field === 'enabled') return value ? 'On' : 'Off'
    return value ? 'Yes' : 'No'
  }
  if (field === 'kind') return KIND_LABEL[String(value)] ?? String(value)
  if (field === 'connectionId') return lookup.connectionName(String(value)) ?? String(value)
  if (Array.isArray(value)) return value.map(String).join(', ') || EMPTY
  return String(value)
}

export interface ChangeLine {
  label: string
  from: string | null
  to: string | null
}

/** The changed fields as label with old and new value; creates have no old value, removals no new. */
export function changeLines(c: HistoryChange, lookup: HistoryLookup): ChangeLine[] {
  return Object.entries(c.changes).map(([field, { from, to }]) => ({
    label: FIELD_LABELS[field] ?? field,
    from: c.action === 'created' ? null : formatValue(field, from, lookup),
    to: c.action === 'removed' ? null : formatValue(field, to, lookup),
  }))
}

/** What happened, after the person's name: "added tool X", "changed connection Y", "removed tool Z". */
export function actionPhrase(c: HistoryChange): string {
  const verb = { created: 'added', updated: 'changed', removed: 'removed' }[c.action]
  return `${verb} ${c.subject} ${c.subjectName}`
}

export type HistoryKind = 'all' | 'tool' | 'connection'

/** Everything a person could search a change by, lowercased: who, what, and every changed field and value. */
function searchText(c: HistoryChange & { userName: string }, lookup: HistoryLookup): string {
  const lines = changeLines(c, lookup).flatMap((l) => [l.label, l.from ?? '', l.to ?? ''])
  return [c.userName, actionPhrase(c), ...lines].join(' ').toLowerCase()
}

/** Keeps the changes of the chosen type that contain every word typed in the search box. */
export function filterHistory<T extends HistoryChange & { userName: string }>(
  entries: T[],
  lookup: HistoryLookup,
  query: string,
  kind: HistoryKind
): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return entries.filter((c) => {
    if (kind !== 'all' && c.subject !== kind) return false
    if (words.length === 0) return true
    const text = searchText(c, lookup)
    return words.every((w) => text.includes(w))
  })
}

/** "Today", "Yesterday", or the date, for a heading over a day's changes. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(now) - day(d)) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

/** Time of day only, for a row under a day heading. */
export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ── Registering a tool from its own link ───────────────────────────────────

/** Connections in `after` that were not in `before`: what a tool registered while we waited. */
export function newConnections<T extends { id: string }>(before: string[], after: T[]): T[] {
  return after.filter((c) => !before.includes(c.id))
}

export function registeredText(name: string): string {
  return `Registered ${name}. It is switched off: review it and turn it on.`
}

/** A quick pre-check only; the API decides what is allowed. */
export const looksHttps = (url: string): boolean => /^https:\/\/\S+$/i.test(url.trim())

/** How long a registration link lives, so how long to keep looking for what it adds. */
export const WATCH_MS = 15 * 60 * 1000

export const watchActive = (until: number | null, now: number): boolean =>
  until !== null && now < until

/** The tool a "Registered" banner opens: the first one switched off, else the first, else none. */
export function toolToReview<T extends { enabled: boolean }>(tools: T[]): T | null {
  return tools.find((t) => !t.enabled) ?? tools[0] ?? null
}
