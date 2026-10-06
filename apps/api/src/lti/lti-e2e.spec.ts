import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { AddressInfo } from 'node:net'
import { AdminGuard } from '../auth/admin.guard'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import { ClerkService } from '../auth/clerk.service'
import { InstitutionScope } from '../auth/scope'
import { InterviewEngineService } from '../interview-engine/interview-engine.service'
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
import { LtiPlatformController } from './platform/lti-platform.controller'
import { LtiPlatformService } from './platform/lti-platform.service'
import { LtiToolController } from './tool/lti-tool.controller'
import { LtiToolService } from './tool/lti-tool.service'

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

  /** The ref of the launched item; set per test. */
  let itemRef = 'scn-1'
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
  const datasets: Record<string, any> = {
    'sql-fundamentals': { id: 'd1', slug: 'sql-fundamentals', setupSql: 'create table t(x int);' },
    'someone-elses': { id: 'd2', slug: 'someone-elses', setupSql: 'create table secret(x int);' },
  }
  const stored: Record<string, any> = {}
  const fakeResults = {
    createAttempt: jest.fn(async (a: object) => ({ id: 'att1', ...a })),
    create: jest.fn(
      async (dto: any) => (stored[dto.id] = { ...dto, completedAt: new Date(dto.completedAt) })
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
  const prisma = {
    cohort: {
      findUnique: jest.fn(async () => ({
        courseId: 'c1',
        startsAt: new Date('2020-01-01T00:00:00Z'),
        endsAt: new Date('2099-01-01T00:00:00Z'),
      })),
    },
    enrollment: { findUnique: jest.fn(async () => ({ status: 'enrolled' })) },
    courseItem: {
      findUnique: jest.fn(async () => ({
        type: 'tool',
        config: { toolId: 'id-interview', ref: itemRef },
        module: { courseId: 'c1' },
      })),
    },
    scenario: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async (a: any) =>
        a.where.scenarioId === 'ops-001'
          ? textScenario
          : a.where.scenarioId === 'scn-1'
            ? scenario
            : a.where.scenarioId === 'data-001'
              ? sqlScenario
              : null
      ),
    },
    dataset: { findUnique: jest.fn(async (a: any) => datasets[a.where.slug] ?? null) },
    simulationResult: { findUnique: jest.fn(async (a: any) => stored[a.where.id] ?? null) },
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
  async function reachLaunchForm() {
    const start = await platform.startLaunch('u1', 'k1', 'i1')
    const login = await post(start.action, start.fields)
    expect(login.status).toBe(302)
    const cookie = cookieOf(login)
    const auth = await fetch(login.headers.get('location')!, { redirect: 'manual' })
    expect(auth.status).toBe(200)
    return { ...formOf(await auth.text()), cookie }
  }

  beforeAll(async () => {
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
      ],
      providers: [
        DatasetsService,
        { provide: SqlRunnerService, useValue: {} },
        ScenariosService,
        AuthenticatedGuard,
        AdminGuard,
        InstitutionScope,
        { provide: ResultsService, useValue: fakeResults },
        {
          provide: ClerkService,
          useValue: { verifyBearerToken: async () => null, getRole: async () => 'student' },
        },
        LtiPlatformService,
        LtiToolService,
        { provide: LTI_STORE, useValue: new MemoryLtiStore() },
        { provide: PrismaService, useValue: prisma },
        { provide: LearnerService, useValue: { recordToolResult } },
        { provide: InterviewEngineService, useValue: {} },
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
    recordToolResult.mockClear()
    itemRef = 'scn-1'
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
