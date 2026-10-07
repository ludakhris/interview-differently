/**
 * The protocol layer both sides of an LTI 1.3 connection need: claim names, RS256 JWTs and
 * JWKS. It stands in for the library a platform or tool would normally pull from npm.
 * Neither the platform (LearnDifferently) nor a tool (Interview Differently) may import the
 * other; they may import this file only. lti-boundary.spec.ts enforces that.
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  generateKeyPairSync,
  randomUUID,
} from 'node:crypto'
import type { JsonWebKey, KeyObject } from 'node:crypto'

export const CLAIM = {
  messageType: 'https://purl.imsglobal.org/spec/lti/claim/message_type',
  version: 'https://purl.imsglobal.org/spec/lti/claim/version',
  deploymentId: 'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
  targetLinkUri: 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri',
  resourceLink: 'https://purl.imsglobal.org/spec/lti/claim/resource_link',
  context: 'https://purl.imsglobal.org/spec/lti/claim/context',
  roles: 'https://purl.imsglobal.org/spec/lti/claim/roles',
  custom: 'https://purl.imsglobal.org/spec/lti/claim/custom',
  launchPresentation: 'https://purl.imsglobal.org/spec/lti/claim/launch_presentation',
  agsEndpoint: 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint',
} as const

export const AGS_SCOPE_SCORE = 'https://purl.imsglobal.org/spec/lti-ags/scope/score'
export const SCORE_CONTENT_TYPE = 'application/vnd.ims.lis.v1.score+json'
export const LEARNER_ROLE = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'
/** LD extension on a launch: brand tokens (see lti-brand.ts) the tool renders. Absent when the tenant has none. */
export const BRAND_CLAIM = 'https://learndifferently.tech/lti/brand'
/** LD extension on a score: per-rubric-dimension results. Not part of the LTI standard. */
export const DIMENSIONS_FIELD = 'https://learndifferently.tech/lti/dimensions'

/** Where a platform and a tool find each other. */
export interface PlatformRegistration {
  issuer: string
  clientId: string
  deploymentId: string
  authUrl: string
  tokenUrl: string
  jwksUrl: string
}

export interface ToolRegistration {
  toolId: string
  name: string
  clientId: string
  deploymentId: string
  loginUrl: string
  launchUrl: string
  jwksUrl: string
}

export interface Jwk extends JsonWebKey {
  kid: string
  alg: 'RS256'
  use: 'sig'
}

export interface KeyPair {
  kid: string
  privateKeyPem: string
  publicJwk: Jwk
}

export class LtiError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message)
  }
}

export const b64url = (b: Buffer | string): string => Buffer.from(b).toString('base64url')
const fromB64url = (s: string): Buffer => Buffer.from(s, 'base64url')

export function generateKeyPair(): KeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = publicKey.export({ format: 'jwk' })
  const kid = createHash('sha256')
    .update(JSON.stringify([jwk.e, jwk.n]))
    .digest('base64url')
    .slice(0, 16)
  return {
    kid,
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicJwk: { ...jwk, kid, alg: 'RS256', use: 'sig' },
  }
}

export function keyPairFromPem(privateKeyPem: string): KeyPair {
  const publicKey = createPublicKey(createPrivateKey(privateKeyPem))
  const jwk = publicKey.export({ format: 'jwk' })
  const kid = createHash('sha256')
    .update(JSON.stringify([jwk.e, jwk.n]))
    .digest('base64url')
    .slice(0, 16)
  return { kid, privateKeyPem, publicJwk: { ...jwk, kid, alg: 'RS256', use: 'sig' } }
}

export const jwksOf = (...pairs: KeyPair[]) => ({ keys: pairs.map((p) => p.publicJwk) })

export function signJwt(payload: Record<string, unknown>, key: KeyPair): string {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: key.kid }))
  const body = b64url(JSON.stringify(payload))
  const sig = createSign('RSA-SHA256')
    .update(`${head}.${body}`)
    .sign(createPrivateKey(key.privateKeyPem))
  return `${head}.${body}.${b64url(sig)}`
}

/** Decoded JWT claims: shape is untrusted until each claim is checked, so values stay loosely typed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JwtClaims = Record<string, any>

export interface VerifyOptions {
  issuer: string
  audience: string
  /** Looks up the issuer's public key by `kid`. */
  keyFor: (kid: string | undefined) => Promise<Jwk | KeyObject | undefined>
  nonce?: string
  clockSkewSeconds?: number
  now?: () => number
}

