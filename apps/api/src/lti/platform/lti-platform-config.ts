import type { PlatformRegistration, ToolRegistration } from '../lti-spec'

const env = (name: string): string | undefined => process.env[name]?.trim() || undefined

/** Base URL of the API, including the `/api` prefix. */
export const apiBase = (): string =>
  (env('LTI_API_BASE') ?? 'http://localhost:3000/api').replace(/\/+$/, '')

/** Where learners return to LearnDifferently from a tool (no trailing slash). */
export const learnUrl = (): string =>
  (env('LTI_LEARN_URL') ?? 'http://localhost:5174').replace(/\/+$/, '')

/** The platform's own registration: where tools find its auth, token and key endpoints. */
export function platformRegistration(): PlatformRegistration {
  const base = apiBase()
  return {
    issuer: env('LTI_PLATFORM_ISSUER') ?? new URL(base).origin,
    clientId: env('LTI_PLATFORM_CLIENT_ID') ?? 'ld-platform',
    deploymentId: env('LTI_DEPLOYMENT_ID') ?? '1',
    authUrl: `${base}/lti/platform/auth`,
    tokenUrl: `${base}/lti/platform/token`,
    jwksUrl: `${base}/lti/platform/jwks`,
  }
}

/** A connected tool: its LTI registration plus how LearnDifferently treats it (never sent over LTI). */
export interface PlatformTool extends ToolRegistration {
  /** An interview is practice that can be retried; an assessment is a question bank taken once. */
  kind: 'interview' | 'assessment'
  /** Whether a learner may launch it again after completing it. */
  retries: boolean
  /** Whether a course item for it may be labelled as the pre or post assessment. */
  labelable: boolean
  /**
   * Institution ids (agencies or providers) that may use it; empty means every workspace. A
   * workspace is allowed when it, or the agency it reports to, is listed.
   */
  workspaceIds: string[]
}

/** What the registry stores for a tool: the platform tool plus whether it may be launched. */
export interface StoredTool extends PlatformTool {
  enabled: boolean
  /** The connection (registration with a vendor) it launches through; its settings are copied in above. */
  connectionId: string
}

/** A registration with a tool vendor: the client id the platform knows it by, and where it lives. */
export interface StoredConnection {
  id: string
  name: string
  clientId: string
  deploymentId: string
  loginUrl: string
  launchUrl: string
  jwksUrl: string
}

let storedTools: StoredTool[] | null = null
let storedConnections: StoredConnection[] | null = null
let registryReady = true

/**
 * False from start-up until the stored tools have loaded once. Until then every tool is treated as
 * off: a restriction or switch-off an admin saved must not be ignored because a read failed.
 */
export function setRegistryReady(ready: boolean): void {
  registryReady = ready
}

/** Replaces the tools the platform reads (called by the registry after it loads or writes). */
export function setStoredTools(rows: StoredTool[]): void {
  storedTools = rows
}

/** Replaces the connections the admin sees (called with the tools, by the registry). */
export function setStoredConnections(rows: StoredConnection[]): void {
  storedConnections = rows
}

/** Forgets what was loaded, so the defaults apply again (for tests and for a service never started). */
export function resetStoredTools(): void {
  storedTools = null
  storedConnections = null
}

/** The id of the Interview Differently connection a new environment starts with. */
export const DEFAULT_CONNECTION_ID = 'interview-differently'

/**
 * The Interview Differently connection as a new environment is first set up (each field comes from
 * env, so a dev, staging and production API each point at their own host). Written to the registry
 * once, at first start; after that the registry is the only source and this is not read.
 */
export function defaultConnections(): StoredConnection[] {
  const base = apiBase()
  return [
    {
      id: DEFAULT_CONNECTION_ID,
      name: env('LTI_TOOL_NAME') ?? 'Interview Differently',
      clientId: env('LTI_TOOL_CLIENT_ID') ?? 'ld-platform',
      deploymentId: env('LTI_TOOL_DEPLOYMENT_ID') ?? '1',
      loginUrl: env('LTI_TOOL_LOGIN_URL') ?? `${base}/lti/tool/login`,
      launchUrl: env('LTI_TOOL_LAUNCH_URL') ?? `${base}/lti/tool/launch`,
      jwksUrl: env('LTI_TOOL_JWKS_URL') ?? `${base}/lti/tool/jwks`,
    },
  ]
}

