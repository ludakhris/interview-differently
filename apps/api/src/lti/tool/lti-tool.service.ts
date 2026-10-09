import { createHmac, timingSafeEqual } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { assertLtiProductionConfig, isLearnOrigin, loadSigningKeys } from '../lti-env'
import { LTI_STORE } from '../lti-store'
import type { LtiStore } from '../lti-store'
import { InterviewEngineService } from '../../interview-engine/interview-engine.service'
import {
  averageScore,
  DEFAULT_RUBRIC,
  MAX_ANSWER_CHARS,
  type ScoredAnswer,
} from '../../interview-engine/interview-engine'
import { interviewOf, type InterviewSource } from '../../interview-engine/interview-scenario'
import { overall } from '../../assessments/assessments.service'
import type { SectionScore } from '../../assessments/assessment.types'
import { sanitizeBrand } from '../lti-brand'
import {
  AGS_SCOPE_SCORE,
  BRAND_CLAIM,
  CLAIM,
  DIMENSIONS_FIELD,
  jwksKeyResolver,
  jwksOf,
  LtiError,
  newId,
  SCORE_CONTENT_TYPE,
  signJwt,
  verifyJwt,
  type KeyPair,
} from '../lti-spec'
import {
  idWebUrl,
  launchUrl,
  learnUrl,
  platformRegistration,
  returnUrl,
  useStubScoring,
} from './lti-tool.config'
import {
  BUILT_IN_ID,
  keepsBareSub,
  PlatformRegistryService,
  type ToolPlatform,
} from './platform-registry.service'
import { errorPage, interviewPage, resultPage } from './lti-tool.html'
import {
  SESSION_TTL_S,
  signSession,
  sqlDatasetSlugs,
  toolSecret,
  type LtiSession,
} from './lti-session'

/** Bounds for the launch's custom `attempt` and `timeLimitMinutes` claims. */
const MAX_ATTEMPT = 100
const MIN_TIME_LIMIT_MIN = 5
const MAX_TIME_LIMIT_MIN = 240
/** Slack past an assessment's time limit before its LTI session expires. */
const SESSION_GRACE_S = 15 * 60
const STATE_TTL_S = 10 * 60
const SUBMISSION_TTL_S = 30 * 60
const ASSERTION_TTL_S = 5 * 60
/** How long a submission is locked while it is being scored and posted. */
const IN_FLIGHT_TTL_S = 5 * 60
/** A stalled platform must not hold the single-use claims until they expire. */
export const PLATFORM_FETCH_TIMEOUT_MS = 10_000
const RATE_WINDOW_S = 60
/** How long a sent result stays consumed. */
const RESULT_TTL_S = 30 * 24 * 60 * 60
const RESULT_CLOCK_SKEW_MS = 60 * 1000
const LOGIN_PER_MINUTE_PER_IP = 30
const SUBMIT_PER_MINUTE_PER_LEARNER = 10
const COMPLETE_PER_MINUTE_PER_LEARNER = 10
const DELIVERY_LOCK_TTL_S = 10
const DELIVERY_LOCK_TRIES = 20
const DELIVERY_LOCK_WAIT_MS = 100

interface SubmissionClaims {
  sub: string
  /** See LtiSession: the launching platform, and its own `sub` when `sub` was prefixed. */
  platformId?: string
  platformSub?: string
  jti: string
  lineitem: string
  ref: string
  /** Where the learner returns to: the launch's return_url (http or https only), else none. */
  returnUrl?: string
  exp: number
}

/** A protocol error page that links the learner back to where they launched from. */
export class LtiReturnError extends LtiError {
  constructor(
    message: string,
    status: number,
    readonly returnUrl: string
  ) {
    super(message, status)
  }
}

/**
 * The claim's return_url when it is an http(s) URL on the platform's issuer origin or, for the
 * LearnDifferently platform only, the learn origin or a tenant subdomain of the learn host (https);
 * anything else (javascript:, relative, junk, another site) is ignored.
 */
export function safeReturnUrl(value: unknown, issuer: string | undefined): string | undefined {
  if (!issuer) return undefined
  if (typeof value !== 'string') return undefined
  try {
    const u = new URL(value)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined
    const issuerOrigin = new URL(issuer).origin
    const learn = issuerOrigin === new URL(platformRegistration().issuer).origin
    return u.origin === issuerOrigin || (learn && isLearnOrigin(value, learnUrl()))
      ? u.toString()
      : undefined
  } catch {
    return undefined
  }
}

