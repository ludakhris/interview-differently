import { BadRequestException } from '@nestjs/common'
import type { LearnConnection, LearnTool } from '../../learn/learn-types'
import type { StoredConnection, StoredTool } from './lti-platform-config'

const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

/** True for an IPv4 address (four octets) in a private, loopback, link-local or reserved range. */
function internalOctets([a, b, c]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 198 && (b === 18 || b === 19))
  )
}

/** The four octets of a dotted IPv4 address, or null. (`new URL` already rewrites 127.1, 0x7f.1, decimal.) */
function ipv4Octets(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  return m ? m.slice(1).map(Number) : null
}

/** The 16 bytes of an IPv6 literal (no brackets), or null when it is not one. */
function ipv6Bytes(host: string): number[] | null {
  const halves = host.split('::')
  if (halves.length > 2) return null
  const groups = (part: string): string[] | null => {
    if (part === '') return []
    const out = part.split(':')
    const last = out[out.length - 1]
    if (last.includes('.')) {
      const v4 = ipv4Octets(last)
      if (!v4) return null
      out.splice(-1, 1, ((v4[0] << 8) | v4[1]).toString(16), ((v4[2] << 8) | v4[3]).toString(16))
    }
    return out
  }
  const head = groups(halves[0])
  const tail = halves.length === 2 ? groups(halves[1]) : []
  if (!head || !tail) return null
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const all = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (!all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null
  return all.flatMap((g) => [parseInt(g, 16) >> 8, parseInt(g, 16) & 255])
}

/** Whether an IPv6 address is loopback, private, link-local, multicast, or wraps an internal IPv4. */
function internalIpv6(b: number[]): boolean {
  const zeros = (from: number, to: number) => b.slice(from, to).every((x) => x === 0)
  if (zeros(0, 12)) return true // ::, ::1 and IPv4-compatible forms
  if (zeros(0, 10) && b[10] === 0xff && b[11] === 0xff) return internalOctets(b.slice(12)) // ::ffff:a.b.c.d
  if (b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && zeros(4, 12))
    return internalOctets(b.slice(12)) // NAT64 64:ff9b::/96
  if (b[0] === 0x20 && b[1] === 0x02) return internalOctets(b.slice(2, 6)) // 6to4 2002::/16
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0 && b[3] === 0) return true // Teredo
  return (
    (b[0] & 0xfe) === 0xfc || // unique local fc00::/7
    (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) || // link-local fe80::/10
    b[0] === 0xff // multicast
  )
}

/**
 * Whether a hostname points inside the network rather than at a public tool: localhost, a
 * private, link-local or reserved address (IPv4, IPv6, or IPv6 wrapping an IPv4), or a name that
 * only resolves internally. (A public name that resolves to a private address is not caught.)
 */
export function internalHost(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (['.local', '.internal', '.lan', '.home', '.corp'].some((x) => host.endsWith(x))) return true
  const v4 = ipv4Octets(host)
  if (v4) return internalOctets(v4)
  if (host.includes(':')) {
    const v6 = ipv6Bytes(host)
    return v6 ? internalIpv6(v6) : true // an IPv6-looking host we cannot read is not trusted
  }
  return false
}

const bad = (message: string): never => {
  throw new BadRequestException(message)
}

function text(v: unknown, field: string, max: number): string {
  if (typeof v !== 'string' || !v.trim()) return bad(`${field} is required`)
  const t = v.trim()
  return t.length > max ? bad(`${field} is too long`) : t
}

function flag(v: unknown, field: string, fallback: boolean): boolean {
  if (v === undefined) return fallback
  return typeof v === 'boolean' ? v : bad(`${field} must be true or false`)
}

/** An https URL, or http only for a local development host. */
export function publicHttpsUrl(v: unknown, field: string): string {
  const raw = text(v, field, 500)
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return bad(`${field} is not a valid URL`)
  }
  // Development may use a local tool over http; production only ever reaches public https hosts.
  const devLocal = process.env.NODE_ENV !== 'production' && LOCAL_HOSTS.includes(u.hostname)
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && devLocal))
    return bad(`${field} must start with https://`)
  if (internalHost(u.hostname) && !devLocal)
    return bad(`${field} must point at a public address, not one inside the network`)
  if (u.username || u.password) return bad(`${field} must not contain a login`)
  return raw
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
