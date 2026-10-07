import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { AddressInfo } from 'node:net'
import { AdminGuard } from '../auth/admin.guard'
import { AssessmentsMeController } from '../assessments/assessments.controller'
import { AssessmentsService } from '../assessments/assessments.service'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import { ClerkService } from '../auth/clerk.service'
import { InstitutionScope } from '../auth/scope'
import { ImmersiveSessionsController } from '../immersive-sessions/immersive-sessions.controller'
import { ImmersiveSessionsService } from '../immersive-sessions/immersive-sessions.service'
import { InterviewEngineService } from '../interview-engine/interview-engine.service'
import { TranscriptionService } from '../transcription/transcription.service'
import { DatasetsAdminController, DatasetsMeController } from '../datasets/datasets.controller'
import { DatasetsService } from '../datasets/datasets.service'
import { SqlRunnerService } from '../sql-runner/sql-runner.service'
import { LearnerService } from '../learn/learner.service'
import { PrismaService } from '../prisma/prisma.service'
import { ResultsController } from '../results/results.controller'
import { ResultsService } from '../results/results.service'
import { ScenariosController } from '../scenarios/scenarios.controller'
import { ScenariosService } from '../scenarios/scenarios.service'
import { LTI_STORE, MemoryLtiStore } from './lti-store'
import * as ltiSpec from './lti-spec'
import { LtiPlatformController } from './platform/lti-platform.controller'
import { LtiPlatformService } from './platform/lti-platform.service'
import { LtiToolController } from './tool/lti-tool.controller'
import { LtiToolService } from './tool/lti-tool.service'

/** Loose shape for hand-rolled Prisma fakes whose args the tests index freely. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

/**
 * The whole launch and score return over real HTTP between the two sides: LD as platform, the tool
 * as ID. Only the database and LD's record of the result are faked; every LTI message is a real
 * request, so the two sides prove they interoperate through the protocol alone.
 */