@Injectable()
export class LtiToolService {
  /** Injectable for tests. */
  fetchImpl: typeof fetch = (...args) => fetch(...args)
  /** Injectable for tests. */
  platformTimeoutMs = PLATFORM_FETCH_TIMEOUT_MS
  now: () => number = () => Date.now()
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))

  private readonly keys: KeyPair
  /** The key `keys` replaced (LTI_TOOL_PREVIOUS_PRIVATE_KEY): published, never signed with. */
  private readonly previousKeys?: KeyPair
  private readonly secret: string
  /** One cached key resolver per platform key-set URL. */
  private readonly platformKeys = new Map<string, ReturnType<typeof jwksKeyResolver>>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: InterviewEngineService,
    @Inject(LTI_STORE) private readonly store: LtiStore,
    private readonly platforms: PlatformRegistryService
  ) {
    assertLtiProductionConfig()
    const { current, previous } = loadSigningKeys(
      'LTI_TOOL_PRIVATE_KEY',
      'LTI_TOOL_PREVIOUS_PRIVATE_KEY'
    )
    this.keys = current
    this.previousKeys = previous
    this.secret = toolSecret()
  }

  jwks() {
    return jwksOf(...(this.previousKeys ? [this.keys, this.previousKeys] : [this.keys]))
  }

  /** Counts a hit and throws a 429 page error over `limit` in the window. */
  private async limit(scope: string, key: string, limit: number) {
    if ((await this.store.count(`rl:${scope}`, key, RATE_WINDOW_S)) > limit)
      throw new LtiError('Too many requests. Wait a minute and try again.', 429)
  }

  /** Third-party initiated login: stores state and nonce, returns the platform auth redirect and the state. */
  async login(
    p: Record<string, string | undefined>,
    ip = 'unknown'
  ): Promise<{ url: string; state: string }> {
    await this.limit('tool-login', ip, LOGIN_PER_MINUTE_PER_IP)
    const reg = await this.platforms.forLogin(p.iss, p.client_id)
    if (!reg) throw new LtiError('Unknown platform or client')
    if (!reg.enabled)
      throw new LtiError(
        'This platform has not been approved for Interview Differently yet. Ask its administrator to approve it.',
        403
      )
    if (!p.login_hint) throw new LtiError('Missing login_hint')
    if (!p.lti_message_hint) throw new LtiError('Missing lti_message_hint')
    if (p.lti_deployment_id && p.lti_deployment_id !== reg.deploymentId) {
      throw new LtiError('Unknown deployment')
    }
    const state = newId()
    const nonce = newId()
    await this.store.put('lti-login', state, { nonce, platformId: reg.id }, STATE_TTL_S)
    const url = new URL(reg.authUrl)
    const q = url.searchParams
    q.set('scope', 'openid')
    q.set('response_type', 'id_token')
    q.set('client_id', reg.clientId)
    q.set('redirect_uri', launchUrl())
    q.set('login_hint', p.login_hint)
    q.set('lti_message_hint', p.lti_message_hint)
    q.set('state', state)
    q.set('nonce', nonce)
    q.set('response_mode', 'form_post')
    q.set('prompt', 'none')
    return { url: url.toString(), state }
  }

  /**
   * Verifies the launch and returns the typed interview page, or `{ redirect }` to the web app
   * for a scenario that is played there (text, or immersive with an interviewer persona). `cookieState` is the `lti_state` cookie the
   * login set: it must equal the posted state, so only the browser that started the login can finish it.
   */
  async launch(
    idToken: string | undefined,
    state: string | undefined,
    cookieState: string | undefined
  ): Promise<string | { redirect: string }> {
    if (!state || cookieState !== state)
      throw new LtiError('Login state does not match this browser')
    // single use, even if the rest fails
    const entry = await this.store.take<{ nonce: string; platformId?: string }>('lti-login', state)
    if (!entry) throw new LtiError('Unknown or expired state')
    if (!idToken) throw new LtiError('Missing id_token')
    // The platform is the one the login was started for, never one the (unverified) token names.
    const reg = await this.platforms.forLaunch(entry.platformId)
    if (!reg || !reg.enabled) throw new LtiError('Unknown platform or client')
    const claims = await verifyJwt(idToken, {
      issuer: reg.issuer,
      audience: reg.clientId,
      keyFor: this.keysFor(reg.jwksUrl),
      nonce: entry.nonce,
      now: () => this.now() / 1000,
    })
    if (claims[CLAIM.messageType] !== 'LtiResourceLinkRequest') {
      throw new LtiError('Unsupported message_type')
    }
    if (claims[CLAIM.version] !== '1.3.0') throw new LtiError('Unsupported LTI version')
    if (claims[CLAIM.deploymentId] !== reg.deploymentId) throw new LtiError('Unknown deployment')
    const ref = claims[CLAIM.custom]?.ref
    if (typeof ref !== 'string' || !ref) throw new LtiError('Missing custom ref')
    const ags = claims[CLAIM.agsEndpoint]
    const lineitem = ags?.lineitem
    if (typeof lineitem !== 'string' || !lineitem || !ags.scope?.includes(AGS_SCOPE_SCORE)) {
      throw new LtiError('Launch does not allow returning a score')
    }
    if (!sameOrigin(lineitem, reg.issuer))
      throw new LtiError('Score endpoint is not on the platform')
    if (typeof claims.sub !== 'string' || !claims.sub) throw new LtiError('Missing sub')
    const tool = claims[CLAIM.custom]?.tool
    if (tool !== undefined && tool !== 'id-interview' && tool !== 'id-assessment')
      throw new LtiError('Unsupported tool')
    // never trust the claim: the same validator the platform used, again
    const brand = sanitizeBrand(claims[BRAND_CLAIM])
    const sessionReturn = safeReturnUrl(claims[CLAIM.launchPresentation]?.return_url, reg.issuer)
    const who = identityOf(reg, claims.sub)
    if (tool === 'id-assessment') {
      return this.launchAssessment({
        ref,
        who,
        lineitem,
        returnUrl: sessionReturn,
        brand,
        contextId: claims[CLAIM.context]?.id,
        resourceLinkId: claims[CLAIM.resourceLink]?.id,
        attempt: claims[CLAIM.custom]?.attempt,
        timeLimitMinutes: claims[CLAIM.custom]?.timeLimitMinutes,
        review: claims[CLAIM.custom]?.review === true,
      })
    }
    const row = await this.prisma.scenario.findUnique({ where: { scenarioId: ref } })
    if (!row || row.status !== 'published') throw new LtiError('Interview not found', 404)
    if (!isTypedPlaceholder(row.data)) {
      const token = signSession({
        ...who,
        ref,
        lineitem,
        returnUrl: sessionReturn,
        datasets: sqlDatasetSlugs(row.data),
        ...(brand ? { brand } : {}),
        jti: newId(),
        iat: Math.floor(this.now() / 1000),
        exp: Math.floor(this.now() / 1000) + SESSION_TTL_S,
      })
      // the token rides in the fragment, which browsers never send to a server
      return { redirect: `${idWebUrl()}/lti/play/${encodeURIComponent(ref)}#session=${token}` }
    }
    const interview = await this.loadInterview(ref)
    const submission = this.signSubmission({
      ...who,
      jti: newId(),
      lineitem,
      ref,
      returnUrl: sessionReturn,
      exp: Math.floor(this.now() / 1000) + SUBMISSION_TTL_S,
    })
    return interviewPage({
      action: new URL('submit', launchUrl()).toString(),
      submission,
      role: interview.role,
      questions: interview.questions,
    })
  }

  /**
   * An assessment launch: `ref` is the Assessment slug (else its id). The delivery for this
   * (assessment, cohort, resource link) is found or created, and the learner is sent to the web
   * app with a session pinned to it.
   */
  private async launchAssessment(l: {
    ref: string
    who: Identity
    lineitem: string
    returnUrl: string | undefined
    brand: ReturnType<typeof sanitizeBrand>
    contextId: unknown
    resourceLinkId: unknown
    attempt: unknown
    timeLimitMinutes: unknown
    /** Look at the submitted attempt instead of taking one: nothing is created or started. */
    review?: boolean
  }): Promise<{ redirect: string }> {
    // never trust the claim: both are checked strictly before anything is looked up or created
    const attempt = l.attempt === undefined ? 1 : l.attempt
    if (
      typeof attempt !== 'number' ||
      !Number.isInteger(attempt) ||
      attempt < 1 ||
      attempt > MAX_ATTEMPT
    ) {
      throw new LtiError(`Invalid attempt number (an integer from 1 to ${MAX_ATTEMPT})`)
    }
    const limit = l.timeLimitMinutes
    if (
      limit !== undefined &&
      (typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < MIN_TIME_LIMIT_MIN ||
        limit > MAX_TIME_LIMIT_MIN)
    ) {
      throw new LtiError(
        `Invalid time limit (whole minutes from ${MIN_TIME_LIMIT_MIN} to ${MAX_TIME_LIMIT_MIN})`
      )
    }
    const include = { dataset: { select: { slug: true } } }
    const assessment =
      (await this.prisma.assessment.findUnique({ where: { slug: l.ref }, include })) ??
      (await this.prisma.assessment.findUnique({ where: { id: l.ref }, include }))
    if (!assessment) throw new LtiError('Assessment not found', 404)
    // the context is an LD cohort id; it only becomes a cohort here if that row exists
    const contextId = typeof l.contextId === 'string' && l.contextId ? l.contextId : null
    const cohort = contextId
      ? await this.prisma.cohort.findUnique({ where: { id: contextId }, select: { id: true } })
      : null
    const resourceLinkId =
      typeof l.resourceLinkId === 'string' && l.resourceLinkId ? l.resourceLinkId : 'default'
    const baseLabel = `lti:${resourceLinkId}`
    // each attempt number is its own delivery (one attempt per delivery and learner); attempt 1
    // keeps the original label so deliveries created before retakes existed still match
    if (attempt > 1) {
      const submitted = await this.submittedAttempts(
        l.who.sub,
        assessment.id,
        cohort?.id ?? null,
        baseLabel
      )
      if (attempt > submitted + 1) {
        throw new LtiError('That attempt is not available yet. Finish your earlier attempt first.')
      }
    }
    const label = attempt === 1 ? baseLabel : `${baseLabel}#${attempt}`
    const delivery = l.review
      ? await this.findSubmittedDelivery(assessment.id, cohort?.id ?? null, label, l.who.sub)
      : await this.findOrCreateDelivery(assessment.id, cohort?.id ?? null, label, limit)
    const iat = Math.floor(this.now() / 1000)
    // the session must outlive the delivery's own time limit (the stored one, not this claim's)
    const ttl = Math.max(
      SESSION_TTL_S,
      delivery.timeLimitMinutes ? delivery.timeLimitMinutes * 60 + SESSION_GRACE_S : 0
    )
    const token = signSession({
      ...l.who,
      ref: assessment.slug,
      lineitem: l.lineitem,
      returnUrl: l.returnUrl,
      datasets: assessment.dataset ? [assessment.dataset.slug] : [],
      deliveryId: delivery.id,
      ...(l.review ? { review: true } : {}),
      ...(l.brand ? { brand: l.brand } : {}),
      jti: newId(),
      iat,
      exp: iat + ttl,
    })
    return {
      redirect: `${idWebUrl()}/lti/assessment/${encodeURIComponent(delivery.id)}#session=${token}`,
    }
  }

  /**
   * How many attempts the learner has submitted on this item's deliveries: label `base` (attempt 1)
   * or `base#<n>`. The label prefix match is narrowed in code so another item whose id happens to
   * start with `base#` is not counted.
   */
  private async submittedAttempts(
    userId: string,
    assessmentId: string,
    cohortId: string | null,
    base: string
  ): Promise<number> {
    const rows = await this.prisma.assessmentAttempt.findMany({
      where: {
        userId,
        submittedAt: { not: null },
        delivery: { assessmentId, cohortId, label: { startsWith: base } },
      },
      select: { delivery: { select: { label: true } } },
    })
    return rows.filter((r) => {
      const rest = r.delivery.label.slice(base.length)
      return rest === '' || /^#[1-9]\d*$/.test(rest)
    }).length
  }

  /**
   * One delivery per (assessment, cohort, label). There is no unique index to lean on, so the
   * store claim is a short lock around find-then-create; a launch that loses the lock waits for the
   * winner's row and fails with a 503 page if it never appears.
   */
  /** The delivery whose attempt this learner submitted, for a review launch. Never creates one. */
  private async findSubmittedDelivery(
    assessmentId: string,
    cohortId: string | null,
    label: string,
    userId: string
  ): Promise<{ id: string; timeLimitMinutes: number | null }> {
    const d = await this.prisma.assessmentDelivery.findFirst({
      where: {
        assessmentId,
        cohortId,
        label,
        attempts: { some: { userId, submittedAt: { not: null } } },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, timeLimitMinutes: true },
    })
    if (!d) throw new LtiError('There is no submitted attempt to review.', 404)
    return d
  }

  private async findOrCreateDelivery(
    assessmentId: string,
    cohortId: string | null,
    label: string,
    timeLimitMinutes?: number
  ): Promise<{ id: string; timeLimitMinutes: number | null }> {
    const find = () =>
      this.prisma.assessmentDelivery.findFirst({
        where: { assessmentId, cohortId, label },
        orderBy: { createdAt: 'asc' },
        select: { id: true, timeLimitMinutes: true },
      })
    const found = await find()
    if (found) return found
    const lockKey = `${assessmentId}:${cohortId ?? '-'}:${label}`
    for (let i = 0; i < DELIVERY_LOCK_TRIES; i++) {
      if (await this.store.claim('lti-delivery', lockKey, DELIVERY_LOCK_TTL_S)) {
        try {
          const again = await find()
          if (again) return again
          const created = await this.prisma.assessmentDelivery.create({
            data: {
              assessmentId,
              cohortId,
              label,
              ...(timeLimitMinutes === undefined ? {} : { timeLimitMinutes }),
            },
            select: { id: true, timeLimitMinutes: true },
          })
          return created
        } finally {
          await this.store.release('lti-delivery', lockKey)
        }
      }
      await this.sleep(DELIVERY_LOCK_WAIT_MS)
      const other = await find()
      if (other) return other
    }
    throw new LtiError('The assessment is being set up. Please try again.', 503)
  }

  /** Scores the answers, posts the score to the platform, renders the result or an error. */
  async submit(
    body: Record<string, string | undefined>
  ): Promise<{ status: number; html: string }> {
    const claims = this.verifySubmission(body.submission)
    // already sanitized when it was signed: again, against the platform it names
    claims.returnUrl = safeReturnUrl(
      claims.returnUrl,
      (await this.platforms.forScore(claims.platformId))?.issuer
    )
    try {
      return await this.submitVerified(claims, body)
    } catch (err) {
      if (err instanceof LtiError && !(err instanceof LtiReturnError))
        throw new LtiReturnError(err.message, err.status, claims.returnUrl ?? returnUrl())
      throw err
    }
  }

  private async submitVerified(
    claims: SubmissionClaims,
    body: Record<string, string | undefined>
  ): Promise<{ status: number; html: string }> {
    await this.limit('tool-submit', claims.sub, SUBMIT_PER_MINUTE_PER_LEARNER)
    // The claim is the in-flight lock; after a successful post it is replaced by a "consumed"
    // entry that lasts as long as the token could still be presented.
    if (!(await this.store.claim('lti-submission', claims.jti, IN_FLIGHT_TTL_S))) {
      throw new LtiError('This interview was already submitted. Relaunch it from your course.', 409)
    }
    let posted = false
    try {
      const result = await this.scoreAndPost(claims, body)
      if (result.status === 200) {
        posted = true // from here the claim stays, even if renewing it below fails
        const ttl = Math.max(1, Math.ceil(claims.exp - this.now() / 1000) + 60)
        await this.store.put('lti-submission', claims.jti, true, ttl)
      }
      return result
    } finally {
      if (!posted) await this.store.release('lti-submission', claims.jti)
    }
  }

  private async scoreAndPost(
    claims: SubmissionClaims,
    body: Record<string, string | undefined>
  ): Promise<{ status: number; html: string }> {
    const interview = await this.loadInterview(claims.ref)
    const answers = interview.questions.map((_, i) => (body[`answer_${i}`] ?? '').trim())
    if (answers.some((a) => !a)) throw new LtiError('Answer every question')
    if (answers.some((a) => a.length > MAX_ANSWER_CHARS)) {
      throw new LtiError(`Keep each answer under ${MAX_ANSWER_CHARS} characters`)
    }
    const scored = await this.score(interview, answers)
    const score = averageScore(scored)
    const dimensions = this.dimensionAverages(scored)
    try {
      await this.postScore(claims, score, dimensions)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error'
      return {
        status: 502,
        html: errorPage(
          `Your answers were scored, but the score could not be sent to your course (${msg}). Please try again.`,
          claims.returnUrl ?? returnUrl()
        ),
      }
    }
    return {
      status: 200,
      html: resultPage({
        score,
        dimensions,
        answers: scored,
        questions: interview.questions,
        returnUrl: claims.returnUrl ?? returnUrl(),
      }),
    }
  }

  private async loadInterview(ref: string): Promise<InterviewSource> {
    const row = await this.prisma.scenario.findUnique({ where: { scenarioId: ref } })
    const interview = row ? interviewOf(row.data) : undefined
    if (!interview || interview.questions.length === 0) {
      throw new LtiError('Interview not found', 404)
    }
    return interview
  }

  private async score(interview: InterviewSource, answers: string[]): Promise<ScoredAnswer[]> {
    const rubric = interview.rubric.length > 0 ? interview.rubric : DEFAULT_RUBRIC
    if (useStubScoring()) {
      return answers.map((a) => {
        const band = a.length < 50 ? 20 : a.length < 200 ? 50 : a.length < 500 ? 70 : 85
        return {
          score: band,
          dimensions: rubric.map((r) => ({ dimension: r.name, score: band })),
          feedback: 'Stub scoring: based on answer length only.',
          strengths: '',
          development: '',
        }
      })
    }
    return this.engine.scoreAnswers({
      role: interview.role,
      rubric,
      questions: interview.questions,
      answers,
    })
  }

  private dimensionAverages(scored: ScoredAnswer[]) {
    const names = scored[0]?.dimensions.map((d) => d.dimension) ?? []
    return names.map((dimension) => ({
      dimension,
      score: averageScore(
        scored.map((s) => ({
          score: s.dimensions.find((d) => d.dimension === dimension)?.score ?? 0,
        }))
      ),
    }))
  }

  /**
   * Posts the score of a finished text-scenario play (read from the stored result, never from the
   * client) to the session's lineitem. Single use per session; a failed post can be retried.
   */
  async complete(
    session: LtiSession,
    resultId: unknown
  ): Promise<{ score: number; returnUrl: string }> {
    if (typeof resultId !== 'string' || !resultId) throw new LtiError('Missing resultId')
    await this.limit('tool-complete', session.sub, COMPLETE_PER_MINUTE_PER_LEARNER)
    const result = await this.prisma.simulationResult.findUnique({
      where: { id: resultId },
      include: { dimensionScores: true },
    })
    if (!result || result.userId !== session.sub || result.scenarioId !== session.ref) {
      throw new LtiError('Result not found', 404)
    }
    // a result recorded before this session began cannot be the work done in it
    if (result.completedAt.getTime() < session.iat * 1000 - RESULT_CLOCK_SKEW_MS) {
      throw new LtiError('This result was not completed in this session', 400)
    }
    if (!(await this.store.claim('lti-complete', session.jti, IN_FLIGHT_TTL_S))) {
      throw new LtiError('This score was already sent. Relaunch it from your course.', 409)
    }
    let posted = false
    let resultClaimed = false
    try {
      // one result is sent once, whichever session it comes from
      resultClaimed = await this.store.claim('lti-result', resultId, RESULT_TTL_S)
      if (!resultClaimed) throw new LtiError('This result was already sent.', 409)
      // overallScore is already 0-100 (the rounded mean of the 0-100 dimension scores)
      const score = Math.round(result.overallScore)
      try {
        await this.postScore(
          session,
          score,
          result.dimensionScores.map((d) => ({ dimension: d.dimension, score: d.score }))
        )
      } catch {
        throw new LtiError('The score could not be sent to your course. Please try again.', 502)
      }
      posted = true
      const ttl = Math.max(1, Math.ceil(session.exp - this.now() / 1000) + 60)
      await this.store.put('lti-complete', session.jti, true, ttl)
      return { score, returnUrl: session.returnUrl ?? returnUrl() }
    } finally {
      if (!posted) {
        await this.store.release('lti-complete', session.jti)
        if (resultClaimed) await this.store.release('lti-result', resultId)
      }
    }
  }

  /**
   * Scores a finished immersive (voice) play and posts it to the session's lineitem. Nothing comes
   * from the client but the session id: the answers are the stored transcripts, scored here, and the
   * question for each is the scenario's own prompt for the node the response was recorded against.
   * Single use per LTI session and per immersive session; a failed score or post can be retried.
   */
  async completeImmersive(
    session: LtiSession,
    sessionId: unknown
  ): Promise<{ score: number; returnUrl: string }> {
    if (typeof sessionId !== 'string' || !sessionId) throw new LtiError('Missing sessionId')
    await this.limit('tool-complete', session.sub, COMPLETE_PER_MINUTE_PER_LEARNER)
    const row = await this.prisma.immersiveSession.findUnique({
      where: { id: sessionId },
      include: { responses: { orderBy: { createdAt: 'asc' } } },
    })
    if (!row || row.userId !== session.sub || row.scenarioId !== session.ref) {
      throw new LtiError('Session not found', 404)
    }
    if (row.status === 'abandoned') {
      throw new LtiError('This interview was restarted in another tab. Use the newest one.', 410)
    }
    if (row.status !== 'active') {
      throw new LtiError('This interview was already completed. Relaunch it from your course.', 409)
    }
    // a session created before the LTI session began cannot be the work done in it
    if (row.createdAt.getTime() < session.iat * 1000 - RESULT_CLOCK_SKEW_MS) {
      throw new LtiError('This interview was not started in this session', 400)
    }
    const scenario = await this.prisma.scenario.findUnique({ where: { scenarioId: session.ref } })
    const interview = scenario ? interviewOf(scenario.data) : undefined
    const prompts = scenario ? promptNodes(scenario.data) : []
    if (
      !scenario ||
      !interview ||
      prompts.length === 0 ||
      prompts.length !== interview.questions.length
    ) {
      throw new LtiError('Interview not found', 404)
    }
    // the latest response per question node, in the scenario's order
    const latest = new Map<string, { questionText: string; transcript: string | null }>()
    for (const r of row.responses) latest.set(r.nodeId, r)
    const answers: string[] = []
    for (const p of prompts) {
      const r = latest.get(p.nodeId)
      if (!r) throw new LtiError('Answer every question before finishing', 400)
      const transcript = (r.transcript ?? '').trim()
      if (!transcript) {
        throw new LtiError('Your answers are still being transcribed. Try again in a moment.', 422)
      }
      answers.push(transcript.slice(0, MAX_ANSWER_CHARS))
    }
    if (!(await this.store.claim('lti-complete', session.jti, IN_FLIGHT_TTL_S))) {
      throw new LtiError('This score was already sent. Relaunch it from your course.', 409)
    }
    const resultKey = `immersive:${sessionId}`
    let posted = false
    let resultClaimed = false
    try {
      // one interview is sent once, whichever LTI session it comes from
      resultClaimed = await this.store.claim('lti-result', resultKey, RESULT_TTL_S)
      if (!resultClaimed) throw new LtiError('This interview was already sent.', 409)
      let scored: ScoredAnswer[]
      try {
        if (!useStubScoring() && !process.env.ANTHROPIC_API_KEY) {
          throw new LtiError('Interview scoring is not set up on this server.', 502)
        }
        scored = await this.score(
          { ...interview, questions: prompts.map((p) => p.prompt) },
          answers
        )
      } catch (err) {
        if (err instanceof LtiError) throw err
        throw new LtiError('Your answers could not be scored right now. Please try again.', 502)
      }
      const score = averageScore(scored)
      try {
        await this.postScore(session, score, this.dimensionAverages(scored))
      } catch {
        throw new LtiError('The score could not be sent to your course. Please try again.', 502)
      }
      posted = true
      const ttl = Math.max(1, Math.ceil(session.exp - this.now() / 1000) + 60)
      await this.store.put('lti-complete', session.jti, true, ttl)
      await this.prisma.immersiveSession
        .update({ where: { id: sessionId }, data: { status: 'completed' } })
        .catch(() => undefined) // the score is sent and both claims hold; the status is bookkeeping
      return { score, returnUrl: session.returnUrl ?? returnUrl() }
    } finally {
      if (!posted) {
        await this.store.release('lti-complete', session.jti)
        if (resultClaimed) await this.store.release('lti-result', resultKey)
      }
    }
  }

  /**
   * Posts the percent score of a graded assessment attempt to the session's lineitem. The attempt
   * must be the learner's, on the session's delivery and submitted (graded server-side), and may have
   * been started in an earlier session (a relaunch resumes it); the score is computed here from its stored section scores, never from the client.
   * Single use per LTI session and per attempt; a failed post can be retried.
   */
  async completeAssessment(
    session: LtiSession,
    attemptId: unknown
  ): Promise<{ score: number; returnUrl: string }> {
    if (typeof attemptId !== 'string' || !attemptId) throw new LtiError('Missing attemptId')
    await this.limit('tool-complete', session.sub, COMPLETE_PER_MINUTE_PER_LEARNER)
    const attempt = session.deliveryId
      ? await this.prisma.assessmentAttempt.findUnique({ where: { id: attemptId } })
      : null
    if (!attempt || attempt.userId !== session.sub || attempt.deliveryId !== session.deliveryId) {
      throw new LtiError('Attempt not found', 404)
    }
    if (!attempt.submittedAt || !Array.isArray(attempt.sectionScores)) {
      throw new LtiError('Submit the assessment before finishing', 400)
    }
    // no startedAt-vs-iat check: a relaunch resumes the earlier attempt under a new session, and
    // the delivery pin, ownership and server-side grading above already scope what is posted
    const scores = attempt.sectionScores as unknown as SectionScore[]
    if (!(await this.store.claim('lti-complete', session.jti, IN_FLIGHT_TTL_S))) {
      throw new LtiError('This score was already sent. Relaunch it from your course.', 409)
    }
    const resultKey = `assessment:${attemptId}`
    let posted = false
    let resultClaimed = false
    try {
      // one attempt is sent once, whichever LTI session it comes from
      resultClaimed = await this.store.claim('lti-result', resultKey, RESULT_TTL_S)
      if (!resultClaimed) throw new LtiError('This assessment was already sent.', 409)
      const score = overall(scores).percent
      const dimensions = scores.map((s) => ({
        dimension: s.title,
        score: s.total ? Math.round((s.correct / s.total) * 100) : 0,
      }))
      try {
        await this.postScore(session, score, dimensions)
      } catch {
        throw new LtiError('The score could not be sent to your course. Please try again.', 502)
      }
      posted = true
      const ttl = Math.max(1, Math.ceil(session.exp - this.now() / 1000) + 60)
      await this.store.put('lti-complete', session.jti, true, ttl)
      return { score, returnUrl: session.returnUrl ?? returnUrl() }
    } finally {
      if (!posted) {
        await this.store.release('lti-complete', session.jti)
        if (resultClaimed) await this.store.release('lti-result', resultKey)
      }
    }
  }

  private async postScore(
    claims: Pick<SubmissionClaims, 'sub' | 'lineitem' | 'platformId' | 'platformSub'>,
    score: number,
    dimensions: { dimension: string; score: number }[]
  ): Promise<void> {
    // Switched on or off: the work is already done and this platform's launch is what it came from.
    const reg = await this.platforms.forScore(claims.platformId)
    if (!reg) throw new Error('the platform that launched this is no longer registered')
    const assertion = signJwt(
      {
        iss: reg.clientId,
        sub: reg.clientId,
        aud: reg.tokenUrl,
        jti: newId(),
        iat: Math.floor(this.now() / 1000),
        exp: Math.floor(this.now() / 1000) + ASSERTION_TTL_S,
      },
      this.keys
    )
    const tokenRes = await this.fetchImpl(reg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: assertion,
        scope: AGS_SCOPE_SCORE,
      }),
      signal: AbortSignal.timeout(this.platformTimeoutMs),
    })
    if (!tokenRes.ok) throw new Error(`platform token endpoint answered ${tokenRes.status}`)
    const { access_token } = (await tokenRes.json()) as { access_token?: string }
    if (!access_token) throw new Error('platform returned no access token')
    const scoreRes = await this.fetchImpl(`${claims.lineitem}/scores`, {
      method: 'POST',
      headers: { 'Content-Type': SCORE_CONTENT_TYPE, Authorization: `Bearer ${access_token}` },
      body: JSON.stringify({
        userId: claims.platformSub ?? claims.sub,
        scoreGiven: score,
        scoreMaximum: 100,
        activityProgress: 'Completed',
        gradingProgress: 'FullyGraded',
        timestamp: new Date(this.now()).toISOString(),
        [DIMENSIONS_FIELD]: dimensions,
      }),
      signal: AbortSignal.timeout(this.platformTimeoutMs),
    })
    if (!scoreRes.ok) throw new Error(`platform rejected the score (${scoreRes.status})`)
  }

  private keysFor(url: string): ReturnType<typeof jwksKeyResolver> {
    let resolver = this.platformKeys.get(url)
    if (!resolver) {
      resolver = jwksKeyResolver(url, (...a) => this.fetchImpl(...a))
      this.platformKeys.set(url, resolver)
    }
    return resolver
  }

  private mac(data: string): Buffer {
    return createHmac('sha256', this.secret).update(data).digest()
  }

  private signSubmission(claims: SubmissionClaims): string {
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
    return `${body}.${this.mac(body).toString('base64url')}`
  }

  private verifySubmission(token: string | undefined): SubmissionClaims {
    const [body, sig, extra] = (token ?? '').split('.')
    if (!body || !sig || extra !== undefined) throw new LtiError('Invalid submission token', 401)
    const given = Buffer.from(sig, 'base64url')
    const expected = this.mac(body)
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new LtiError('Invalid submission token', 401)
    }
    let claims: SubmissionClaims
    try {
      claims = JSON.parse(Buffer.from(body, 'base64url').toString())
    } catch {
      throw new LtiError('Invalid submission token', 401)
    }
    if (typeof claims.exp !== 'number' || claims.exp < this.now() / 1000) {
      throw new LtiError('Submission expired; relaunch from your course', 401)
    }
    if (!claims.sub || !claims.jti || !claims.lineitem || !claims.ref) {
      throw new LtiError('Invalid submission token', 401)
    }
    for (const f of [claims.platformId, claims.platformSub])
      if (f !== undefined && (typeof f !== 'string' || !f))
        throw new LtiError('Invalid submission token', 401)
    return claims
  }
}

