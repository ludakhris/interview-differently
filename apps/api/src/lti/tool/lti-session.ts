import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { sanitizeBrand, type LtiBrand } from '../lti-brand'
import { LtiError } from '../lti-spec'

/** Lifetime of the session a launch hands to the Interview Differently web app. */
export const SESSION_TTL_S = 2 * 60 * 60
/** Header form: `Authorization: Bearer lti.<token>`. */
export const SESSION_BEARER_PREFIX = 'lti.'

/** The tool's own signed LTI session: who launched, what for, and where to post the score. */
export interface LtiSession {
  /** The local user id: the platform's `sub`, prefixed with the platform for every platform but the built-in one. */
  sub: string
  /** The platform that launched it (a registered platform's id). Absent (built-in or older tokens): the built-in platform. */
  platformId?: string
  /** The platform's own `sub`, when `sub` was prefixed: the id its score is posted for. */
  platformSub?: string
  ref: string
  lineitem: string
  /** Where the learner returns to: the launch's return_url (http or https only), else none. */
  returnUrl?: string
  /**
   * Slugs of the SQL datasets the launched scenario's sql nodes use, read from the scenario at
   * launch. The only datasets this session may fetch. Absent (older tokens) means none.
   */
  datasets?: string[]
  /** The launching tenant's sanitized brand tokens, if it has one. */
  brand?: LtiBrand
  /**
   * Set for an assessment launch (`ref` is then the assessment slug): the one AssessmentDelivery
   * this session may start an attempt on. Absent means the session can reach no assessment route.
   */
  deliveryId?: string
  /**
   * Set when the platform launched this assessment session to look at answers, not to take it: the
   * session may read the submitted attempt's review and cannot start an attempt.
   */
  review?: boolean
  jti: string
  /** Issued-at, epoch seconds: a result must be completed after the session began. */
  iat: number
  exp: number
}

let fallbackSecret: string | undefined
/** LTI_TOOL_SECRET; outside production a per-process random one when unset. */
export function toolSecret(): string {
  return process.env.LTI_TOOL_SECRET || (fallbackSecret ??= randomBytes(32).toString('hex'))
}

// The prefix keeps a session token from verifying as a submission token and the reverse.
const mac = (body: string, secret: string): Buffer =>
  createHmac('sha256', secret).update(`lti-session.${body}`).digest()

/** `base64url(JSON).base64url(HMAC-SHA256)`. */
export function signSession(claims: LtiSession, secret = toolSecret()): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${body}.${mac(body, secret).toString('base64url')}`
}

/** Verifies the HMAC and expiry; throws a 401 LtiError otherwise. */
export function verifySession(
  token: string | undefined,
  nowS = Date.now() / 1000,
  secret = toolSecret()
): LtiSession {
  const invalid = () => new LtiError('Invalid session token', 401)
  const [body, sig, extra] = (token ?? '').split('.')
  if (!body || !sig || extra !== undefined) throw invalid()
  const given = Buffer.from(sig, 'base64url')
  const expected = mac(body, secret)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw invalid()
  let claims: LtiSession
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString())
  } catch {
    throw invalid()
  }
  if (typeof claims.exp !== 'number' || claims.exp < nowS) {
    throw new LtiError('Session expired; relaunch from your course', 401)
  }
  if (typeof claims.iat !== 'number') throw invalid()
  if (
    claims.datasets !== undefined &&
    (!Array.isArray(claims.datasets) || !claims.datasets.every((d) => typeof d === 'string'))
  )
    throw invalid()
  if (
    claims.deliveryId !== undefined &&
    (typeof claims.deliveryId !== 'string' || !claims.deliveryId)
  )
    throw invalid()
  if (claims.review !== undefined && (claims.review !== true || !claims.deliveryId)) throw invalid()
  if (claims.brand !== undefined) {
    // validated again, and the stored form must already be the sanitized form
    const clean = sanitizeBrand(claims.brand)
    if (!clean || JSON.stringify(clean) !== JSON.stringify(claims.brand)) throw invalid()
  }
  for (const f of [claims.platformId, claims.platformSub])
    if (f !== undefined && (typeof f !== 'string' || !f)) throw invalid()
  if (!claims.sub || !claims.jti || !claims.lineitem || !claims.ref) throw invalid()
  return claims
}

/** The distinct dataset slugs used by the `sql` nodes of a scenario's stored data. */
export function sqlDatasetSlugs(data: unknown): string[] {
  const nodes = (data as { nodes?: unknown } | null)?.nodes
  if (!Array.isArray(nodes)) return []
  const slugs = nodes.flatMap((n: { type?: string; sql?: { datasetSlug?: unknown } } | null) =>
    n?.type === 'sql' && typeof n.sql?.datasetSlug === 'string' && n.sql.datasetSlug
      ? [n.sql.datasetSlug]
      : []
  )
  return [...new Set(slugs)]
}
