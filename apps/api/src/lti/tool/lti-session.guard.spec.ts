import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common'
import {
  AuthenticatedOrLtiGuard,
  LtiOnlyGuard,
  LtiSessionGuard,
  type LtiRequest,
} from './lti-session.guard'
import { signSession, type LtiSession } from './lti-session'

const session: LtiSession = {
  sub: 'u1',
  ref: 'ops-001',
  lineitem: 'http://api.test/api/lti/platform/ags/c1/lineitems/i1',
  returnUrl: 'http://learn.test/back',
  jti: 'j1',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
}
const ltiHeader = (s = session) => `Bearer lti.${signSession(s)}`

const ctxOf = (req: Partial<LtiRequest>) =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext
const reqOf = (method: string, url: string, body?: unknown, auth: string | null = ltiHeader()) =>
  ({
    method,
    url,
    originalUrl: url,
    body,
    headers: { authorization: auth ?? undefined },
  }) as LtiRequest

const clerkGuard = { canActivate: jest.fn(async () => true) }
const guard = new AuthenticatedOrLtiGuard(clerkGuard as any)

describe('AuthenticatedOrLtiGuard with an LTI token', () => {
  it.each([
    ['GET', '/api/scenarios/ops-001', undefined],
    ['GET', '/api/scenarios/ops-001?x=1', undefined],
    ['POST', '/api/results/attempts', { scenarioId: 'ops-001', track: 't' }],
    ['POST', '/api/results', { scenarioId: 'ops-001', userId: 'someone-else' }],
    ['GET', '/api/results/r1', undefined],
    ['POST', '/api/lti/tool/complete', { resultId: 'r1' }],
  ])('allows %s %s and forces the learner from the token', async (method, url, body) => {
    const req = reqOf(method, url, body)
    expect(await guard.canActivate(ctxOf(req))).toBe(true)
    expect(req.userId).toBe('u1')
    expect(req.lti).toEqual({
      ref: 'ops-001',
      jti: 'j1',
      iat: session.iat,
      lineitem: session.lineitem,
      returnUrl: session.returnUrl,
      exp: session.exp,
    })
    expect(clerkGuard.canActivate).not.toHaveBeenCalled()
  })

  it.each([
    ['GET', '/api/scenarios'],
    ['GET', '/api/scenarios/other-scenario'],
    ['GET', '/api/scenarios/ops-001/extra'],
    ['PUT', '/api/scenarios/ops-001'],
    ['DELETE', '/api/scenarios/ops-001'],
    ['PATCH', '/api/scenarios/ops-001/publish'],
    ['POST', '/api/scenarios'],
    ['GET', '/api/results/profile/u1'],
    ['GET', '/api/results/r1/ai-feedback'],
    ['DELETE', '/api/results/r1'],
    ['GET', '/api/learn/me/cohorts'],
    ['GET', '/api/admin/students'],
    ['POST', '/api/lti/tool/submit'],
    ['GET', '/api/lti/tool/complete'],
    ['GET', '/api/results/attempts/x'],
  ])('refuses %s %s', async (method, url) => {
    await expect(guard.canActivate(ctxOf(reqOf(method, url)))).rejects.toBeInstanceOf(
      ForbiddenException
    )
  })

  it('refuses an encoded dataset slug that decodes to another one', async () => {
    await expect(
      guard.canActivate(ctxOf(reqOf('GET', '/api/me/datasets/sql-fundamentals%2F..%2Fother')))
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuses a result or attempt for another scenario, or without a scenario', async () => {
    for (const [url, body] of [
      ['/api/results', { scenarioId: 'other' }],
      ['/api/results', {}],
      ['/api/results/attempts', { scenarioId: 'other' }],
      ['/api/results/attempts', undefined],
    ] as const)
      await expect(guard.canActivate(ctxOf(reqOf('POST', url, body)))).rejects.toBeInstanceOf(
        ForbiddenException
      )
  })

  it('refuses an encoded scenario id that decodes to another one', async () => {
    await expect(
      guard.canActivate(ctxOf(reqOf('GET', '/api/scenarios/ops-001%2F..%2Fother')))
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuses an expired, tampered or foreign token with 401', async () => {
    const bad = [
      ltiHeader({ ...session, exp: 1 }),
      `${ltiHeader()}x`,
      'Bearer lti.junk',
      `Bearer lti.${signSession(session, 'other-secret')}`,
    ]
    for (const auth of bad)
      await expect(
        guard.canActivate(ctxOf(reqOf('GET', '/api/scenarios/ops-001', undefined, auth)))
      ).rejects.toBeInstanceOf(UnauthorizedException)
  })
})

describe('AuthenticatedOrLtiGuard datasets with an LTI token', () => {
  const sqlSession = { ...session, datasets: ['sql-fundamentals'] }
  const withSql = (method: string, url: string) =>
    reqOf(method, url, undefined, ltiHeader(sqlSession))

  it('allows reading the dataset the launched scenario uses', async () => {
    for (const url of [
      '/api/me/datasets/sql-fundamentals',
      '/api/me/datasets/sql-fundamentals?x=1',
      '/api/me/datasets/sql-fundamentals/',
    ]) {
      const req = withSql('GET', url)
      expect(await guard.canActivate(ctxOf(req))).toBe(true)
      expect(req.userId).toBe('u1')
    }
  })

  it.each([
    ['GET', '/api/me/datasets/other-dataset'],
    ['GET', '/api/me/datasets'],
    ['GET', '/api/me/datasets/sql-fundamentals/extra'],
    ['GET', '/api/admin/datasets'],
    ['GET', '/api/admin/datasets/sql-fundamentals'],
    ['GET', '/api/admin/datasets/cohort-options'],
    ['POST', '/api/admin/datasets'],
    ['POST', '/api/admin/datasets/validate'],
    ['PUT', '/api/admin/datasets/sql-fundamentals'],
    ['PUT', '/api/admin/datasets/sql-fundamentals/cohorts'],
    ['DELETE', '/api/admin/datasets/sql-fundamentals'],
    ['POST', '/api/me/datasets/sql-fundamentals'],
    ['PUT', '/api/me/datasets/sql-fundamentals'],
    ['DELETE', '/api/me/datasets/sql-fundamentals'],
  ])('refuses %s %s', async (method, url) => {
    await expect(guard.canActivate(ctxOf(withSql(method, url)))).rejects.toBeInstanceOf(
      ForbiddenException
    )
  })

  it('refuses every dataset for a session without a datasets claim', async () => {
    await expect(
      guard.canActivate(ctxOf(reqOf('GET', '/api/me/datasets/sql-fundamentals')))
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})

describe('AuthenticatedOrLtiGuard on immersive routes', () => {
  it.each([
    ['POST', '/api/immersive-sessions', { scenarioId: 'ops-001', userId: 'someone-else' }],
    ['POST', '/api/immersive-sessions/s1/responses', undefined],
    ['GET', '/api/immersive-sessions/s1', undefined],
    ['GET', '/api/immersive-sessions/s1/responses/r1', undefined],
    ['GET', '/api/immersive-sessions/s1/responses/r1/media-url', undefined],
  ])('allows %s %s and forces the learner from the token', async (method, url, body) => {
    const req = reqOf(method, url, body)
    expect(await guard.canActivate(ctxOf(req))).toBe(true)
    expect(req.userId).toBe('u1')
    expect(req.lti?.ref).toBe('ops-001')
  })

  it.each([
    ['POST', '/api/immersive-sessions', { scenarioId: 'other' }],
    ['POST', '/api/immersive-sessions', {}],
    ['POST', '/api/immersive-sessions', undefined],
    ['GET', '/api/immersive-sessions/user/u1', undefined],
    ['GET', '/api/immersive-sessions', undefined],
    ['GET', '/api/immersive-sessions/s1/summary', undefined],
    ['GET', '/api/immersive-sessions/s1/responses', undefined],
    ['POST', '/api/immersive-sessions/s1', undefined],
    ['POST', '/api/immersive-sessions/s1/responses/r1', undefined],
    ['PUT', '/api/immersive-sessions/s1', undefined],
    ['DELETE', '/api/immersive-sessions/s1', undefined],
    ['POST', '/api/scenario-media/render/ops-001/n1', undefined],
    ['DELETE', '/api/scenario-media/ops-001/n1', undefined],
  ])('refuses %s %s', async (method, url, body) => {
    await expect(guard.canActivate(ctxOf(reqOf(method, url, body)))).rejects.toBeInstanceOf(
      ForbiddenException
    )
  })
})

describe('a Clerk token', () => {
  it('still goes to the existing guard, unchanged, for any route', async () => {
    clerkGuard.canActivate.mockClear()
    const ctx = ctxOf(reqOf('GET', '/api/results/profile/u1', undefined, 'Bearer clerk.jwt'))
    expect(await guard.canActivate(ctx)).toBe(true)
    expect(clerkGuard.canActivate).toHaveBeenCalledWith(ctx)
    clerkGuard.canActivate.mockRejectedValueOnce(new UnauthorizedException('Missing Bearer token'))
    await expect(
      guard.canActivate(ctxOf(reqOf('GET', '/api/results/r1', undefined, null)))
    ).rejects.toThrow('Missing Bearer token')
  })
})

describe('LtiSessionGuard', () => {
  const g = new LtiSessionGuard()
  it('lets anonymous and Clerk requests through untouched', () => {
    const anon = reqOf('GET', '/api/scenarios', undefined, null)
    expect(g.canActivate(ctxOf(anon))).toBe(true)
    expect(anon.lti).toBeUndefined()
    expect(g.canActivate(ctxOf(reqOf('PUT', '/api/scenarios/x', {}, 'Bearer clerk.jwt')))).toBe(
      true
    )
  })
  it('limits an LTI token to its own scenario', () => {
    const own = reqOf('GET', '/api/scenarios/ops-001')
    expect(g.canActivate(ctxOf(own))).toBe(true)
    expect(own.lti?.ref).toBe('ops-001')
    for (const [m, u] of [
      ['POST', '/api/scenarios'],
      ['GET', '/api/scenarios/x'],
      ['PUT', '/api/scenarios/ops-001'],
    ])
      expect(() => g.canActivate(ctxOf(reqOf(m, u)))).toThrow(ForbiddenException)
  })
})

describe('LtiSessionGuard on the scenario list', () => {
  const g = new LtiSessionGuard()
  it('lets a valid LTI token read the list as an anonymous viewer', () => {
    for (const url of ['/api/scenarios', '/api/scenarios/', '/api/scenarios?x=1']) {
      const req = reqOf('GET', url)
      expect(g.canActivate(ctxOf(req))).toBe(true)
      expect(req.userId).toBeUndefined()
      expect(req.lti).toBeUndefined()
    }
  })
  it('still refuses an invalid token and any other method on the list', () => {
    expect(() =>
      g.canActivate(ctxOf(reqOf('GET', '/api/scenarios', undefined, 'Bearer lti.junk')))
    ).toThrow(UnauthorizedException)
    expect(() => g.canActivate(ctxOf(reqOf('POST', '/api/scenarios', {})))).toThrow(
      ForbiddenException
    )
  })
})

describe('LtiOnlyGuard', () => {
  const g = new LtiOnlyGuard()
  it('requires an LTI token', () => {
    expect(() => g.canActivate(ctxOf(reqOf('POST', '/api/lti/tool/complete', {}, null)))).toThrow(
      UnauthorizedException
    )
    expect(() =>
      g.canActivate(ctxOf(reqOf('POST', '/api/lti/tool/complete', {}, 'Bearer clerk.jwt')))
    ).toThrow(UnauthorizedException)
    expect(g.canActivate(ctxOf(reqOf('POST', '/api/lti/tool/complete', {})))).toBe(true)
  })
})