/**
 * An immersive scenario without an interviewer persona is a typed placeholder made for LMS demos,
 * served by the tool's own page. Everything else (text, or immersive with a persona) is played in
 * the web app.
 */
function isTypedPlaceholder(data: unknown): boolean {
  const d = data as {
    mode?: unknown
    interviewer?: { presenterId?: unknown; voiceId?: unknown }
  } | null
  if (d?.mode !== 'immersive') return false
  return !(
    typeof d.interviewer?.presenterId === 'string' &&
    d.interviewer.presenterId &&
    typeof d.interviewer.voiceId === 'string' &&
    d.interviewer.voiceId
  )
}

/** The scenario nodes that ask a question, in order (the same filter as `interviewOf`). */
function promptNodes(data: unknown): { nodeId: string; prompt: string }[] {
  const nodes = (data as { nodes?: { nodeId?: unknown; responsePrompt?: unknown }[] } | null)?.nodes
  return (Array.isArray(nodes) ? nodes : []).flatMap((n) =>
    typeof n?.responsePrompt === 'string' && n.responsePrompt.trim() && typeof n.nodeId === 'string'
      ? [{ nodeId: n.nodeId, prompt: n.responsePrompt.trim() }]
      : []
  )
}

type Identity = Pick<LtiSession, 'sub' | 'platformId' | 'platformSub'>

/** Who a launching learner is here: see `keepsBareSub`. The built-in platform leaves tokens as they were. */
function identityOf(platform: ToolPlatform, sub: string): Identity {
  return {
    sub: keepsBareSub(platform) ? sub : `lti:${platform.id}:${sub}`,
    ...(platform.id === BUILT_IN_ID ? {} : { platformId: platform.id }),
    ...(keepsBareSub(platform) ? {} : { platformSub: sub }),
  }
}

function sameOrigin(url: string, issuer: string): boolean {
  try {
    return new URL(url).origin === new URL(issuer).origin
  } catch {
    return false
  }
}