/** Verifies an RS256 JWT's signature, issuer, audience and time window (and nonce if asked). */
export async function verifyJwt(token: string, opts: VerifyOptions): Promise<JwtClaims> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new LtiError('Malformed token')
  let header: { alg?: string; kid?: string }
  let payload: JwtClaims
  try {
    header = JSON.parse(fromB64url(parts[0]).toString())
    payload = JSON.parse(fromB64url(parts[1]).toString())
  } catch {
    throw new LtiError('Malformed token')
  }
  if (!isObject(header) || !isObject(payload)) throw new LtiError('Malformed token')
  if (header.alg !== 'RS256') throw new LtiError('Unsupported algorithm')
  const found = await opts.keyFor(header.kid)
  if (!found) throw new LtiError('Unknown signing key', 401)
  const publicKey =
    'type' in found && typeof (found as KeyObject).type === 'string'
      ? (found as KeyObject)
      : createPublicKey({ key: found as JsonWebKey, format: 'jwk' })
  const ok = createVerify('RSA-SHA256')
    .update(`${parts[0]}.${parts[1]}`)
    .verify(publicKey, fromB64url(parts[2]))
  if (!ok) throw new LtiError('Bad signature', 401)
  const now = (opts.now ?? (() => Date.now() / 1000))()
  const skew = opts.clockSkewSeconds ?? 60
  if (payload.iss !== opts.issuer) throw new LtiError('Wrong issuer', 401)
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!aud.includes(opts.audience)) throw new LtiError('Wrong audience', 401)
  if (typeof payload.exp !== 'number' || payload.exp + skew < now)
    throw new LtiError('Token expired', 401)
  if (typeof payload.iat === 'number' && payload.iat - skew > now)
    throw new LtiError('Token issued in the future', 401)
  if (opts.nonce !== undefined && payload.nonce !== opts.nonce)
    throw new LtiError('Nonce mismatch', 401)
  return payload
}

const isObject = (v: unknown): boolean => typeof v === 'object' && v !== null && !Array.isArray(v)

export const newId = (): string => randomUUID()

const JWKS_TIMEOUT_MS = 3000
const JWKS_MAX_BYTES = 100_000
const UNKNOWN_KID_TTL_MS = 60_000
const MAX_UNKNOWN_KIDS = 100

/** Reads a response body as text, refusing more than `max` bytes. */
export async function readCapped(res: Response, max: number): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  if (!res.body) throw new Error('empty body')
  for await (const c of res.body as unknown as AsyncIterable<Uint8Array>) {
    size += c.length
    if (size > max) throw new Error('body too large')
    chunks.push(Buffer.from(c))
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Fetches a JWKS and picks a key by `kid`, caching for `ttlMs`. Unknown kids are remembered for a
 * minute so they cannot force a refetch per request, and concurrent loads share one fetch.
 * `fetchImpl` is injectable for tests.
 */
export function jwksKeyResolver(url: string, fetchImpl: typeof fetch = fetch, ttlMs = 5 * 60_000) {
  let cached: { at: number; keys: Jwk[] } | null = null
  let inflight: Promise<void> | null = null
  const unknown = new Map<string, number>()
  const loadOnce = async () => {
    try {
      // A redirect could send the request to an internal address the URL check never saw.
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(JWKS_TIMEOUT_MS),
        redirect: 'error',
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const keys = (JSON.parse(await readCapped(res, JWKS_MAX_BYTES)) as { keys?: Jwk[] }).keys
      if (!Array.isArray(keys)) throw new Error('no keys')
      cached = { at: Date.now(), keys }
    } catch {
      throw new LtiError('Could not load signing keys', 502)
    }
  }
  const load = () => {
    inflight ??= loadOnce().finally(() => {
      inflight = null
    })
    return inflight
  }
  return async (kid: string | undefined): Promise<Jwk | undefined> => {
    let loaded = false
    if (!cached || Date.now() - cached.at > ttlMs) {
      await load()
      loaded = true
    }
    let hit = cached!.keys.find((k) => k.kid === kid)
    if (hit) return hit
    const id = String(kid)
    if ((unknown.get(id) ?? 0) > Date.now()) return undefined
    if (!loaded) {
      await load() // a rotated key: refetch once
      hit = cached!.keys.find((k) => k.kid === kid)
      if (hit) return hit
    }
    if (unknown.size >= MAX_UNKNOWN_KIDS) unknown.delete(unknown.keys().next().value!)
    unknown.set(id, Date.now() + UNKNOWN_KID_TTL_MS)
    return undefined
  }
}
