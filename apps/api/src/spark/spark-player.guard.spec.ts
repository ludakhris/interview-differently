import type { ExecutionContext } from '@nestjs/common'
import { corsOrigin } from '../cors'
import { tenantContext, withTenantContext } from '../core/tenant-context'
import { signPlayerToken, signPreviewToken } from './player-token'
import { SparkPlayerGuard, type SparkPlayerRequest } from './spark-player.guard'

const contextFor = (req: SparkPlayerRequest) =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext

const claims = { sub: 'learner-1', cohortId: 'c1', itemId: 'i1', useId: 'u1' }

describe('SparkPlayerGuard', () => {
  it('accepts a signed lesson link and acts as its learner', () => {
    const req: SparkPlayerRequest = {
      headers: { authorization: `Bearer spark.${signPlayerToken(claims)}` },
    }
    const userId = withTenantContext(() => {
      expect(new SparkPlayerGuard().canActivate(contextFor(req))).toBe(true)
      return tenantContext()?.userId
    })
    expect(userId).toBe('learner-1')
    expect(req.sparkPlayer).toMatchObject(claims)
  })

  it('accepts a reviewer preview link and acts as the reviewer', () => {
    const req: SparkPlayerRequest = {
      headers: {
        authorization: `Bearer spark.${signPreviewToken({ sub: 'reviewer-1', lessonId: 'l1' })}`,
      },
    }
    const userId = withTenantContext(() => {
      expect(new SparkPlayerGuard().canActivate(contextFor(req))).toBe(true)
      return tenantContext()?.userId
    })
    expect(userId).toBe('reviewer-1')
    expect(req.sparkPlayer).toMatchObject({ preview: true, sub: 'reviewer-1', lessonId: 'l1' })
  })

  it('refuses no header, another kind of bearer, and a bad token', () => {
    const guard = new SparkPlayerGuard()
    for (const authorization of [
      undefined,
      `Bearer ${signPlayerToken(claims)}`,
      `Bearer lti.${signPlayerToken(claims)}`,
      'Bearer spark.nope',
    ])
      expect(() => guard.canActivate(contextFor({ headers: { authorization } }))).toThrow('expired')
  })
})

describe('CORS for the player', () => {
  const allows = (origin: string) => {
    let ok: boolean | undefined
    corsOrigin('https://app.example.test')(origin, (_e, allow) => (ok = allow))
    return ok
  }
  afterEach(() => {
    delete process.env.SPARK_WEB_URL
    process.env.NODE_ENV = 'test'
  })

  it("allows exactly SPARK_WEB_URL's origin", () => {
    process.env.NODE_ENV = 'production'
    process.env.SPARK_WEB_URL = 'https://spark.example.test/'
    expect(allows('https://spark.example.test')).toBe(true)
    expect(allows('https://spark.example.test.evil.com')).toBe(false)
    expect(allows('http://spark.example.test')).toBe(false)
  })
})
