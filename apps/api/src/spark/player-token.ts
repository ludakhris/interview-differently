import { Logger, ServiceUnavailableException } from '@nestjs/common'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * The signed link that opens one learner's lesson in Spark's player (apps/spark). The LMS gets it from the Spark
 * port and embeds it; the player sends it back as `Authorization: Bearer spark.<token>`. Spark's own, so the
 * player needs no sign-in of its own and no cookie in a cross-site frame.
 */

/** How long a link works: long enough for a sitting, short enough that a leaked link soon stops working. */
export const PLAYER_TTL_S = 4 * 60 * 60
/** How long a reviewer's preview link works: one look before a decision. */
export const PREVIEW_TTL_S = 60 * 60
/** Header form: `Authorization: Bearer spark.<token>`. */
export const PLAYER_BEARER_PREFIX = 'spark.'

export interface PlayerToken {
  /** The learner. */
  sub: string
  cohortId: string
  /** The LMS item the lesson fills. */
  itemId: string
  /** The LessonUse this link plays. */
  useId: string
  /** Expiry, epoch seconds. */
  exp: number
}

/**
 * A reviewer's preview of one lesson, by its Lesson id, whatever its status: it plays in the same player and records
 * nothing (no LessonEvent, no watch history, no learner's slot). Signed under its own HMAC prefix, so a preview link
 * never verifies as a learner's link, nor a learner's as a preview.
 */
export interface PreviewToken {
  preview: true
  /** The reviewer. */
  sub: string
  lessonId: string
  /** Expiry, epoch seconds. */
  exp: number
}

/** The value apps/api/.env.example ships with: never a real secret. */
export const PLACEHOLDER_SECRET = 'replace_with_a_long_random_string'

let fallbackSecret: string | undefined
/**
 * SPARK_SESSION_SECRET. In production a missing (or placeholder) secret means lessons are not set up: signing and
 * checking links fail with a 503 rather than hand out links that break on the next deploy. Elsewhere a random secret
 * per process stands in, so links stop working on restart.
 */
export function playerSecret(): string {
  const set = process.env.SPARK_SESSION_SECRET
  if (set && set !== PLACEHOLDER_SECRET) return set
  if (process.env.NODE_ENV === 'production')
    throw new ServiceUnavailableException('Lessons are not set up on this server')
  if (!fallbackSecret) {
    fallbackSecret = randomBytes(32).toString('hex')
    new Logger('SparkPlayer').warn(
      'SPARK_SESSION_SECRET is not set: lesson links use a per-process secret and break on restart'
    )
  }
  return fallbackSecret
}

// The prefix keeps a Spark link from verifying as any other HMAC token signed with the same secret, and a preview
// link (its own prefix) from verifying as a learner's.
const LEARNER_DOMAIN = 'spark-lesson'
const PREVIEW_DOMAIN = 'spark-lesson-preview'
const mac = (body: string, secret: string, domain = LEARNER_DOMAIN): Buffer =>
  createHmac('sha256', secret).update(`${domain}.${body}`).digest()

function sign(claims: object, domain: string, secret: string): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${body}.${mac(body, secret, domain).toString('base64url')}`
}

/** The claims of a token signed under `domain`, unchecked beyond the signature, or null. */
function opened(
  token: string | undefined,
  domain: string,
  secret: string
): Record<string, unknown> | null {
  const [body, sig, extra] = (token ?? '').split('.')
  if (!body || !sig || extra !== undefined) return null
  const given = Buffer.from(sig, 'base64url')
  const expected = mac(body, secret, domain)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let claims: unknown
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString())
  } catch {
    return null
  }
  return typeof claims === 'object' && claims !== null ? (claims as Record<string, unknown>) : null
}

/** `base64url(JSON).base64url(HMAC-SHA256)`. */
export function signPlayerToken(
  claims: Omit<PlayerToken, 'exp'>,
  nowS = Date.now() / 1000,
  secret = playerSecret()
): string {
  const full: PlayerToken = { ...claims, exp: Math.floor(nowS) + PLAYER_TTL_S }
  return sign(full, LEARNER_DOMAIN, secret)
}

/** The claims of a valid, unexpired token, or null. */
export function verifyPlayerToken(
  token: string | undefined,
  nowS = Date.now() / 1000,
  secret = playerSecret()
): PlayerToken | null {
  const claims = opened(token, LEARNER_DOMAIN, secret) as Partial<PlayerToken> | null
  if (!claims) return null
  const { sub, cohortId, itemId, useId, exp } = claims
  if (typeof exp !== 'number' || exp < nowS) return null
  for (const f of [sub, cohortId, itemId, useId]) if (typeof f !== 'string' || !f) return null
  return { sub, cohortId, itemId, useId, exp } as PlayerToken
}

/** A reviewer's preview link token for one lesson (see PreviewToken). */
export function signPreviewToken(
  claims: { sub: string; lessonId: string },
  nowS = Date.now() / 1000,
  secret = playerSecret()
): string {
  const full: PreviewToken = {
    preview: true,
    sub: claims.sub,
    lessonId: claims.lessonId,
    exp: Math.floor(nowS) + PREVIEW_TTL_S,
  }
  return sign(full, PREVIEW_DOMAIN, secret)
}

/** The claims of a valid, unexpired preview token, or null. */
export function verifyPreviewToken(
  token: string | undefined,
  nowS = Date.now() / 1000,
  secret = playerSecret()
): PreviewToken | null {
  const claims = opened(token, PREVIEW_DOMAIN, secret) as Partial<PreviewToken> | null
  if (!claims || claims.preview !== true) return null
  const { sub, lessonId, exp } = claims
  if (typeof exp !== 'number' || exp < nowS) return null
  for (const f of [sub, lessonId]) if (typeof f !== 'string' || !f) return null
  return { preview: true, sub, lessonId, exp } as PreviewToken
}

/** What a player link can be: a learner's, or a reviewer's preview. */
export type SparkLink = PlayerToken | PreviewToken

export const isPreview = (token: SparkLink): token is PreviewToken =>
  (token as PreviewToken).preview === true

/**
 * Where the player lives: SPARK_WEB_URL, or the local dev server. In production a missing SPARK_WEB_URL means lessons
 * are not set up (as a missing secret does): a 503, never a link to localhost.
 */
export const sparkWebUrl = (): string => {
  const set = process.env.SPARK_WEB_URL
  if (!set && process.env.NODE_ENV === 'production')
    throw new ServiceUnavailableException('Lessons are not set up on this server')
  return (set || 'http://localhost:5175').replace(/\/+$/, '')
}

/** The player link for a token. The token rides in the fragment, so it is never sent to Spark's web host. */
export const playerUrl = (token: string): string => `${sparkWebUrl()}/lesson#token=${token}`
