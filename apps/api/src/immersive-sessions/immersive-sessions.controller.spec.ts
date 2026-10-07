import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { MemoryLtiStore } from '../lti/lti-store'
import {
  ImmersiveSessionsController,
  NO_SPEECH_TRANSCRIPT,
  TRANSCRIPTION_FAILED,
} from './immersive-sessions.controller'

const lti = { ref: 'S1', jti: 'j', iat: 0, exp: 0, lineitem: 'x' }

function setup(
  found: { userId: string; scenarioId: string } | null,
  transcribe: jest.Mock = jest.fn()
) {
  const service = {
    getSessionRef: jest.fn().mockResolvedValue(found),
    getSessionOwner: jest.fn().mockResolvedValue(found?.userId ?? null),
    getSession: jest.fn().mockResolvedValue({ id: 's1' }),
    getResponse: jest.fn().mockResolvedValue({ id: 'r1' }),
    getResponseSignedUrl: jest.fn().mockResolvedValue({ url: 'u', expiresAt: 'e' }),
    createSession: jest.fn().mockResolvedValue({ id: 's1' }),
    createResponse: jest.fn().mockResolvedValue({ id: 'r1' }),
    updateTranscript: jest.fn().mockResolvedValue({}),
    storeResponseMedia: jest.fn().mockResolvedValue(undefined),
  }
  const clerk = { isAdmin: jest.fn().mockResolvedValue(true) }
  const c = new ImmersiveSessionsController(
    service as never,
    { transcribe } as never,
    clerk as never,
    new MemoryLtiStore()
  )
  return { c, service, clerk }
}

describe('ImmersiveSessionsController for an LTI session', () => {
  const req = { userId: 'u1', lti } as never

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
    await c.createSession(req, { scenarioId: 'S1', userId: 'attacker' } as never)
    expect(service.createSession).toHaveBeenCalledWith('S1', 'u1', true)
  })

  it('rate limits writes per learner', async () => {
    const { c } = setup(null)
    for (let i = 0; i < 20; i++) await c.createSession(req, { scenarioId: 'S1' })
    await expect(c.createSession(req, { scenarioId: 'S1' })).rejects.toMatchObject({ status: 429 })
  })
})

describe('ImmersiveSessionsController session creation', () => {
  it('does not abandon other sessions for a signed-in (non-LTI) user', async () => {
    const { c, service } = setup(null)
    await c.createSession({ userId: 'u1' } as never, { scenarioId: 'S1' })
    expect(service.createSession).toHaveBeenCalledWith('S1', 'u1', false)
  })
})

describe('ImmersiveSessionsController for a Clerk user', () => {
  it('keeps own-or-admin and never reads the LTI scenario check', async () => {
    const { c, service, clerk } = setup({ userId: 'owner', scenarioId: 'any' })
    await expect(c.getSession({ userId: 'owner' } as never, 's1')).resolves.toBeDefined()
    clerk.isAdmin.mockResolvedValueOnce(false)
    await expect(c.getSession({ userId: 'other' } as never, 's1')).rejects.toBeInstanceOf(
      ForbiddenException
    )
    expect(service.getSessionRef).not.toHaveBeenCalled()
  })
})

describe('ImmersiveSessionsController transcripts', () => {
  const req = { userId: 'u1', lti } as never
  const file = { buffer: Buffer.from('a'), originalname: 'r.webm', mimetype: 'audio/webm' }
  const upload = async (transcript: string | null) => {
    const { c, service } = setup(
      { userId: 'u1', scenarioId: 'S1' },
      jest.fn().mockResolvedValue(transcript)
    )
    await c.createResponse(req, 's1', { nodeId: 'n1', questionText: 'q' }, file as never)
    await new Promise((r) => setImmediate(r))
    return service.updateTranscript
  }

  it('stores what was heard', async () => {
    expect(await upload(' I would page the on-call. ')).toHaveBeenCalledWith(
      'r1',
      'I would page the on-call.'
    )
  })

  it('stores a no-speech marker for silence, so the player does not wait forever', async () => {
    expect(await upload('')).toHaveBeenCalledWith('r1', NO_SPEECH_TRANSCRIPT)
  })

  it('treats a stray word or two from room noise as no speech', async () => {
    expect(await upload('Bye.')).toHaveBeenCalledWith('r1', NO_SPEECH_TRANSCRIPT)
    expect(await upload(' Thank you. ')).toHaveBeenCalledWith('r1', NO_SPEECH_TRANSCRIPT)
  })

  it('stores a failure marker when transcription itself failed, so the player can ask again', async () => {
    expect(await upload(null)).toHaveBeenCalledWith('r1', TRANSCRIPTION_FAILED)
  })

  it('retries a failed transcript write once', async () => {
    const { c, service } = setup(
      { userId: 'u1', scenarioId: 'S1' },
      jest.fn().mockResolvedValue('I would page the on-call lead.')
    )
    service.updateTranscript.mockRejectedValueOnce(new Error('db')).mockResolvedValue({})
    await c.createResponse(req, 's1', { nodeId: 'n1', questionText: 'q' }, file as never)
    await new Promise((r) => setImmediate(r))
    expect(service.updateTranscript).toHaveBeenCalledTimes(2)
    expect(service.updateTranscript).toHaveBeenLastCalledWith(
      'r1',
      'I would page the on-call lead.'
    )
  })

  it('falls back to the failure marker when the transcript write keeps failing', async () => {
    const { c, service } = setup(
      { userId: 'u1', scenarioId: 'S1' },
      jest.fn().mockResolvedValue('I would page the on-call lead.')
    )
    service.updateTranscript
      .mockRejectedValueOnce(new Error('db'))
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValue({})
    await c.createResponse(req, 's1', { nodeId: 'n1', questionText: 'q' }, file as never)
    await new Promise((r) => setImmediate(r))
    expect(service.updateTranscript).toHaveBeenLastCalledWith('r1', TRANSCRIPTION_FAILED)
  })

  it('writes the failure marker when transcribe unexpectedly throws', async () => {
    const { c, service } = setup(
      { userId: 'u1', scenarioId: 'S1' },
      jest.fn().mockRejectedValue(new Error('boom'))
    )
    await c.createResponse(req, 's1', { nodeId: 'n1', questionText: 'q' }, file as never)
    await new Promise((r) => setImmediate(r))
    expect(service.updateTranscript).toHaveBeenCalledWith('r1', TRANSCRIPTION_FAILED)
  })
})