describe('LTI 1.3 launch and score return (end to end)', () => {
  let app: INestApplication
  let base: string
  let platform: LtiPlatformService
  const recordToolResult = jest.fn()
  const store = new MemoryLtiStore()

  /** The ref of the launched item; set per test. */
  let itemRef = 'scn-1'
  let itemTool = 'id-interview'
  const textScenario = {
    scenarioId: 'ops-001',
    status: 'published',
    institutionId: 'inst-private',
    institution: { name: 'Acme' },
    data: { scenarioId: 'ops-001', title: 'Ops decision', nodes: [], rubric: { dimensions: [] } },
  }
  const sqlScenario = {
    scenarioId: 'data-001',
    status: 'published',
    institutionId: null,
    institution: null,
    data: {
      scenarioId: 'data-001',
      title: 'Top customers',
      rubric: { dimensions: [{ name: 'Technical Accuracy' }] },
      nodes: [
        { nodeId: 'n1', type: 'sql', sql: { datasetSlug: 'sql-fundamentals' } },
        { nodeId: 'n2', type: 'decision' },
      ],
    },
  }
  const datasets: Row = {
    'sql-fundamentals': { id: 'd1', slug: 'sql-fundamentals', setupSql: 'create table t(x int);' },
    'someone-elses': { id: 'd2', slug: 'someone-elses', setupSql: 'create table secret(x int);' },
  }
  const stored: Row = {}
  const fakeResults = {
    createAttempt: jest.fn(async (a: object) => ({ id: 'att1', ...a })),
    create: jest.fn(
      async (dto: Row) => (stored[dto.id] = { ...dto, completedAt: new Date(dto.completedAt) })
    ),
    getById: jest.fn(async (id: string) => stored[id]),
  }
  const scenario = {
    status: 'published',
    data: {
      mode: 'immersive',
      title: 'Practice interview',
      briefing: { role: 'Medical Assistant' },
      nodes: [{ responsePrompt: 'Tell me about yourself.' }, { responsePrompt: 'Why this job?' }],
      rubric: {
        dimensions: [
          { name: 'Clarity', description: 'Clear?' },
          { name: 'Specifics', description: 'Examples?' },
        ],
      },
    },
  }
  const voiceScenario = {
    status: 'published',
    data: {
      mode: 'immersive',
      title: 'Voice interview',
      interviewer: { presenterId: 'p', voiceId: 'v' },
      briefing: { role: 'Analyst' },
      nodes: [
        { nodeId: 'q1', type: 'decision', responsePrompt: 'Tell me about yourself.' },
        { nodeId: 'q2', type: 'decision', responsePrompt: 'Why this job?' },
      ],
      rubric: {
        dimensions: [
          { name: 'Clarity', description: 'Clear?' },
          { name: 'Specifics', description: 'Examples?' },
        ],
      },
    },
  }
  /** Immersive sessions, shared by the fake service (the player's routes) and the fake prisma (complete). */
  const immersive: Row = {}
  let immersiveCount = 0
  const fakeImmersive = {
    createSession: jest.fn(async (scenarioId: string, userId: string) => {
      const id = `im${++immersiveCount}`
      return (immersive[id] = {
        id,
        scenarioId,
        userId,
        status: 'active',
        createdAt: new Date(),
        responses: [],
      })
    }),
    createResponse: jest.fn(async (sessionId: string, nodeId: string, questionText: string) => {
      const r = { id: `r${immersive[sessionId].responses.length + 1}`, nodeId, questionText }
      immersive[sessionId].responses.push({ ...r, transcript: null })
      return r
    }),
    updateTranscript: jest.fn(async (responseId: string, transcript: string) => {
      for (const s of Object.values(immersive))
        for (const r of s.responses) if (r.id === responseId) r.transcript = transcript
    }),
    storeResponseMedia: jest.fn(async () => undefined),
    getSessionRef: jest.fn(async (id: string) => immersive[id] ?? null),
    getSessionOwner: jest.fn(async (id: string) => immersive[id]?.userId ?? null),
    getSession: jest.fn(async (id: string) => immersive[id]),
    getResponse: jest.fn(async (id: string, rid: string) =>
      immersive[id].responses.find((r: Row) => r.id === rid)
    ),
    getResponseSignedUrl: jest.fn(async () => ({ url: 'http://media.test/x', expiresAt: 'soon' })),
    getSessionSummary: jest.fn(),
    getSessionsForUser: jest.fn(),
  }
  const scoreAnswers = jest.fn()
  const institutions: Record<string, { brand: unknown; parentId: string | null }> = {
    'inst-child': { brand: null, parentId: 'inst-agency' },
    'inst-agency': { brand: null, parentId: null },
  }
  const bank = {
    id: 'as1',
    slug: 'sql-basics',
    title: 'SQL basics',
    dataset: null,
    sections: [
      {
        id: 's1',
        number: 1,
        title: 'Basics',
        draw: null,
        questions: [
          {
            id: '1.1',
            type: 'mc',
            prompt: 'Filter rows?',
            options: [{ key: 'A', text: 'SELECT' }],
            answer: 'B',
          },
          {
            id: '1.2',
            type: 'mc',
            prompt: 'Default sort?',
            options: [{ key: 'A', text: 'ASC' }],
            answer: 'A',
          },
        ],
      },
    ],
  }
  const deliveries: Row[] = []
  const attempts: Row = {}
  /** Extra custom-claim fields (attempt, timeLimitMinutes) merged into the next id_tokens. */
  let customExtra: Record<string, unknown> = {}
  const prisma = {
    assessment: {
      findUnique: jest.fn(async (a: Row) =>
        a.where.slug === 'sql-basics' || a.where.id === 'as1' ? bank : null
      ),
    },
    assessmentDelivery: {
      findFirst: jest.fn(
        async (a: Row) =>
          deliveries.find(
            (d) =>
              d.assessmentId === a.where.assessmentId &&
              d.cohortId === a.where.cohortId &&
              d.label === a.where.label
          ) ?? null
      ),
      findUnique: jest.fn(async (a: Row) => {
        const d = deliveries.find((x) => x.id === a.where.id)
        return d && { ...d, assessment: bank }
      }),
      create: jest.fn(async (a: Row) => {
        const d = { id: `dl${deliveries.length + 1}`, opensAt: null, closesAt: null, ...a.data }
        deliveries.push(d)
        return d
      }),
    },
    assessmentAttempt: {
      findMany: jest.fn(async (a: Row) =>
        Object.values(attempts)
          .filter((t: Row) => {
            const d = deliveries.find((x) => x.id === t.deliveryId)!
            return (
              t.userId === a.where.userId &&
              t.submittedAt &&
              d.assessmentId === a.where.delivery.assessmentId &&
              d.cohortId === a.where.delivery.cohortId &&
              d.label.startsWith(a.where.delivery.label.startsWith)
            )
          })
          .map((t: Row) => ({ delivery: deliveries.find((x) => x.id === t.deliveryId) }))
      ),
      findUnique: jest.fn(async (a: Row) => {
        const row = a.where.id
          ? attempts[a.where.id]
          : Object.values(attempts).find(
              (x: Row) =>
                x.deliveryId === a.where.deliveryId_userId.deliveryId &&
                x.userId === a.where.deliveryId_userId.userId
            )
        return row
          ? {
              ...row,
              delivery: { ...deliveries.find((d) => d.id === row.deliveryId), assessment: bank },
            }
          : null
      }),
      create: jest.fn(async (a: Row) => {
        const id = `at${Object.keys(attempts).length + 1}`
        return (attempts[id] = {
          id,
          startedAt: new Date(),
          submittedAt: null,
          sectionScores: null,
          ...a.data,
        })
      }),
      update: jest.fn(async (a: Row) => Object.assign(attempts[a.where.id], a.data)),
    },
    immersiveSession: {
      findUnique: jest.fn(async (a: Row) => immersive[a.where.id] ?? null),
      update: jest.fn(async (a: Row) => Object.assign(immersive[a.where.id], a.data)),
    },
    institution: {
      findUnique: jest.fn(async (a: Row) => institutions[a.where.id] ?? null),
    },
    cohort: {
      findUnique: jest.fn(async () => ({
        institutionId: 'inst-child',
        courseId: 'c1',
        startsAt: new Date('2020-01-01T00:00:00Z'),
        endsAt: new Date('2099-01-01T00:00:00Z'),
        course: { provider: { id: 'prov-1', parentId: 'agency-1' } },
      })),
    },
    enrollment: { findUnique: jest.fn(async () => ({ status: 'enrolled' })) },
    courseItem: {
      findUnique: jest.fn(async () => ({
        type: 'tool',
        config: { toolId: itemTool, ref: itemRef },
        module: { courseId: 'c1' },
      })),
    },
    itemProgress: { findFirst: jest.fn(async () => null) },
    scenario: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async (a: Row) =>
        a.where.scenarioId === 'ops-001'
          ? textScenario
          : a.where.scenarioId === 'voice-1'
            ? voiceScenario
            : a.where.scenarioId === 'scn-1'
              ? scenario
              : a.where.scenarioId === 'data-001'
                ? sqlScenario
                : null
      ),
    },
    dataset: { findUnique: jest.fn(async (a: Row) => datasets[a.where.slug] ?? null) },
    simulationResult: { findUnique: jest.fn(async (a: Row) => stored[a.where.id] ?? null) },
  }

  const unescape = (s: string) =>
    s
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
  const formOf = (html: string) => ({
    action: unescape(/<form[^>]*action="([^"]*)"/.exec(html)?.[1] ?? ''),
    fields: Object.fromEntries(
      [...html.matchAll(/<input type="hidden" name="([^"]*)" value="([^"]*)"/g)].map((m) => [
        m[1],
        unescape(m[2]),
      ])
    ),
  })
  /** The browser's cookie jar, reduced to what these flows need: the cookies the tool set. */
  const cookieOf = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0]
  const post = (url: string, fields: Record<string, string>, cookie?: string) =>
    fetch(url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: new URLSearchParams(fields),
    })

  /**
   * Steps 1 to 4: start, login initiation, auth request; returns the launch form the tool receives
   * and the lti_state cookie the same browser carries from /login to /launch.
   */
  async function reachLaunchForm(itemId = 'i1', returnOrigin?: string) {
    const start = await platform.startLaunch('u1', 'k1', itemId, returnOrigin)
    const login = await post(start.action, start.fields)
    expect(login.status).toBe(302)
    const cookie = cookieOf(login)
    const auth = await fetch(login.headers.get('location')!, { redirect: 'manual' })
    expect(auth.status).toBe(200)
    return { ...formOf(await auth.text()), cookie }
  }

  beforeAll(async () => {
    // the platform side states the attempt and time limit in the custom claim; until it does, the
    // test plays that part by merging them into the id_token the platform signs
    const realSign = ltiSpec.signJwt
    jest.spyOn(ltiSpec, 'signJwt').mockImplementation((payload, key) => {
      const custom = payload[ltiSpec.CLAIM.custom] as Row | undefined
      return realSign(
        custom ? { ...payload, [ltiSpec.CLAIM.custom]: { ...custom, ...customExtra } } : payload,
        key
      )
    })
    process.env.LTI_TOOL_SCORING = 'stub'
    delete process.env.LTI_LEARN_URL
    const mod = await Test.createTestingModule({
      controllers: [
        LtiPlatformController,
        LtiToolController,
        ScenariosController,
        ResultsController,
        DatasetsMeController,
        DatasetsAdminController,
        ImmersiveSessionsController,
        AssessmentsMeController,
      ],
      providers: [
        { provide: ImmersiveSessionsService, useValue: fakeImmersive },
        {
          provide: TranscriptionService,
          useValue: { transcribe: async () => 'I would page the on-call lead first' },
        },
        DatasetsService,
        AssessmentsService,
        { provide: SqlRunnerService, useValue: {} },
        ScenariosService,
        AuthenticatedGuard,
        AdminGuard,
        InstitutionScope,
        { provide: ResultsService, useValue: fakeResults },
        {
          provide: ClerkService,
          useValue: {
            verifyBearerToken: async () => null,
            getRole: async () => 'student',
            isAdmin: async () => false,
          },
        },
        LtiPlatformService,
        LtiToolService,
        { provide: LTI_STORE, useValue: store },
        { provide: PrismaService, useValue: prisma },
        { provide: LearnerService, useValue: { recordToolResult } },
        { provide: InterviewEngineService, useValue: { scoreAnswers } },
      ],
    }).compile()
    app = mod.createNestApplication()
    app.setGlobalPrefix('api')
    await app.listen(0, '127.0.0.1')
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`
    process.env.LTI_API_BASE = base
    platform = app.get(LtiPlatformService)
  })
  afterAll(async () => {
    delete process.env.LTI_API_BASE
    delete process.env.LTI_TOOL_SCORING
    await app.close()
  })
  beforeEach(() => {
    customExtra = {}
    recordToolResult.mockClear()
    itemRef = 'scn-1'
    itemTool = 'id-interview'
  })

  const longAnswer = 'I helped patients feel at ease and kept careful records. '.repeat(5)

  it('launches the tool, scores the answers and records the score in the LMS', async () => {
    const launch = await reachLaunchForm()
    expect(launch.action).toBe(`${base}/lti/tool/launch`)
    expect(launch.fields.id_token.split('.')).toHaveLength(3)
    const idClaims = JSON.parse(
      Buffer.from(launch.fields.id_token.split('.')[1], 'base64url').toString()
    )
    const returnUrl = 'http://localhost:5174/lms/learning/k1/i1'
    expect(idClaims['https://purl.imsglobal.org/spec/lti/claim/launch_presentation']).toEqual({
      document_target: 'window',
      return_url: returnUrl,
    })

    const page = await post(launch.action, launch.fields, launch.cookie)
    expect(page.status).toBe(200)
    expect(page.headers.get('set-cookie')).toMatch(/^lti_state=;.*Max-Age=0/)
    const html = await page.text()
    expect(html).toContain('Tell me about yourself.')
    expect(html).toContain('Why this job?')
    const { fields } = formOf(html)
    expect(fields.submission).toBeTruthy()

    const result = await post(`${base}/lti/tool/submit`, {
      submission: fields.submission,
      answer_0: longAnswer,
      answer_1: longAnswer,
    })
    expect(result.status).toBe(200)
    expect(await result.text()).toContain(`href="${returnUrl}"`)
    expect(recordToolResult).toHaveBeenCalledTimes(1)
    expect(recordToolResult).toHaveBeenCalledWith('u1', 'k1', 'i1', {
      reportedAt: expect.any(String),
      scorePct: 70, // the stub scores a ~280 character answer in the 70 band
      dimensions: [
        { dimension: 'Clarity', score: 70 },
        { dimension: 'Specifics', score: 70 },
      ],
    })
  })

  it('returns the learner to the tenant host they launched from', async () => {
    process.env.LTI_LEARN_URL = 'https://learn.test'
    try {
      const launch = await reachLaunchForm('i1', 'https://delaware.learn.test')
      const idClaims = JSON.parse(
        Buffer.from(launch.fields.id_token.split('.')[1], 'base64url').toString()
      )
      const returnUrl = 'https://delaware.learn.test/lms/learning/k1/i1'
      expect(idClaims['https://purl.imsglobal.org/spec/lti/claim/launch_presentation']).toEqual({
        document_target: 'window',
        return_url: returnUrl,
      })
      const page = await post(launch.action, launch.fields, launch.cookie)
      const { fields } = formOf(await page.text())
      const result = await post(`${base}/lti/tool/submit`, {
        submission: fields.submission,
        answer_0: longAnswer,
        answer_1: longAnswer,
      })
      expect(await result.text()).toContain(`href="${returnUrl}"`)
    } finally {
      delete process.env.LTI_LEARN_URL
    }
  })

  describe('a text scenario played in the web app', () => {
    const api = (token: string, path: string, init: RequestInit = {}) =>
      fetch(`${base}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer lti.${token}`,
          ...init.headers,
        },
      })

    async function launchText() {
      itemRef = 'ops-001'
      const launch = await reachLaunchForm()
      const res = await post(launch.action, launch.fields, launch.cookie)
      expect(res.status).toBe(303)
      const location = res.headers.get('location')!
      expect(location).toContain('/lti/play/ops-001#session=')
      return location.split('#session=')[1]
    }

    it('redirects, lets the token play its scenario, and returns the score to the LMS', async () => {
      const token = await launchText()

      // the list is open to the token, as an anonymous viewer (summaries only)
      const list = await api(token, '/scenarios')
      expect(list.status).toBe(200)
      expect(prisma.scenario.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { institutionId: null } })
      )

      const scn = await api(token, '/scenarios/ops-001')
      expect(scn.status).toBe(200)
      expect((await scn.json()) as { title: string }).toMatchObject({ title: 'Ops decision' })

      const attempt = await api(token, '/results/attempts', {
        method: 'POST',
        body: JSON.stringify({ scenarioId: 'ops-001', track: 'ops' }),
      })
      expect(attempt.status).toBe(201)
      expect(fakeResults.createAttempt).toHaveBeenLastCalledWith({
        userId: 'u1',
        scenarioId: 'ops-001',
        track: 'ops',
      })

      const created = await api(token, '/results', {
        method: 'POST',
        body: JSON.stringify({
          id: 'res1',
          userId: 'attacker',
          scenarioId: 'ops-001',
          scenarioTitle: 'Ops decision',
          track: 'ops',
          completedAt: new Date().toISOString(),
          overallScore: 81,
          choiceSequence: [],
          dimensionScores: [
            { dimension: 'Clarity', score: 90, quality: 'strong', feedback: '' },
            { dimension: 'Depth', score: 72, quality: 'proficient', feedback: '' },
          ],
        }),
      })
      expect(created.status).toBe(201)
      expect(stored.res1.userId).toBe('u1')
      expect((await api(token, '/results/res1')).status).toBe(200)

      const done = await api(token, '/lti/tool/complete', {
        method: 'POST',
        body: JSON.stringify({ resultId: 'res1' }),
      })
      expect(done.status).toBe(201)
      expect(await done.json()).toEqual({
        score: 81,
        returnUrl: 'http://localhost:5174/lms/learning/k1/i1',
      })
      expect(recordToolResult).toHaveBeenCalledWith('u1', 'k1', 'i1', {
        reportedAt: expect.any(String),
        scorePct: 81,
        dimensions: [
          { dimension: 'Clarity', score: 90 },
          { dimension: 'Depth', score: 72 },
        ],
      })

      const again = await api(token, '/lti/tool/complete', {
        method: 'POST',
        body: JSON.stringify({ resultId: 'res1' }),
      })
      expect(again.status).toBe(409)
      expect(recordToolResult).toHaveBeenCalledTimes(1)
    })

    describe('white-label brand', () => {
      const brand = {
        name: 'Delaware Department of Labor',
        logoUrl: 'http://localhost:5174/tenants/delaware/dol-logo.png',
        scheme: 'light',
        primary: '#05405c',
        accent: '#d76f0f',
      }
      afterEach(() => {
        institutions['inst-agency'].brand = null
      })

      it('returns the ancestor brand from /lti/tool/session, sanitized', async () => {
        institutions['inst-agency'].brand = { ...brand, text: 'url(x)', sky: '#daf2fd' }
        const token = await launchText()
        const res = await api(token, '/lti/tool/session')
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ brand, ref: 'ops-001' })
      })

      it('returns brand null for an unbranded tenant', async () => {
        const token = await launchText()
        const res = await api(token, '/lti/tool/session')
        expect(await res.json()).toEqual({ brand: null, ref: 'ops-001' })
      })

      it('needs an LTI session and is GET only', async () => {
        institutions['inst-agency'].brand = brand
        const token = await launchText()
        expect((await fetch(`${base}/lti/tool/session`)).status).toBe(401)
        expect((await api(token, '/lti/tool/session', { method: 'POST', body: '{}' })).status).toBe(
          404
        ) // no such POST route
      })
    })

    it('refuses the token on another scenario, another route and without it', async () => {
      const token = await launchText()
      expect((await api(token, '/scenarios/scn-1')).status).toBe(403)
      expect((await api(token, '/scenarios', { method: 'POST', body: '{}' })).status).toBe(403)
      expect((await api(token, '/results/profile/u1')).status).toBe(403)
      expect((await api(token, '/results/res1/ai-feedback')).status).toBe(403)
      expect(
        (
          await api(token, '/results', {
            method: 'POST',
            body: JSON.stringify({ scenarioId: 'scn-1' }),
          })
        ).status
      ).toBe(403)
      expect((await api(token, '/scenarios/ops-001', { method: 'DELETE' })).status).toBe(403)
      expect((await api(`${token}x`, '/scenarios/ops-001')).status).toBe(401)
      const noToken = await fetch(`${base}/lti/tool/complete`, { method: 'POST' })
      expect(noToken.status).toBe(401)
    })

    describe('a SQL scenario', () => {
      async function launchSql() {
        itemRef = 'data-001'
        const launch = await reachLaunchForm()
        const res = await post(launch.action, launch.fields, launch.cookie)
        expect(res.status).toBe(303)
        return res.headers.get('location')!.split('#session=')[1]
      }

      it('lets the token fetch the dataset its scenario uses and nothing else', async () => {
        const token = await launchSql()

        const own = await api(token, '/me/datasets/sql-fundamentals')
        expect(own.status).toBe(200)
        expect(await own.json()).toMatchObject({
          slug: 'sql-fundamentals',
          setupSql: 'create table t(x int);',
        })

        // another dataset, the list and the admin routes are all refused
        expect((await api(token, '/me/datasets/someone-elses')).status).toBe(403)
        expect((await api(token, '/me/datasets')).status).toBe(403)
        // the admin routes sit behind AdminGuard, which treats the LTI token as an invalid Clerk token
        expect((await api(token, '/admin/datasets')).status).toBe(401)
        expect((await api(token, '/admin/datasets/d1')).status).toBe(401)
        expect(
          (await api(token, '/admin/datasets/sql-fundamentals', { method: 'DELETE' })).status
        ).toBe(401)
        expect((await api(`${token}x`, '/me/datasets/sql-fundamentals')).status).toBe(401)
        expect((await fetch(`${base}/me/datasets/sql-fundamentals`)).status).toBe(401)
      })

      it('refuses a text scenario token the dataset', async () => {
        const token = await launchText()
        expect((await api(token, '/me/datasets/sql-fundamentals')).status).toBe(403)
      })

      it('plays through: scenario, dataset, result with no sql in the choices, score return', async () => {
        const token = await launchSql()
        expect((await api(token, '/scenarios/data-001')).status).toBe(200)
        expect((await api(token, '/me/datasets/sql-fundamentals')).status).toBe(200)
        const created = await api(token, '/results', {
          method: 'POST',
          body: JSON.stringify({
            id: 'sqlres',
            scenarioId: 'data-001',
            scenarioTitle: 'Top customers',
            track: 'data',
            completedAt: new Date().toISOString(),
            overallScore: 66,
            choiceSequence: ['c1'],
            dimensionScores: [
              { dimension: 'Technical Accuracy', score: 66, quality: 'proficient', feedback: '' },
            ],
          }),
        })
        expect(created.status).toBe(201)
        const done = await api(token, '/lti/tool/complete', {
          method: 'POST',
          body: JSON.stringify({ resultId: 'sqlres' }),
        })
        expect(done.status).toBe(201)
        expect(recordToolResult).toHaveBeenCalledWith('u1', 'k1', 'i1', {
          reportedAt: expect.any(String),
          scorePct: 66,
          dimensions: [{ dimension: 'Technical Accuracy', score: 66 }],
        })
      })
    })

    it('refuses a result owned by someone else', async () => {
      const token = await launchText()
      stored.theirs = { id: 'theirs', userId: 'u2', scenarioId: 'ops-001', overallScore: 99 }
      expect((await api(token, '/results/theirs')).status).toBe(403)
      const done = await api(token, '/lti/tool/complete', {
        method: 'POST',
        body: JSON.stringify({ resultId: 'theirs' }),
      })
      expect(done.status).toBe(404)
      expect(recordToolResult).not.toHaveBeenCalled()
    })
  })

  describe('an assessment played in the web app', () => {
    const api = (token: string, path: string, init: RequestInit = {}) =>
      fetch(`${base}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer lti.${token}`,
          ...init.headers,
        },
      })

    async function launchAssessment() {
      itemTool = 'id-assessment'
      itemRef = 'sql-basics'
      const launch = await reachLaunchForm()
      const res = await post(launch.action, launch.fields, launch.cookie)
      expect(res.status).toBe(303)
      const [path, token] = res.headers.get('location')!.split('#session=')
      const deliveryId = path.split('/lti/assessment/')[1]
      return { token, deliveryId, path }
    }

    it('plays through: launch, attempt, answers, server grading, score return', async () => {
      const { token, deliveryId, path } = await launchAssessment()
      expect(path).toBe(`http://localhost:5173/lti/assessment/${deliveryId}`)
      expect(await (await api(token, '/lti/tool/session')).json()).toMatchObject({
        ref: 'sql-basics',
        deliveryId,
      })

      const started = await api(token, `/me/deliveries/${deliveryId}/attempts`, { method: 'POST' })
      expect(started.status).toBe(201)
      const { id } = await started.json()
      // a second start resumes the same attempt
      const again = await api(token, `/me/deliveries/${deliveryId}/attempts`, { method: 'POST' })
      expect((await again.json()).id).toBe(id)

      const paper = await (await api(token, `/me/attempts/${id}`)).json()
      expect(JSON.stringify(paper)).not.toContain('"answer"')

      expect(
        (
          await api(token, `/me/attempts/${id}/answers`, {
            method: 'PUT',
            body: JSON.stringify({ answers: { '1.1': 'B' } }),
          })
        ).status
      ).toBe(200)
      expect(
        (
          await api(token, `/me/attempts/${id}/answers`, {
            method: 'PUT',
            body: JSON.stringify({ answers: { '1.1': 5 } }),
          })
        ).status
      ).toBe(400)
      const submitted = await api(token, `/me/attempts/${id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers: { '1.2': 'B' } }),
      })
      expect(await submitted.json()).toMatchObject({
        overall: { correct: 1, total: 2, percent: 50 },
      })
      expect((await api(token, `/me/attempts/${id}/result`)).status).toBe(200)

      const done = await api(token, '/lti/tool/complete', {
        method: 'POST',
        body: JSON.stringify({ attemptId: id }),
      })
      expect(done.status).toBe(201)
      expect(await done.json()).toMatchObject({ score: 50 })
      expect(recordToolResult).toHaveBeenCalledWith('u1', 'k1', 'i1', {
        reportedAt: expect.any(String),
        scorePct: 50,
        dimensions: [{ dimension: 'Basics', score: 50 }],
      })
      expect(recordToolResult).toHaveBeenCalledTimes(1)
    })

    describe('retakes and time limits', () => {
      // these tests log in many times; keep them under the per-IP login and auth rate limits for the rest
      afterEach(() => {
        const entries = (store as unknown as { entries: Map<string, unknown> }).entries
        for (const id of [...entries.keys()]) if (id.includes('rl:')) entries.delete(id)
      })
      async function launchAttempt(attempt: number, extra: Record<string, unknown> = {}) {
        customExtra = { attempt, ...extra }
        itemTool = 'id-assessment'
        itemRef = 'sql-basics'
        const launch = await reachLaunchForm('i2')
        const res = await post(launch.action, launch.fields, launch.cookie)
        return res
      }
      async function play(attempt: number, answers: Record<string, string>) {
        const res = await launchAttempt(attempt, attempt === 1 ? { timeLimitMinutes: 30 } : {})
        expect(res.status).toBe(303)
        const [path, token] = res.headers.get('location')!.split('#session=')
        const deliveryId = path.split('/lti/assessment/')[1]
        const started = await api(token, `/me/deliveries/${deliveryId}/attempts`, {
          method: 'POST',
        })
        const { id } = await started.json()
        const paper = await (await api(token, `/me/attempts/${id}`)).json()
        await api(token, `/me/attempts/${id}/submit`, {
          method: 'POST',
          body: JSON.stringify({ answers }),
        })
        const done = await api(token, '/lti/tool/complete', {
          method: 'POST',
          body: JSON.stringify({ attemptId: id }),
        })
        return { deliveryId, id, paper, done, token }
      }

      it('gives each attempt its own delivery, paper and score', async () => {
        const first = await play(1, { '1.1': 'B', '1.2': 'B' }) // 1 of 2
        expect(first.done.status).toBe(201)
        expect(first.paper.deadlineAt).toBeTruthy() // the 30 minute limit from the claim
        const second = await play(2, { '1.1': 'B', '1.2': 'A' }) // 2 of 2
        expect(second.done.status).toBe(201)

        expect(second.deliveryId).not.toBe(first.deliveryId)
        expect(second.id).not.toBe(first.id)
        expect(deliveries.find((d) => d.id === first.deliveryId)).toMatchObject({
          label: 'lti:i2',
          timeLimitMinutes: 30,
        })
        expect(deliveries.find((d) => d.id === second.deliveryId)).toMatchObject({
          label: 'lti:i2#2',
        })
        expect(await first.done.json()).toMatchObject({ score: 50 })
        expect(await second.done.json()).toMatchObject({ score: 100 })
        expect(recordToolResult.mock.calls.map((c) => c[3].scorePct)).toEqual([50, 100])

        // the attempt-1 session cannot reach attempt 2's delivery
        expect(
          (
            await api(first.token, `/me/deliveries/${second.deliveryId}/attempts`, {
              method: 'POST',
            })
          ).status
        ).toBe(403)
        // attempt 2 relaunched resumes its own (submitted) delivery
        const again = await launchAttempt(2)
        expect(again.headers.get('location')).toContain(`/lti/assessment/${second.deliveryId}#`)
      })

      it('refuses to skip ahead and rejects bad claims with a 400 page', async () => {
        const skip = await launchAttempt(9)
        expect(skip.status).toBe(400)
        const bad = await launchAttempt(2, { timeLimitMinutes: 1 })
        expect(bad.status).toBe(400)
        expect(await bad.text()).toContain('Invalid time limit')
      })
    })

    it('relaunching the same item reuses its delivery', async () => {
      const a = await launchAssessment()
      const b = await launchAssessment()
      expect(b.deliveryId).toBe(a.deliveryId)
    })

    it('refuses other deliveries, scenario routes, and a scenario token on assessment routes', async () => {
      const { token } = await launchAssessment()
      expect((await api(token, '/me/deliveries/other/attempts', { method: 'POST' })).status).toBe(
        403
      )
      expect((await api(token, '/me/assessments')).status).toBe(403)
      expect((await api(token, '/scenarios/sql-basics')).status).toBe(403)
      expect((await api(token, '/results/attempts', { method: 'POST' })).status).toBe(403)
      expect((await api(token, '/me/attempts/nope')).status).toBe(404)

      itemTool = 'id-interview'
      itemRef = 'ops-001'
      const launch = await reachLaunchForm()
      const res = await post(launch.action, launch.fields, launch.cookie)
      const scenarioToken = res.headers.get('location')!.split('#session=')[1]
      const { deliveryId } = await launchAssessment()
      expect(
        (await api(scenarioToken, `/me/deliveries/${deliveryId}/attempts`, { method: 'POST' }))
          .status
      ).toBe(403)
    })

    it('shows a page for an unknown assessment', async () => {
      itemTool = 'id-assessment'
      itemRef = 'no-such-bank'
      const launch = await reachLaunchForm()
      const res = await post(launch.action, launch.fields, launch.cookie)
      expect(res.status).toBe(404)
      expect(await res.text()).toContain('Assessment not found')
    })
  })

  describe('a voice interview played in the web app', () => {
    const api = (token: string, path: string, init: RequestInit = {}) =>
      fetch(`${base}${path}`, {
        ...init,
        headers: {
          ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
          Authorization: `Bearer lti.${token}`,
          ...init.headers,
        },
      })
    const upload = (token: string, sessionId: string, nodeId: string) => {
      const form = new FormData()
      form.append('nodeId', nodeId)
      form.append('questionText', 'whatever the client says')
      form.append('transcript', 'a transcript the client made up')
      form.append('durationSeconds', '12')
      form.append('file', new Blob(['audio'], { type: 'audio/webm' }), 'response.webm')
      return api(token, `/immersive-sessions/${sessionId}/responses`, {
        method: 'POST',
        body: form,
      })
    }
    const settle = () => new Promise((r) => setTimeout(r, 20)) // the fake transcription is async

    async function launchVoice(sub = 'u1') {
      itemRef = 'voice-1'
      void sub
      const launch = await reachLaunchForm()
      const res = await post(launch.action, launch.fields, launch.cookie)
      expect(res.status).toBe(303)
      expect(res.headers.get('location')).toContain('/lti/play/voice-1#session=')
      return res.headers.get('location')!.split('#session=')[1]
    }

    beforeAll(() => {
      process.env.LTI_TOOL_SCORING = 'engine'
      process.env.ANTHROPIC_API_KEY = 'test-key'
    })
    afterAll(() => {
      process.env.LTI_TOOL_SCORING = 'stub'
      delete process.env.ANTHROPIC_API_KEY
    })
    beforeEach(() => scoreAnswers.mockReset())

    it('records answers, scores the transcripts on the server and returns the score to the LMS', async () => {
      const token = await launchVoice()
      expect((await api(token, '/scenarios/voice-1')).status).toBe(200)

      const created = await api(token, '/immersive-sessions', {
        method: 'POST',
        body: JSON.stringify({ scenarioId: 'voice-1', userId: 'attacker' }),
      })
      expect(created.status).toBe(201)
      const { id } = (await created.json()) as { id: string }
      expect(immersive[id]).toMatchObject({ userId: 'u1', scenarioId: 'voice-1' })

      // no answers yet
      const early = await api(token, '/lti/tool/complete', {
        method: 'POST',
        body: JSON.stringify({ sessionId: id }),
      })
      expect(early.status).toBe(400)

      expect((await upload(token, id, 'q1')).status).toBe(201)
      expect((await upload(token, id, 'q2')).status).toBe(201)
      expect((await api(token, `/immersive-sessions/${id}/responses/r1`)).status).toBe(200)
      expect((await api(token, `/immersive-sessions/${id}/responses/r1/media-url`)).status).toBe(
        200
      )
      await settle()
      const session = (await (await api(token, `/immersive-sessions/${id}`)).json()) as {
        responses: { transcript: string }[]
      }
      expect(session.responses.map((r) => r.transcript)).toEqual([
        'I would page the on-call lead first',
        'I would page the on-call lead first',
      ])

      scoreAnswers.mockResolvedValue(
        [80, 60].map((n) => ({
          score: n,
          dimensions: [
            { dimension: 'Clarity', score: n },
            { dimension: 'Specifics', score: n - 10 },
          ],
          feedback: '',
          strengths: '',
          development: '',
        }))
      )
      const done = await api(token, '/lti/tool/complete', {
        method: 'POST',
        body: JSON.stringify({ sessionId: id }),
      })
      expect(done.status).toBe(201)
      expect(await done.json()).toEqual({
        score: 70,
        returnUrl: 'http://localhost:5174/lms/learning/k1/i1',
      })
      expect(scoreAnswers).toHaveBeenCalledWith({
        role: 'Analyst',
        rubric: [
          { name: 'Clarity', description: 'Clear?' },
          { name: 'Specifics', description: 'Examples?' },
        ],
        questions: ['Tell me about yourself.', 'Why this job?'],
        answers: ['I would page the on-call lead first', 'I would page the on-call lead first'],
      })
      expect(recordToolResult).toHaveBeenCalledWith('u1', 'k1', 'i1', {
        reportedAt: expect.any(String),
        scorePct: 70,
        dimensions: [
          { dimension: 'Clarity', score: 70 },
          { dimension: 'Specifics', score: 60 },
        ],
      })
      expect(immersive[id].status).toBe('completed')

      // once only
      const again = await api(token, '/lti/tool/complete', {
        method: 'POST',
        body: JSON.stringify({ sessionId: id }),
      })
      expect(again.status).toBe(409)
      expect(recordToolResult).toHaveBeenCalledTimes(1)
    })

    it('lets the learner retry after the scoring engine fails', async () => {
      const token = await launchVoice()
      const { id } = (await (
        await api(token, '/immersive-sessions', {
          method: 'POST',
          body: JSON.stringify({ scenarioId: 'voice-1' }),
        })
      ).json()) as { id: string }
      await upload(token, id, 'q1')
      await upload(token, id, 'q2')
      await settle()
      scoreAnswers.mockRejectedValueOnce(new Error('engine down'))
      const failed = await api(token, '/lti/tool/complete', {
        method: 'POST',
        body: JSON.stringify({ sessionId: id }),
      })
      expect(failed.status).toBe(502)
      expect(recordToolResult).not.toHaveBeenCalled()
      scoreAnswers.mockResolvedValue(
        [50, 50].map((n) => ({
          score: n,
          dimensions: [
            { dimension: 'Clarity', score: n },
            { dimension: 'Specifics', score: n },
          ],
          feedback: '',
          strengths: '',
          development: '',
        }))
      )
      const retried = await api(token, '/lti/tool/complete', {
        method: 'POST',
        body: JSON.stringify({ sessionId: id }),
      })
      expect(retried.status).toBe(201)
      expect(recordToolResult).toHaveBeenCalledTimes(1)
    })

    it('refuses another learner, another scenario and every other route', async () => {
      const token = await launchVoice()
      expect(
        (
          await api(token, '/immersive-sessions', {
            method: 'POST',
            body: JSON.stringify({ scenarioId: 'scn-1' }),
          })
        ).status
      ).toBe(403)
      // sessions of someone else, and of the same learner on another scenario
      immersive.theirs = { id: 'theirs', userId: 'u2', scenarioId: 'voice-1', responses: [] }
      immersive.other = { id: 'other', userId: 'u1', scenarioId: 'scn-1', responses: [] }
      for (const sid of ['theirs', 'other']) {
        expect((await api(token, `/immersive-sessions/${sid}`)).status).toBe(403)
        expect((await upload(token, sid, 'q1')).status).toBe(403)
        expect((await api(token, `/immersive-sessions/${sid}/responses/r1`)).status).toBe(403)
        expect((await api(token, `/immersive-sessions/${sid}/responses/r1/media-url`)).status).toBe(
          403
        )
      }
      expect((await api(token, '/immersive-sessions/user/u1')).status).toBe(403)
      expect((await api(token, '/immersive-sessions/theirs/summary')).status).toBe(403)
      expect((await api(token, '/scenarios/scn-1')).status).toBe(403)
      expect(recordToolResult).not.toHaveBeenCalled()
      expect((await fetch(`${base}/immersive-sessions/theirs`)).status).toBe(401)
    })
  })

  it('sets the lti_state cookie at login, HttpOnly, Secure, SameSite=None and scoped to the tool', async () => {
    const start = await platform.startLaunch('u1', 'k1', 'i1')
    const login = await post(start.action, start.fields)
    const state = new URL(login.headers.get('location')!).searchParams.get('state')
    expect(login.headers.get('set-cookie')).toBe(
      `lti_state=${state}; HttpOnly; Secure; SameSite=None; Path=/api/lti/tool; Max-Age=600`
    )
  })

  it('refuses a launch from a browser that did not start the login (no cookie, or another state)', async () => {
    const launch = await reachLaunchForm()
    expect((await post(launch.action, launch.fields)).status).toBe(400)
    const other = await reachLaunchForm()
    expect((await post(launch.action, launch.fields, other.cookie)).status).toBe(400)
    // neither refusal burned the state: the browser that owns the cookie can still finish
    expect((await post(launch.action, launch.fields, launch.cookie)).status).toBe(200)
  })

  it('answers non-string fields with a 400 page, not a 500', async () => {
    const json = (path: string, body: unknown) =>
      fetch(`${base}/lti/tool/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    expect((await json('launch', { id_token: { a: 1 }, state: 5 })).status).toBe(400)
    expect((await json('launch', null)).status).toBe(400)
    expect((await json('login', { iss: {}, client_id: [], login_hint: 5 })).status).toBe(400)
    expect((await json('submit', { submission: { a: 1 }, answer_0: 5 })).status).toBe(401)
  })

  it('refuses a replayed launch (state is single use)', async () => {
    const launch = await reachLaunchForm()
    expect((await post(launch.action, launch.fields, launch.cookie)).status).toBe(200)
    expect((await post(launch.action, launch.fields, launch.cookie)).status).toBeGreaterThanOrEqual(
      400
    )
  })

  it('refuses a replayed auth request (the launch hint is single use)', async () => {
    const start = await platform.startLaunch('u1', 'k1', 'i1')
    const login = await post(start.action, start.fields)
    const authUrl = login.headers.get('location')!
    expect((await fetch(authUrl)).status).toBe(200)
    expect((await fetch(authUrl)).status).toBeGreaterThanOrEqual(400)
  })

  it('refuses an id_token with a changed claim', async () => {
    const launch = await reachLaunchForm()
    const [h, , s] = launch.fields.id_token.split('.')
    const forged = Buffer.from(JSON.stringify({ sub: 'someone-else' })).toString('base64url')
    const res = await post(
      launch.action,
      { ...launch.fields, id_token: `${h}.${forged}.${s}` },
      launch.cookie
    )
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(recordToolResult).not.toHaveBeenCalled()
  })

  it('refuses a tampered submission token and records nothing', async () => {
    const launch = await reachLaunchForm()
    const { fields } = formOf(
      await (await post(launch.action, launch.fields, launch.cookie)).text()
    )
    const [body, mac] = fields.submission.split('.')
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString())
    const forged = `${Buffer.from(JSON.stringify({ ...claims, sub: 'victim' })).toString('base64url')}.${mac}`
    const res = await post(`${base}/lti/tool/submit`, {
      submission: forged,
      answer_0: longAnswer,
      answer_1: longAnswer,
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(recordToolResult).not.toHaveBeenCalled()
  })

  it('accepts a submission token only once', async () => {
    const launch = await reachLaunchForm()
    const { fields } = formOf(
      await (await post(launch.action, launch.fields, launch.cookie)).text()
    )
    const answers = { submission: fields.submission, answer_0: longAnswer, answer_1: longAnswer }
    expect((await post(`${base}/lti/tool/submit`, answers)).status).toBe(200)
    const again = await post(`${base}/lti/tool/submit`, answers)
    expect(again.status).toBe(409)
    expect(await again.text()).toContain('already submitted')
    expect(recordToolResult).toHaveBeenCalledTimes(1)
  })

  it('does not accept a score as application/json', async () => {
    const res = await fetch(`${base}/lti/platform/ags/k1/lineitems/i1/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer x' },
      body: '{}',
    })
    expect(res.status).toBe(401)
  })

  it('does not accept a score posted without a platform-issued token', async () => {
    const res = await fetch(`${base}/lti/platform/ags/k1/lineitems/i1/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/vnd.ims.lis.v1.score+json' },
      body: JSON.stringify({
        userId: 'u1',
        scoreGiven: 100,
        scoreMaximum: 100,
        activityProgress: 'Completed',
        gradingProgress: 'FullyGraded',
      }),
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(recordToolResult).not.toHaveBeenCalled()
  })

  it('publishes keys on both sides, public parts only', async () => {
    for (const side of ['platform', 'tool']) {
      const jwks = (await (await fetch(`${base}/lti/${side}/jwks`)).json()) as {
        keys: Record<string, unknown>[]
      }
      expect(jwks.keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig' })
      expect(jwks.keys[0].d).toBeUndefined()
    }
  })

  // Last on purpose: it uses up this client IP's login budget for the minute.
  it('answers a flood of logins from one IP with a 429 page', async () => {
    const start = await platform.startLaunch('u1', 'k1', 'i1')
    let last = 0
    for (let i = 0; i < 40 && last !== 429; i++)
      last = (await post(start.action, start.fields)).status
    expect(last).toBe(429)
    const res = await post(start.action, start.fields)
    expect(await res.text()).toContain('Too many requests')
  })
})
