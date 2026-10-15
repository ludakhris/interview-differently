import { describe, expect, it } from 'vitest'
import { storageReply } from './platformStorage'

const TOOL = 'https://api.example.test'

describe('storageReply', () => {
  it('keeps a value and gives it back to the same tool', () => {
    const store = new Map<string, string>()
    expect(
      storageReply(store, TOOL, {
        subject: 'lti.put_data',
        message_id: '1',
        key: 'state_abc',
        value: 'nonce-1',
      })
    ).toEqual({
      subject: 'lti.put_data.response',
      message_id: '1',
      key: 'state_abc',
      value: 'nonce-1',
    })
    expect(
      storageReply(store, TOOL, { subject: 'lti.get_data', message_id: '2', key: 'state_abc' })
    ).toEqual({
      subject: 'lti.get_data.response',
      message_id: '2',
      key: 'state_abc',
      value: 'nonce-1',
    })
  })

  it('keeps each origin apart', () => {
    const store = new Map<string, string>()
    storageReply(store, TOOL, { subject: 'lti.put_data', key: 'k', value: 'v' })
    expect(
      storageReply(store, 'https://other.test', { subject: 'lti.get_data', key: 'k' })
    ).toMatchObject({
      error: { code: 'bad_request' },
    })
  })

  it('says what it supports, and ignores anything that is not a storage message', () => {
    expect(storageReply(new Map(), TOOL, { subject: 'lti.capabilities', message_id: 'c' })).toEqual(
      {
        subject: 'lti.capabilities.response',
        message_id: 'c',
        supported_messages: [{ subject: 'lti.put_data' }, { subject: 'lti.get_data' }],
      }
    )
    expect(storageReply(new Map(), TOOL, { subject: 'id.checkpoint.answered' })).toBeNull()
    expect(storageReply(new Map(), TOOL, 'hello')).toBeNull()
  })

  it('refuses a missing key or a non-string value', () => {
    expect(
      storageReply(new Map(), TOOL, { subject: 'lti.put_data', key: 'k', value: 3 })
    ).toMatchObject({
      error: { code: 'bad_request' },
    })
    expect(storageReply(new Map(), TOOL, { subject: 'lti.get_data' })).toMatchObject({
      error: { code: 'bad_request' },
    })
  })
})
