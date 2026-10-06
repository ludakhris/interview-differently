import { signSession } from '../lti/tool/lti-session'
import { ScenariosController } from './scenarios.controller'

describe('GET /scenarios with an LTI token', () => {
  it('is an anonymous viewer: the token never reaches Clerk', async () => {
    const clerk = { verifyBearerToken: jest.fn(), getRole: jest.fn() }
    const service = { findAll: jest.fn(async () => ({ scenarios: [], trackMeta: {} })) }
    const ctrl = new ScenariosController(service as any, clerk as any, {} as any)
    const token = signSession({
      sub: 'u1',
      ref: 'S1',
      lineitem: 'http://x/l',
      jti: 'j',
      iat: 1,
      exp: 2,
    })
    await ctrl.findAll(`Bearer lti.${token}`)
    expect(service.findAll).toHaveBeenCalledWith(null)
    expect(clerk.verifyBearerToken).not.toHaveBeenCalled()
  })
})