/** The two Interview Differently tools a new environment starts with, on the default connection. */
export function defaultTools(): StoredTool[] {
  const [c] = defaultConnections()
  const shared = {
    connectionId: c.id,
    clientId: c.clientId,
    deploymentId: c.deploymentId,
    loginUrl: c.loginUrl,
    launchUrl: c.launchUrl,
    jwksUrl: c.jwksUrl,
    workspaceIds: [],
    enabled: true,
  }
  return [
    {
      toolId: 'id-interview',
      name: c.name,
      ...shared,
      kind: 'interview',
      retries: true,
      labelable: false,
    },
    {
      toolId: 'id-assessment',
      name: 'Interview Differently assessment',
      ...shared,
      kind: 'assessment',
      retries: false,
      labelable: true,
    },
  ]
}

/** Every tool, switched-off ones included. Nothing can be launched until the registry has loaded. */
export function managedTools(): StoredTool[] {
  const tools = storedTools ?? defaultTools()
  return registryReady ? tools : tools.map((t) => ({ ...t, enabled: false }))
}

/** Every connection (registration with a vendor). */
export const managedConnections = (): StoredConnection[] =>
  storedConnections ?? defaultConnections()

/** The tools a course item may launch: every enabled tool. */
export function registeredTools(): PlatformTool[] {
  return managedTools()
    .filter((t) => t.enabled)
    .map((t) => ({
      toolId: t.toolId,
      name: t.name,
      clientId: t.clientId,
      deploymentId: t.deploymentId,
      loginUrl: t.loginUrl,
      launchUrl: t.launchUrl,
      jwksUrl: t.jwksUrl,
      kind: t.kind,
      retries: t.retries,
      labelable: t.labelable,
      workspaceIds: t.workspaceIds,
    }))
}

/** The institutions whose approval covers a course: its provider, and the agency that provider reports to. */
export const scopeOf = (provider: { id: string; parentId: string | null }): string[] =>
  provider.parentId ? [provider.id, provider.parentId] : [provider.id]

/** Whether a tool may be used by a course whose provider has this scope (see `scopeOf`). */
export const toolAllowedFor = (tool: { workspaceIds: string[] }, scope: string[]): boolean =>
  tool.workspaceIds.length === 0 || tool.workspaceIds.some((id) => scope.includes(id))

/**
 * A tool by id even when it is switched off or limited: for work a learner already did (a score
 * coming back, an attempt cap), which must not be lost because the tool was switched off since.
 */
export const toolAnyById = (id: unknown): StoredTool | undefined =>
  managedTools().find((t) => t.toolId === id)

export const registeredToolIds = (): string[] => registeredTools().map((t) => t.toolId)
export const toolById = (id: unknown): PlatformTool | undefined =>
  registeredTools().find((t) => t.toolId === id)

/**
 * Whether a course item is practice rather than required work (not needed for completion): a
 * native interview, or an unlabelled tool item its author marked optional. Every other connected
 * tool item is required, so a course is complete only once all its labs and assessments are done.
 */
export const isPracticeItem = (i: {
  type: string
  label: string | null
  config?: unknown
}): boolean =>
  i.type === 'interview' ||
  (i.type === 'tool' &&
    !i.label &&
    (i.config as { optional?: unknown } | null | undefined)?.optional === true)

/**
 * Whether a course item feeds interview readiness: a native interview, or an unlabelled tool item
 * whose author flagged it `countsAsInterview`. Any other tool item is its own line item.
 */
export const isInterviewLike = (i: {
  type: string
  label: string | null
  config?: unknown
}): boolean =>
  i.type === 'interview' ||
  (i.type === 'tool' &&
    !i.label &&
    (i.config as { countsAsInterview?: unknown } | null | undefined)?.countsAsInterview === true)

/**
 * The score (1-100) a tool item must reach to count as done, or null when any scored attempt does.
 * A pre-assessment is a baseline, so it never has one.
 */
export function passScoreOf(config: unknown, label: string | null): number | null {
  const v = (config as { passScore?: unknown } | null | undefined)?.passScore
  return label !== 'pre' && typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 100
    ? v
    : null
}

/** Attempt rules for an assessment-kind tool item, read from its stored config (defaults: one attempt, no time limit). */
export function assessmentLimits(config: unknown): {
  maxAttempts: number
  timeLimitMinutes: number | null
} {
  const c = (config ?? {}) as { maxAttempts?: unknown; timeLimitMinutes?: unknown }
  const inRange = (v: unknown, min: number, max: number): v is number =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
  return {
    maxAttempts: inRange(c.maxAttempts, 1, 5) ? c.maxAttempts : 1,
    timeLimitMinutes: inRange(c.timeLimitMinutes, 5, 240) ? c.timeLimitMinutes : null,
  }
}
