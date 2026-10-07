import { describe, expect, it } from 'vitest'
import {
  heardNothing,
  isVoiceInterview,
  mediaErrorMessage,
  NO_SPEECH_TRANSCRIPT,
  transcriptsReady,
} from '../immersiveLti'

describe('isVoiceInterview', () => {
  const persona = { presenterId: 'p', voiceId: 'v' }
  it('needs immersive mode and a full persona', () => {
    expect(isVoiceInterview({ mode: 'immersive', interviewer: persona })).toBe(true)
    expect(isVoiceInterview({ mode: 'immersive' })).toBe(false)
    expect(isVoiceInterview({ mode: 'immersive', interviewer: { presenterId: 'p' } })).toBe(false)
    expect(isVoiceInterview({ mode: 'text', interviewer: persona })).toBe(false)
    expect(isVoiceInterview({ interviewer: persona })).toBe(false)
  })
})

describe('transcriptsReady', () => {
  it('is true only when every node has a non-empty transcript', () => {
    const r = (nodeId: string, transcript: string | null) => ({ nodeId, transcript })
    expect(transcriptsReady([r('a', 'x'), r('b', 'y')], ['a', 'b'])).toBe(true)
    expect(transcriptsReady([r('a', 'x'), r('b', null)], ['a', 'b'])).toBe(false)
    expect(transcriptsReady([r('a', 'x'), r('b', '  ')], ['a', 'b'])).toBe(false)
    expect(transcriptsReady([r('a', 'x')], ['a', 'b'])).toBe(false)
    expect(transcriptsReady([], [])).toBe(false)
  })

  it('uses the latest response of a node', () => {
    const r = (nodeId: string, transcript: string | null) => ({ nodeId, transcript })
    expect(transcriptsReady([r('a', 'x'), r('a', null)], ['a'])).toBe(false)
    expect(transcriptsReady([r('a', null), r('a', 'x')], ['a'])).toBe(true)
  })
})

describe('mediaErrorMessage', () => {
  it('says what to do for a blocked or missing device', () => {
    expect(mediaErrorMessage({ name: 'NotAllowedError' })).toMatch(/blocked/)
    expect(mediaErrorMessage({ name: 'NotFoundError' })).toMatch(/No microphone/)
    expect(mediaErrorMessage({ name: 'NotReadableError' })).toMatch(/in use/)
    expect(mediaErrorMessage(new TypeError('x'))).toMatch(/Could not access/)
  })
})

describe('heardNothing', () => {
  it('is true only for the no-speech marker', () => {
    expect(heardNothing(NO_SPEECH_TRANSCRIPT)).toBe(true)
    expect(heardNothing('I would page the on-call.')).toBe(false)
    expect(heardNothing(null)).toBe(false)
  })
})
