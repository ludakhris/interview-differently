import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { assertLtiProductionConfig, loadSigningKeys } from '../lti-env'
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
import {
  AGS_SCOPE_SCORE,
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
import { launchUrl, platformRegistration, returnUrl, useStubScoring } from './lti-tool.config'
import { errorPage, interviewPage, resultPage } from './lti-tool.html'

const STATE_TTL_S = 10 * 60
const SUBMISSION_TTL_S = 30 * 60
const ASSERTION_TTL_S = 5 * 60
/** How long a submission is locked while it is being scored and posted. */
const IN_FLIGHT_TTL_S = 5 * 60
const RATE_WINDOW_S = 60
const LOGIN_PER_MINUTE_PER_IP = 30
const SUBMIT_PER_MINUTE_PER_LEARNER = 10

interface SubmissionClaims {
  sub: string
  jti: string
  lineitem: string
  ref: string
  exp: number
}

@Injectable()
export class LtiToolService {
  /** Injectable for tests. */
  fetchImpl: typeof fetch = (...args) => fetch(...args)
  now: () => number = () => Date.now()

  private readonly keys: KeyPair
  /** The key `keys` replaced (LTI_TOOL_PREVIOUS_PRIVATE_KEY): published, never signed with. */
  private readonly previousKeys?: KeyPair
  private readonly secret: string
  private platformKeys?: ReturnType<typeof jwksKeyResolver>

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: InterviewEngineService,
    @Inject(LTI_STORE) private readonly store: LtiStore
  ) {
    assertLtiProductionConfig()
    const { current, previous } = loadSigningKeys(
      'LTI_TOOL_PRIVATE_KEY',
      'LTI_TOOL_PREVIOUS_PRIVATE_KEY'
    )
    this.keys = current
    this.previousKeys = previous
    this.secret = process.env.LTI_TOOL_SECRET || randomBytes(32).toString('hex')
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
    const reg = platformRegistration()
    if (p.iss !== reg.issuer || p.client_id !== reg.clientId) {
      throw new LtiError('Unknown platform or client')
    }
    if (!p.login_hint) throw new LtiError('Missing login_hint')
    if (!p.lti_message_hint) throw new LtiError('Missing lti_message_hint')
    if (p.lti_deployment_id && p.lti_deployment_id !== reg.deploymentId) {
      throw new LtiError('Unknown deployment')
    }
    const state = newId()
    const nonce = newId()
    await this.store.put('lti-login', state, { nonce }, STATE_TTL_S)
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
   * Verifies the launch and returns the interview page. `cookieState` is the `lti_state` cookie the
   * login set: it must equal the posted state, so only the browser that started the login can finish it.
   */
  async launch(
    idToken: string | undefined,
    state: string | undefined,
    cookieState: string | undefined
  ): Promise<string> {
    const reg = platformRegistration()
    if (!state || cookieState !== state)
      throw new LtiError('Login state does not match this browser')
    // single use, even if the rest fails
    const entry = await this.store.take<{ nonce: string }>('lti-login', state)
    if (!entry) throw new LtiError('Unknown or expired state')
    if (!idToken) throw new LtiError('Missing id_token')
    this.platformKeys ??= jwksKeyResolver(reg.jwksUrl, (...a) => this.fetchImpl(...a))
    const claims = await verifyJwt(idToken, {
      issuer: reg.issuer,
      audience: reg.clientId,
      keyFor: this.platformKeys,
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
    const interview = await this.loadInterview(ref)
    const submission = this.signSubmission({
      sub: claims.sub,
      jti: newId(),
      lineitem,
      ref,
      exp: Math.floor(this.now() / 1000) + SUBMISSION_TTL_S,
    })
    return interviewPage({
      action: new URL('submit', launchUrl()).toString(),
      submission,
      role: interview.role,
      questions: interview.questions,
    })
  }

  /** Scores the answers, posts the score to the platform, renders the result or an error. */
  async submit(
    body: Record<string, string | undefined>
  ): Promise<{ status: number; html: string }> {
    const claims = this.verifySubmission(body.submission)
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
          returnUrl()
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
        returnUrl: returnUrl(),
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

  private async postScore(
    claims: SubmissionClaims,
    score: number,
    dimensions: { dimension: string; score: number }[]
  ): Promise<void> {
    const reg = platformRegistration()
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
    })
    if (!tokenRes.ok) throw new Error(`platform token endpoint answered ${tokenRes.status}`)
    const { access_token } = (await tokenRes.json()) as { access_token?: string }
    if (!access_token) throw new Error('platform returned no access token')
    const scoreRes = await this.fetchImpl(`${claims.lineitem}/scores`, {
      method: 'POST',
      headers: { 'Content-Type': SCORE_CONTENT_TYPE, Authorization: `Bearer ${access_token}` },
      body: JSON.stringify({
        userId: claims.sub,
        scoreGiven: score,
        scoreMaximum: 100,
        activityProgress: 'Completed',
        gradingProgress: 'FullyGraded',
        timestamp: new Date(this.now()).toISOString(),
        [DIMENSIONS_FIELD]: dimensions,
      }),
    })
    if (!scoreRes.ok) throw new Error(`platform rejected the score (${scoreRes.status})`)
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
    return claims
  }
}

function sameOrigin(url: string, issuer: string): boolean {
  try {
    return new URL(url).origin === new URL(issuer).origin
  } catch {
    return false
  }
}
