import { BadRequestException } from '@nestjs/common'
import { DidController } from './did.controller'

function setup() {
  const service = {
    createStream: jest.fn().mockResolvedValue({ id: 'strm_1' }),
    sendAnswer: jest.fn().mockResolvedValue({}),
    sendIceCandidate: jest.fn().mockResolvedValue({}),
    sendTalk: jest.fn().mockResolvedValue({}),
    closeStream: jest.fn().mockResolvedValue({}),
  }
  return { service, c: new DidController(service as never) }
}

describe('DidController input checks', () => {
  it('refuses a malformed body with a 400 and calls D-ID for none of them', async () => {
    const { c, service } = setup()
    const bad = (p: Promise<unknown>) => expect(p).rejects.toBeInstanceOf(BadRequestException)
    await bad(c.createStream({ sourceUrl: 42 } as never))
    await bad(c.createStream({ sourceUrl: 'http://example.com/a.png' }))
    await bad(c.sendAnswer('strm_1', { answer: 'sdp', sessionId: 's' } as never))
    await bad(c.sendIce('strm_1', { candidate: 'c', sdpMid: '0', sdpMLineIndex: '0' } as never))
    await bad(c.sendTalk('strm_1', { text: 'x'.repeat(20_001), voiceId: 'v', sessionId: 's' }))
    await bad(c.sendTalk('strm_1', { voiceId: 'v', sessionId: 's' } as never))
    await bad(c.closeStream('strm_1', {} as never))
    expect(Object.values(service).every((f) => f.mock.calls.length === 0)).toBe(true)
  })

  it('refuses a stream id that would reach another D-ID path', async () => {
    const { c, service } = setup()
    for (const id of ['../../clips/x', '..', 'a?b', 'a%2Fb', 'a b'])
      await expect(c.closeStream(id, { sessionId: 's' })).rejects.toBeInstanceOf(
        BadRequestException
      )
    expect(service.closeStream).not.toHaveBeenCalled()
    await c.closeStream('strm_AbC-1.x=', { sessionId: 's' })
    expect(service.closeStream).toHaveBeenCalledTimes(1)
  })

  it('forwards a well-formed request, including an end-of-candidates signal', async () => {
    const { c, service } = setup()
    await c.sendIce('strm_1', { candidate: '', sdpMid: '0', sdpMLineIndex: 0, sessionId: 's' })
    expect(service.sendIceCandidate).toHaveBeenCalledWith('strm_1', '', '0', 0, 's')
    await c.sendTalk('strm_1', { text: 'Hello', voiceId: 'en-GB-RyanNeural', sessionId: 's' })
    expect(service.sendTalk).toHaveBeenCalledWith('strm_1', 'Hello', 'en-GB-RyanNeural', 's')
  })
})
