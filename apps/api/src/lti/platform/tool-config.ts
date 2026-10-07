import { bad, text, internalHost, publicHttpsUrl } from '../public-url'
import type { LearnConnection, LearnTool } from '../../learn/learn-types'
import type { StoredConnection, StoredTool } from './lti-platform-config'

export { internalHost, publicHttpsUrl }

const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/
function flag(v: unknown, field: string, fallback: boolean): boolean {
  if (v === undefined) return fallback
  return typeof v === 'boolean' ? v : bad(`${field} must be true or false`)
}

/** Institution ids the tool is limited to: up to 100 short strings, duplicates dropped. */
function workspaceIds(v: unknown): string[] {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.length > 100) return bad('Workspaces must be a list of up to 100 ids')
  const ids = v.map((id) => text(id, 'Workspace id', 64))
  return [...new Set(ids)]
}

/** An optional piece of text: blank means none; too long is refused. */
function optionalText(v: unknown, field: string, max: number): string | null {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') return bad(`${field} must be text`)
  const t = v.trim()
  if (t.length > max) return bad(`${field} is too long`)
  return t === '' ? null : t
}

/** A tool as saved: what it is and who may use it. Where it lives is its connection's. */
export type ToolRow = Omit<
  StoredTool,
  'clientId' | 'deploymentId' | 'loginUrl' | 'launchUrl' | 'jwksUrl'
>

/** The tool settings from a request body, or a 400 naming the first problem. */
export function validateToolInput(input: unknown, toolId?: string): ToolRow {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    return bad('Body must be an object')
  const b = input as Record<string, unknown>
  const id = toolId ?? text(b.toolId, 'Tool id', 40)
  if (!SLUG.test(id))
    return bad('Tool id must be 2-40 lowercase letters, numbers or dashes, starting with one')
  if (b.kind !== 'interview' && b.kind !== 'assessment')
    return bad('Kind must be interview or assessment')
  return {
    toolId: id,
    connectionId: text(b.connectionId, 'Connection', 64),
    name: text(b.name, 'Name', 80),
    kind: b.kind,
    retries: flag(b.retries, 'Retries', b.kind === 'interview'),
    labelable: flag(b.labelable, 'Pre/post label', b.kind === 'assessment'),
    enabled: flag(b.enabled, 'Enabled', true),
    workspaceIds: workspaceIds(b.workspaceIds),
    referenceLabel: optionalText(b.referenceLabel, 'Reference label', 60),
    referenceHelp: optionalText(b.referenceHelp, 'Reference help', 600),
  }
}

/** The connection settings from a request body, or a 400 naming the first problem. */
export function validateConnectionInput(input: unknown, connectionId?: string): StoredConnection {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    return bad('Body must be an object')
  const b = input as Record<string, unknown>
  const id = connectionId ?? text(b.id, 'Connection id', 40)
  if (!SLUG.test(id))
    return bad('Connection id must be 2-40 lowercase letters, numbers or dashes, starting with one')
  return {
    id,
    name: text(b.name, 'Name', 80),
    clientId: text(b.clientId, 'Client id', 200),
    deploymentId: text(b.deploymentId, 'Deployment id', 200),
    loginUrl: publicHttpsUrl(b.loginUrl, 'Login URL'),
    launchUrl: publicHttpsUrl(b.launchUrl, 'Launch URL'),
    jwksUrl: publicHttpsUrl(b.jwksUrl, 'Key set URL'),
  }
}

/** A tool as shown to a person: who may use it only when they may manage tools. */
export function toolView(t: StoredTool, canManage: boolean): LearnTool {
  return {
    toolId: t.toolId,
    connectionId: t.connectionId,
    name: t.name,
    kind: t.kind,
    retries: t.retries,
    labelable: t.labelable,
    enabled: t.enabled,
    workspaceIds: canManage ? t.workspaceIds : [],
    referenceLabel: t.referenceLabel,
    referenceHelp: t.referenceHelp,
  }
}

export function connectionView(
  c: StoredConnection,
  tools: { connectionId: string }[]
): LearnConnection {
  return { ...c, toolCount: tools.filter((t) => t.connectionId === c.id).length }
}

type Diff = Record<string, { from: unknown; to: unknown }>

function diffFields<T extends object>(
  fields: readonly (keyof T)[],
  before: T | null,
  after: T | null
): Diff {
  const out: Diff = {}
  for (const f of fields) {
    const from = before ? before[f] : null
    const to = after ? after[f] : null
    if (JSON.stringify(from) !== JSON.stringify(to)) out[f as string] = { from, to }
  }
  return out
}

const TOOL_FIELDS = [
  'name',
  'kind',
  'retries',
  'labelable',
  'connectionId',
  'enabled',
  'workspaceIds',
  'referenceLabel',
  'referenceHelp',
] as const satisfies readonly (keyof ToolRow)[]

const CONNECTION_FIELDS = [
  'name',
  'clientId',
  'deploymentId',
  'loginUrl',
  'launchUrl',
  'jwksUrl',
] as const satisfies readonly (keyof StoredConnection)[]

/**
 * What changed between two versions of a tool, as `{ field: { from, to } }`. `before` null is a
 * new tool (every field from null), `after` null a removed one (every field to null).
 */
export const diffTool = (before: ToolRow | null, after: ToolRow | null): Diff =>
  diffFields(TOOL_FIELDS, before, after)

/** The same for a connection. */
export const diffConnection = (
  before: StoredConnection | null,
  after: StoredConnection | null
): Diff => diffFields(CONNECTION_FIELDS, before, after)
