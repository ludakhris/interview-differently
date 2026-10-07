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
}

/** The tools a course item may launch (static for the POC; each field overridable by env). */
export function registeredTools(): PlatformTool[] {
  const base = apiBase()
  const shared = {
    clientId: env('LTI_TOOL_CLIENT_ID') ?? 'ld-platform',
    deploymentId: env('LTI_TOOL_DEPLOYMENT_ID') ?? '1',
    loginUrl: env('LTI_TOOL_LOGIN_URL') ?? `${base}/lti/tool/login`,
    launchUrl: env('LTI_TOOL_LAUNCH_URL') ?? `${base}/lti/tool/launch`,
    jwksUrl: env('LTI_TOOL_JWKS_URL') ?? `${base}/lti/tool/jwks`,
  }
  return [
    {
      toolId: 'id-interview',
      name: env('LTI_TOOL_NAME') ?? 'Interview Differently',
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

export const registeredToolIds = (): string[] => registeredTools().map((t) => t.toolId)
export const toolById = (id: unknown): PlatformTool | undefined =>
  registeredTools().find((t) => t.toolId === id)

/**
 * Whether a course item is practice rather than required work (not needed for completion): a
 * native interview. Every connected tool item is required, so a course is complete only once all
 * its labs and assessments are done.
 */
export const isPracticeItem = (i: { type: string; label: string | null }): boolean =>
  i.type === 'interview'

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
