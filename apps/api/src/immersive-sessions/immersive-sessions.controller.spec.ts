import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { MemoryLtiStore } from '../lti/lti-store'
import { ImmersiveSessionsController } from './immersive-sessions.controller'

const lti = { ref: 'S1', jti: 'j', iat: 0, exp: 0, lineitem: 'x' }

function setup(found: { userId: string; scenarioId: string } | null) {
  const service = {
    getSessionRef: jest.fn().mockResolvedValue(found),
    getSessionOwner: jest.fn().mockResolvedValue(found?.userId ?? null),
    getSession: jest.fn().mockResolvedValue({ id: 's1' }),
    getResponse: jest.fn().mockResolvedValue({ id: 'r1' }),
    getResponseSignedUrl: jest.fn().mockResolvedValue({ url: 'u', expiresAt: 'e' }),
    createSession: jest.fn().mockResolvedValue({ id: 's1' }),
    createResponse: jest.fn().mockResolvedValue({ id: 'r1' }),
  }
  const clerk = { isAdmin: jest.fn().mockResolvedValue(true) }
  const c = new ImmersiveSessionsController(
    service as any,
    { transcribe: jest.fn() } as any,
    clerk as any,
    new MemoryLtiStore()
  )
  return { c, service, clerk }
}

describe('ImmersiveSessionsController for an LTI session', () => {
  const req = { userId: 'u1', lti } as any

  it('serves its own session of its ref', async () => {
    const { c, service } = setup({ userId: 'u1', scenarioId: 'S1' })
    await expect(c.getSession(req, 's1')).resolves.toEqual({ id: 's1' })
    await expect(c.getResponse(req, 's1', 'r1')).resolves.toEqual({ id: 'r1' })
    await expect(c.getResponseMediaUrl(req, 's1', 'r1')).resolves.toBeDefined()
    await c.createResponse(req, 's1', { nodeId: 'n', questionText: 'q' })
    expect(service.createResponse).toHaveBeenCalled()
  })

  it.each([
    ['another learner', { userId: 'u2', scenarioId: 'S1' }],
    ['another scenario', { userId: 'u1', scenarioId: 'S2' }],
  ])('refuses a session of %s, with no admin override', async (_n, found) => {
    const { c, service, clerk } = setup(found)
    await expect(c.getSession(req, 's1')).rejects.toBeInstanceOf(ForbiddenException)
    await expect(c.getResponse(req, 's1', 'r1')).rejects.toBeInstanceOf(ForbiddenException)
    await expect(c.getResponseMediaUrl(req, 's1', 'r1')).rejects.toBeInstanceOf(ForbiddenException)
    await expect(
      c.createResponse(req, 's1', { nodeId: 'n', questionText: 'q' })
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(service.getSession).not.toHaveBeenCalled()
    expect(service.createResponse).not.toHaveBeenCalled()
    expect(clerk.isAdmin).not.toHaveBeenCalled()
  })

  it('404s an unknown session', async () => {
    const { c } = setup(null)
    await expect(c.getSession(req, 's1')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('creates the session for the token learner, whatever the body says', async () => {
    const { c, service } = setup(null)
    await c.createSession(req, { scenarioId: 'S1', userId: 'attacker' } as any)
    expect(service.createSession).toHaveBeenCalledWith('S1', 'u1')
  })

  it('rate limits writes per learner', async () => {
    const { c } = setup(null)
    for (let i = 0; i < 20; i++) await c.createSession(req, { scenarioId: 'S1' })
    await expect(c.createSession(req, { scenarioId: 'S1' })).rejects.toMatchObject({ status: 429 })
  })
})

describe('ImmersiveSessionsController for a Clerk user', () => {
  it('keeps own-or-admin and never reads the LTI scenario check', async () => {
    const { c, service, clerk } = setup({ userId: 'owner', scenarioId: 'any' })
    await expect(c.getSession({ userId: 'owner' } as any, 's1')).resolves.toBeDefined()
    clerk.isAdmin.mockResolvedValueOnce(false)
    await expect(c.getSession({ userId: 'other' } as any, 's1')).rejects.toBeInstanceOf(
      ForbiddenException
    )
    expect(service.getSessionRef).not.toHaveBeenCalled()
  })
})
