import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { assertLtiProductionConfig, isLearnOrigin, loadSigningKeys } from '../lti-env'
import { LTI_STORE } from '../lti-store'
import type { LtiStore } from '../lti-store'
import { cohortStatus } from '../../learn/cohort-config'
import { LearnerService } from '../../learn/learner.service'
import { ActivityService } from '../../learn/activity/activity.service'
import { sanitizeBrand } from '../lti-brand'
import {
  AGS_SCOPE_SCORE,
  BRAND_CLAIM,
  CLAIM,
  DIMENSIONS_FIELD,
  LEARNER_ROLE,
  LtiError,
  b64url,
  jwksKeyResolver,
  jwksOf,
  newId,
  signJwt,
  verifyJwt,
} from '../lti-spec'
import type { JwtClaims, KeyPair, ToolRegistration } from '../lti-spec'
import {
  apiBase,
  assessmentLimits,
  learnUrl,
  platformRegistration,
  reviewAllowed,
  managedTools,
  registeredTools,
  scopeOf,
  toolAllowedFor,
  toolAnyById,
  toolById,
} from './lti-platform-config'

const MAX_BRAND_HOPS = 5
const HINT_TTL_S = 60
const ID_TOKEN_TTL_S = 5 * 60
const ACCESS_TOKEN_TTL_S = 3600
const MAX_ASSERTION_LIFETIME_S = 10 * 60
const MAX_SCORE_CLOCK_AHEAD_MS = 5 * 60_000
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const RATE_WINDOW_S = 60
const AUTH_PER_MINUTE_PER_IP = 30
const TOKEN_PER_MINUTE_PER_CLIENT = 60
const ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'

type Params = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const nowS = (): number => Math.floor(Date.now() / 1000)

