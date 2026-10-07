import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common'
import {
  AuthenticatedOrLtiGuard,
  LtiOnlyGuard,
  LtiSessionGuard,
  type LtiRequest,
} from './lti-session.guard'
import type { AuthenticatedGuard } from '../../auth/authenticated.guard'
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
const guard = new AuthenticatedOrLtiGuard(clerkGuard as unknown as AuthenticatedGuard)

describe('AuthenticatedOrLtiGuard with an LTI token', () => {
  it.each([
    ['GET', '/api/scenarios/ops-001', undefined],
    ['GET', '/api/scenarios/ops-001?x=1', undefined],
    ['POST', '/api/results/attempts', { scenarioId: 'ops-001', track: 't' }],
    ['GET', '/api/results/r1', undefined],
    ['POST', '/api/lti/tool/complete', { play: 'text' }],
    ['GET', '/api/lti/tool/play', undefined],
    ['POST', '/api/lti/tool/play/choice', { nodeId: 'n1', choiceId: 'A' }],
    ['POST', '/api/lti/tool/play/quant', { nodeId: 'n1', answer: {} }],
    ['POST', '/api/lti/tool/play/sql', { nodeId: 'n1', sql: 'select 1' }],
    ['POST', '/api/lti/tool/play/hint', { nodeId: 'n1' }],
    ['GET', '/api/lti/tool/session', undefined],
    ['GET', '/api/lti/tool/session?x=1', undefined],
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
    ['POST', '/api/lti/tool/session'],
    ['PUT', '/api/lti/tool/session'],
    ['DELETE', '/api/lti/tool/session'],
    ['GET', '/api/lti/tool/session/extra'],
    ['GET', '/api/lti/tool/jwks'],
    ['GET', '/api/results/attempts/x'],
    // a launched play is scored on the server: a session can no longer save a result of its own
    ['POST', '/api/results'],
    ['PUT', '/api/lti/tool/play'],
    ['GET', '/api/lti/tool/play/choice'],
    ['POST', '/api/lti/tool/play/other'],
    ['POST', '/api/lti/tool/play/choice/extra'],
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

describe('GET /api/lti/tool/session', () => {
  const onlyGuard = new LtiOnlyGuard()
  it('needs an lti token', () => {
    expect(() =>
      onlyGuard.canActivate(ctxOf(reqOf('GET', '/api/lti/tool/session', undefined, null)))
    ).toThrow(UnauthorizedException)
    expect(() =>
      onlyGuard.canActivate(
        ctxOf(reqOf('GET', '/api/lti/tool/session', undefined, 'Bearer clerk.jwt'))
      )
    ).toThrow(UnauthorizedException)
  })

  it('exposes the brand carried by the session on req.lti', () => {
    const brand = { name: 'Acme', primary: '#112233' }
    const req = reqOf('GET', '/api/lti/tool/session', undefined, ltiHeader({ ...session, brand }))
    expect(onlyGuard.canActivate(ctxOf(req))).toBe(true)
    expect(req.lti?.brand).toEqual(brand)
  })

  it('refuses a session whose brand was tampered with', () => {
    const forged = ltiHeader({
      ...session,
      brand: { name: 'Acme', primary: 'red' } as unknown as LtiSession['brand'],
    })
    expect(() =>
      onlyGuard.canActivate(ctxOf(reqOf('GET', '/api/lti/tool/session', undefined, forged)))
    ).toThrow(UnauthorizedException)
  })
})

describe('AuthenticatedOrLtiGuard with an assessment session', () => {
  const asm: LtiSession = { ...session, ref: 'sql-basics', deliveryId: 'd1', datasets: ['ds'] }
  const hdr = ltiHeader(asm)

  it.each([
    ['POST', '/api/me/deliveries/d1/attempts'],
    ['GET', '/api/me/attempts/a1'],
    ['PUT', '/api/me/attempts/a1/answers'],
    ['POST', '/api/me/attempts/a1/submit'],
    ['GET', '/api/me/attempts/a1/result'],
    ['GET', '/api/me/datasets/ds'],
    ['GET', '/api/lti/tool/session'],
    ['POST', '/api/lti/tool/complete'],
  ])('allows %s %s and carries the delivery id', async (method, url) => {
    const req = reqOf(method, url, undefined, hdr)
    expect(await guard.canActivate(ctxOf(req))).toBe(true)
    expect(req.userId).toBe('u1')
    expect(req.lti?.deliveryId).toBe('d1')
  })

  it.each([
    ['POST', '/api/me/deliveries/d2/attempts'], // another delivery
    ['POST', '/api/me/deliveries/d1%2Fx/attempts'],
    ['GET', '/api/me/assessments'],
    ['DELETE', '/api/me/attempts/a1'],
    ['GET', '/api/me/attempts/a1/answers'],
    ['GET', '/api/me/datasets/other'],
    ['GET', '/api/scenarios/sql-basics'], // scenario routes are closed to assessment sessions
    ['POST', '/api/results/attempts'],
    ['GET', '/api/results/r1'],
    ['POST', '/api/immersive-sessions'],
    ['GET', '/api/admin/assessments'],
  ])('refuses %s %s', async (method, url) => {
    await expect(
      guard.canActivate(ctxOf(reqOf(method, url, { scenarioId: 'sql-basics' }, hdr)))
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it.each([
    ['POST', '/api/me/deliveries/d1/attempts'],
    ['GET', '/api/me/attempts/a1'],
    ['PUT', '/api/me/attempts/a1/answers'],
    ['POST', '/api/me/attempts/a1/submit'],
    ['GET', '/api/me/attempts/a1/result'],
  ])('refuses %s %s for a session without a delivery id', async (method, url) => {
    await expect(guard.canActivate(ctxOf(reqOf(method, url)))).rejects.toBeInstanceOf(
      ForbiddenException
    )
  })
})
