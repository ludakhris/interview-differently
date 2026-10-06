import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { LtiError } from '../lti-spec'

/** Lifetime of the session a launch hands to the Interview Differently web app. */
export const SESSION_TTL_S = 2 * 60 * 60
/** Header form: `Authorization: Bearer lti.<token>`. */
export const SESSION_BEARER_PREFIX = 'lti.'

/** The tool's own signed LTI session: who launched, what for, and where to post the score. */
export interface LtiSession {
  sub: string
  ref: string
  lineitem: string
  /** Where the learner returns to: the launch's return_url (http or https only), else none. */
  returnUrl?: string
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
  if (!claims.sub || !claims.jti || !claims.lineitem || !claims.ref) throw invalid()
  return claims
}