/** Every value in the auto-submit form goes through this. */
export function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function autoSubmitForm(action: string, fields: Record<string, string>): string {
  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Launching</title></head><body onload="document.forms[0].submit()"><form method="POST" action="${escapeHtml(action)}">${inputs}<noscript><button type="submit">Continue</button></noscript></form></body></html>`
}

/** LearnDifferently as an LTI 1.3 platform: signs launches, issues tokens, accepts scores. */
@Injectable()
export class LtiPlatformService {
  private readonly keys: KeyPair
  /** The key `keys` replaced (LTI_PLATFORM_PREVIOUS_PRIVATE_KEY): published and verified against, never signed with. */
  private readonly previousKeys?: KeyPair
  private readonly hintSecret: Buffer
  private readonly toolKeys = new Map<string, ReturnType<typeof jwksKeyResolver>>()
  /** Injectable for tests. */
  fetchImpl: typeof fetch = (...args) => fetch(...args)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => LearnerService)) private readonly learner: LearnerService,
    @Inject(LTI_STORE) private readonly store: LtiStore,
    @Optional() private readonly activity?: ActivityService
  ) {
    assertLtiProductionConfig()
    const { current, previous } = loadSigningKeys(
      'LTI_PLATFORM_PRIVATE_KEY',
      'LTI_PLATFORM_PREVIOUS_PRIVATE_KEY'
    )
    this.keys = current
    this.previousKeys = previous
    // LTI_HINT_SECRET when set, else derived from the private key; either way every instance
    // sharing it accepts the same hints.
    const secret = process.env.LTI_HINT_SECRET?.trim() || this.keys.privateKeyPem
    this.hintSecret = createHash('sha256').update(`lti-hint:${secret}`).digest()
  }

  jwks() {
    return jwksOf(...(this.previousKeys ? [this.keys, this.previousKeys] : [this.keys]))
  }

  /** Counts a hit and throws 429 over `limit` in the window; the key is already trusted (an IP or a verified client). */
  private async limit(scope: string, key: string, limit: number, kind: 'json' | 'oauth' = 'json') {
    if ((await this.store.count(`rl:${scope}`, key, RATE_WINDOW_S)) <= limit) return
    if (kind === 'oauth') this.oauthError('rate_limited', 'Too many requests', 429)
    throw new HttpException('Too many requests', 429)
  }

  // ── launch ──────────────────────────────────────────────────────────────────

  /** Checks the learner may open this tool item and returns the form that starts the OIDC login. */
  async startLaunch(
    userId: string,
    cohortId: string,
    itemId: string,
    returnOrigin?: string,
    mode?: 'review'
  ) {
    const { tool, config, label, enrollmentId } = await this.toolItem(cohortId, itemId, userId)
    if (mode === 'review') await this.assertCanReview(userId, cohortId, itemId, tool, config, label)
    else if (tool.kind === 'assessment') {
      const { maxAttempts } = assessmentLimits(config)
      const used = await this.attemptsUsed(userId, cohortId, itemId)
      if (used >= maxAttempts)
        throw new ConflictException(`You have used all ${maxAttempts} attempts.`)
    }
    // Only a LearnDifferently origin (the apex or a tenant host) is carried; anything else falls back to LTI_LEARN_URL.
    const origin = isLearnOrigin(returnOrigin, learnUrl())
      ? new URL(returnOrigin!).origin
      : undefined
    const hint = this.signHint({ userId, cohortId, itemId, returnOrigin: origin, mode })
    // #69 E: note the launch for tool time. Not awaited and never throws: it cannot slow or fail a launch.
    // Looking at answers is not tool time.
    if (this.activity && enrollmentId && mode !== 'review')
      void Promise.resolve()
        .then(() => this.activity?.openToolLaunch(enrollmentId, userId, itemId))
        .catch(() => undefined)
    return {
      action: tool.loginUrl,
      fields: {
        iss: platformRegistration().issuer,
        login_hint: userId,
        target_link_uri: tool.launchUrl,
        lti_message_hint: hint,
        client_id: tool.clientId,
        lti_deployment_id: tool.deploymentId,
      },
    }
  }

  /**
   * Review is for a learner who has used every attempt on an assessment item that allows it, so it
   * can never be a peek before a retake. The tool trusts this check: it signs the launch.
   */
  private async assertCanReview(
    userId: string,
    cohortId: string,
    itemId: string,
    tool: { kind: string },
    config: unknown,
    label: string | null
  ) {
    if (tool.kind !== 'assessment' || !reviewAllowed(config, label))
      throw new ConflictException('Answers are not available to review for this item.')
    const used = await this.attemptsUsed(userId, cohortId, itemId)
    if (used < 1) throw new ConflictException('There is nothing to review yet.')
    if (used < assessmentLimits(config).maxAttempts)
      throw new ConflictException('You can review your answers once all your attempts are used.')
  }

  /** Scores recorded for this learner on the item (LearnDifferently's own count of attempts). */
  private async attemptsUsed(userId: string, cohortId: string, itemId: string): Promise<number> {
    const progress = await this.prisma.itemProgress.findFirst({
      where: { itemId, enrollment: { cohortId, userId } },
      select: { attempts: true },
    })
    return progress?.attempts ?? 0
  }

  /**
   * The item as a tool item, with its tool and ref. With `userId`, the learner must also be
   * enrolled and the cohort open (launching); without, the item need only belong to the cohort's course.
   * `scoring`: a score coming back for work the learner already did is accepted even if the tool has
   * since been switched off or its access narrowed; only launching a tool needs it to be available.
   */
  private async toolItem(cohortId: string, itemId: string, userId?: string, scoring = false) {
    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      select: {
        courseId: true,
        startsAt: true,
        endsAt: true,
        course: { select: { provider: { select: { id: true, parentId: true } } } },
      },
    })
    if (!cohort?.courseId) throw new NotFoundException('Item not found')
    let enrollmentId: string | undefined
    if (userId) {
      const e = await this.prisma.enrollment.findUnique({
        where: { cohortId_userId: { cohortId, userId } },
        select: { id: true, status: true },
      })
      enrollmentId = e?.id
      if (!e || e.status === 'withdrawn') throw new NotFoundException('You are not in this cohort')
      if (cohortStatus(cohort.startsAt, cohort.endsAt) !== 'running')
        throw new ConflictException('This cohort is not open.')
    }
    const item = await this.prisma.courseItem.findUnique({
      where: { id: itemId },
      include: { module: { select: { courseId: true } } },
    })
    if (!item || item.module.courseId !== cohort.courseId || item.type !== 'tool')
      throw new NotFoundException('Item not found')
    const config = (item.config ?? {}) as { toolId?: unknown; ref?: unknown }
    const tool = scoring ? toolAnyById(config.toolId) : toolById(config.toolId)
    if (!tool || typeof config.ref !== 'string')
      throw new ConflictException('This item has no valid tool')
    // The tool receives learners' identities, so a program may only use one it has been approved for.
    if (!scoring && (!cohort.course || !toolAllowedFor(tool, scopeOf(cohort.course.provider))))
      throw new ConflictException(
        'This tool is not available to this program. Tell your instructor.'
      )
    return { tool, ref: config.ref, config: item.config, label: item.label, enrollmentId }
  }

  private signHint(claims: {
    userId: string
    cohortId: string
    itemId: string
    returnOrigin?: string
    mode?: 'review'
  }): string {
    const body = b64url(JSON.stringify({ ...claims, jti: newId(), exp: nowS() + HINT_TTL_S }))
    const mac = createHmac('sha256', this.hintSecret).update(body).digest('base64url')
    return `${body}.${mac}`
  }

  private readHint(hint: string) {
    const [body, mac, extra] = hint.split('.')
    if (!body || !mac || extra !== undefined)
      throw new HttpException('Invalid lti_message_hint', 400)
    const want = createHmac('sha256', this.hintSecret).update(body).digest()
    const got = Buffer.from(mac, 'base64url')
    if (got.length !== want.length || !timingSafeEqual(got, want))
      throw new HttpException('Invalid lti_message_hint', 400)
    let claims: {
      userId?: unknown
      cohortId?: unknown
      itemId?: unknown
      returnOrigin?: unknown
      mode?: unknown
      jti?: unknown
      exp?: unknown
    }
    try {
      claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    } catch {
      throw new HttpException('Invalid lti_message_hint', 400)
    }
    const { userId, cohortId, itemId, returnOrigin, mode, jti, exp } = claims
    if (
      typeof userId !== 'string' ||
      typeof cohortId !== 'string' ||
      typeof itemId !== 'string' ||
      (returnOrigin !== undefined && typeof returnOrigin !== 'string') ||
      (mode !== undefined && mode !== 'review') ||
      typeof jti !== 'string' ||
      typeof exp !== 'number'
    )
      throw new HttpException('Invalid lti_message_hint', 400)
    if (exp < nowS()) throw new HttpException('lti_message_hint expired', 400)
    // Re-validated: a hint is signed by us, but the host rule is the single source of truth.
    const origin =
      typeof returnOrigin === 'string' && isLearnOrigin(returnOrigin, learnUrl())
        ? returnOrigin
        : undefined
    return { userId, cohortId, itemId, returnOrigin: origin, mode, jti, exp }
  }

  /** OIDC authentication request from a tool: replies with a form that posts the signed id_token. */
  async authenticate(p: Params, ip = 'unknown'): Promise<string> {
    await this.limit('platform-auth', ip, AUTH_PER_MINUTE_PER_IP)
    if (str(p.scope) !== 'openid') throw new HttpException('scope must be openid', 400)
    if (str(p.response_type) !== 'id_token')
      throw new HttpException('response_type must be id_token', 400)
    if (p.response_mode !== undefined && str(p.response_mode) !== 'form_post')
      throw new HttpException('response_mode must be form_post', 400)
    if (p.prompt !== undefined && str(p.prompt) !== 'none')
      throw new HttpException('prompt must be none', 400)
    const state = str(p.state)
    const nonce = str(p.nonce)
    if (!state || !nonce) throw new HttpException('state and nonce are required', 400)

    const tool = registeredTools().find((t) => t.clientId === str(p.client_id))
    if (!tool) throw new HttpException('Unknown client_id', 400)
    if (str(p.redirect_uri) !== tool.launchUrl)
      throw new HttpException('redirect_uri does not match the registered launch URL', 400)

    const hint = this.readHint(str(p.lti_message_hint))
    if (str(p.login_hint) !== hint.userId) throw new HttpException('login_hint mismatch', 400)
    // The learner must still be allowed in, and the hint must belong to a tool item that launches this client; it is good for one use.
    const {
      tool: itemTool,
      ref,
      config: itemConfig,
      label: itemLabel,
    } = await this.toolItem(hint.cohortId, hint.itemId, hint.userId)
    if (itemTool.clientId !== tool.clientId)
      throw new HttpException('This item does not launch that client', 400)
    // An assessment's attempts may have run out since the hint was minted (another tab); a hint is not a way around the cap.
    let used = 0
    if (hint.mode === 'review') {
      await this.assertCanReview(
        hint.userId,
        hint.cohortId,
        hint.itemId,
        itemTool,
        itemConfig,
        itemLabel
      )
      used = await this.attemptsUsed(hint.userId, hint.cohortId, hint.itemId)
    } else if (itemTool.kind === 'assessment') {
      const { maxAttempts } = assessmentLimits(itemConfig)
      used = await this.attemptsUsed(hint.userId, hint.cohortId, hint.itemId)
      if (used >= maxAttempts)
        throw new ConflictException(`You have used all ${maxAttempts} attempts.`)
    }
    if (!(await this.store.claim('lti-hint', hint.jti, Math.max(1, hint.exp - nowS() + 5))))
      throw new HttpException('lti_message_hint was already used', 400)

    // Assessment tools also learn which attempt this is (the next one after those scored) and the time limit.
    let custom: Record<string, unknown> = { ref, tool: itemTool.toolId }
    if (hint.mode === 'review') {
      // the latest attempt is the one reviewed; the tool must not start anything
      custom = { ...custom, attempt: used, review: true }
    } else if (itemTool.kind === 'assessment') {
      const { timeLimitMinutes } = assessmentLimits(itemConfig)
      custom = { ...custom, attempt: used + 1, ...(timeLimitMinutes ? { timeLimitMinutes } : {}) }
    }
    const brand = await this.brandOf(hint.cohortId)
    const reg = platformRegistration()
    const iat = nowS()
    const lineitem = `${apiBase()}/lti/platform/ags/${hint.cohortId}/lineitems/${hint.itemId}`
    const idToken = signJwt(
      {
        iss: reg.issuer,
        aud: tool.clientId,
        sub: hint.userId,
        iat,
        exp: iat + ID_TOKEN_TTL_S,
        nonce,
        jti: newId(),
        [CLAIM.messageType]: 'LtiResourceLinkRequest',
        [CLAIM.version]: '1.3.0',
        [CLAIM.deploymentId]: tool.deploymentId,
        [CLAIM.targetLinkUri]: tool.launchUrl,
        [CLAIM.resourceLink]: { id: hint.itemId },
        [CLAIM.context]: { id: hint.cohortId },
        [CLAIM.roles]: [LEARNER_ROLE],
        [CLAIM.custom]: custom,
        [CLAIM.launchPresentation]: {
          document_target: 'window',
          return_url: `${hint.returnOrigin ?? learnUrl()}/lms/learning/${hint.cohortId}/${hint.itemId}`,
        },
        [CLAIM.agsEndpoint]: { scope: [AGS_SCOPE_SCORE], lineitem },
        ...(brand ? { [BRAND_CLAIM]: brand } : {}),
      },
      this.keys
    )
    return autoSubmitForm(tool.launchUrl, { id_token: idToken, state })
  }

  /** The cohort's institution brand, else the nearest ancestor's valid one (at most 5 hops up). */
  private async brandOf(cohortId: string) {
    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      select: { institutionId: true },
    })
    let id: string | null | undefined = cohort?.institutionId
    for (let hop = 0; id && hop <= MAX_BRAND_HOPS; hop++) {
      const inst: { brand: unknown; parentId: string | null } | null =
        await this.prisma.institution.findUnique({
          where: { id },
          select: { brand: true, parentId: true },
        })
      if (!inst) return null
      const brand = sanitizeBrand(inst.brand)
      if (brand) return brand
      id = inst.parentId
    }
    return null
  }

  // ── token ───────────────────────────────────────────────────────────────────

  private oauthError(error: string, description: string, status = 400): never {
    throw new HttpException({ error, error_description: description }, status)
  }

  private toolKeyResolver(tool: ToolRegistration) {
    let resolve = this.toolKeys.get(tool.jwksUrl)
    if (!resolve) {
      resolve = jwksKeyResolver(tool.jwksUrl, (...a) => this.fetchImpl(...a))
      this.toolKeys.set(tool.jwksUrl, resolve)
    }
    return resolve
  }

  /** OAuth2 client_credentials with a signed client assertion; returns a platform-signed access token. */
  async token(p: Params) {
    if (str(p.grant_type) !== 'client_credentials')
      this.oauthError('unsupported_grant_type', 'grant_type must be client_credentials')
    if (str(p.client_assertion_type) !== ASSERTION_TYPE)
      this.oauthError('invalid_request', 'client_assertion_type is not supported')
    const assertion = str(p.client_assertion)
    const claimed = decodePayload(assertion)
    const tool = managedTools().find((t) => t.clientId === str(claimed?.iss))
    if (!tool) this.oauthError('invalid_client', 'Unknown client', 401)
    const registered = tool as ToolRegistration

    const reg = platformRegistration()
    let payload: JwtClaims
    try {
      payload = await verifyJwt(assertion, {
        issuer: registered.clientId,
        audience: reg.tokenUrl,
        keyFor: this.toolKeyResolver(registered),
      })
    } catch (err) {
      if (err instanceof LtiError)
        this.oauthError('invalid_client', 'Client authentication failed', 401)
      throw err
    }
    if (payload.sub !== registered.clientId)
      this.oauthError('invalid_client', 'sub must be the client id', 401)
    if (payload.exp - nowS() > MAX_ASSERTION_LIFETIME_S)
      this.oauthError('invalid_client', 'client_assertion lifetime is too long', 401)
    if (typeof payload.jti !== 'string' || !payload.jti)
      this.oauthError('invalid_client', 'jti is required', 401)
    // Only a signature-checked jti is remembered, so a stranger cannot burn a tool's ids.
    await this.limit('platform-token', registered.clientId, TOKEN_PER_MINUTE_PER_CLIENT, 'oauth')
    const assertionTtl = Math.max(1, Math.ceil(payload.exp + 60 - nowS()))
    if (
      !(await this.store.claim(
        'lti-assertion',
        `${registered.clientId}:${payload.jti}`,
        assertionTtl
      ))
    )
      this.oauthError('invalid_client', 'client_assertion was already used', 401)

    const granted = str(p.scope)
      .split(/\s+/)
      .filter((s) => s === AGS_SCOPE_SCORE)
    if (granted.length === 0)
      this.oauthError('invalid_scope', 'Only the AGS score scope is offered')
    const scope = granted.join(' ')
    const iat = nowS()
    return {
      access_token: signJwt(
        {
          iss: reg.issuer,
          sub: registered.clientId,
          aud: registered.clientId,
          iat,
          exp: iat + ACCESS_TOKEN_TTL_S,
          jti: newId(),
          scope,
        },
        this.keys
      ),
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_S,
      scope,
    }
  }

  // ── scores ──────────────────────────────────────────────────────────────────

  /** The registered tool a platform-issued Bearer token with the score scope was issued to. */
  private async clientOf(authorization: string | undefined): Promise<ToolRegistration> {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
    if (!token) throw new HttpException('Missing Bearer token', 401)
    const aud = decodePayload(token)?.aud
    const tool = managedTools().find((t) => t.clientId === aud)
    if (!tool) throw new HttpException('Invalid token', 401)
    let payload: JwtClaims
    try {
      payload = await verifyJwt(token, {
        issuer: platformRegistration().issuer,
        audience: tool.clientId,
        keyFor: async (kid) => this.jwks().keys.find((k) => k.kid === kid),
      })
    } catch (err) {
      if (err instanceof LtiError) throw new HttpException('Invalid token', 401)
      throw err
    }
    if (payload.sub !== tool.clientId) throw new HttpException('Invalid token', 401)
    if (!str(payload.scope).split(/\s+/).includes(AGS_SCOPE_SCORE))
      throw new HttpException('Token lacks the score scope', 403)
    return tool
  }

  /** An LTI AGS score for a tool item. Returns nothing the tool does not already know. */
  async receiveScore(
    authorization: string | undefined,
    cohortId: string,
    itemId: string,
    body: unknown
  ): Promise<{ recorded: true }> {
    const client = await this.clientOf(authorization)
    const { tool } = await this.toolItem(cohortId, itemId, undefined, true)
    if (tool.clientId !== client.clientId)
      throw new HttpException('Token is not for this tool', 403)

    const s = (body ?? {}) as Record<string, unknown>
    if (typeof s.userId !== 'string' || !s.userId)
      throw new HttpException('userId is required', 400)
    const given = s.scoreGiven
    const max = s.scoreMaximum
    if (
      typeof given !== 'number' ||
      typeof max !== 'number' ||
      !Number.isFinite(given) ||
      !Number.isFinite(max) ||
      max <= 0 ||
      given < 0 ||
      given > max
    )
      throw new HttpException('scoreGiven and scoreMaximum must be numbers, 0 <= given <= max', 422)
    if (s.activityProgress !== 'Completed' || s.gradingProgress !== 'FullyGraded')
      throw new HttpException('Only a Completed, FullyGraded score is recorded', 422)
    const reportedMs = typeof s.timestamp === 'string' ? Date.parse(s.timestamp) : NaN
    if (!ISO_TIMESTAMP.test(str(s.timestamp)) || Number.isNaN(reportedMs))
      throw new HttpException('timestamp must be an ISO 8601 date-time', 422)
    if (reportedMs > Date.now() + MAX_SCORE_CLOCK_AHEAD_MS)
      throw new HttpException('timestamp is in the future', 422)
    const dims = s[DIMENSIONS_FIELD]
    await this.learner.recordToolResult(s.userId, cohortId, itemId, {
      scorePct: Math.round((given / max) * 100),
      reportedAt: s.timestamp as string,
      ...(dims && typeof dims === 'object' ? { dimensions: dims } : {}),
    })
    return { recorded: true }
  }
}

/** A JWT's claims without checking anything; used only to pick which key and client to verify with. */
function decodePayload(token: string): JwtClaims | undefined {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
  } catch {
    return undefined
  }
}
