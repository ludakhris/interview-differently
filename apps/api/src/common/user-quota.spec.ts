import { HttpException } from '@nestjs/common'
import { UserQuota } from './user-quota'

describe('UserQuota', () => {
  it('allows up to max, then throws 429, per key', () => {
    const q = new UserQuota(2, 1000)
    q.assert('a', 0)
    q.assert('a', 1)
    expect(() => q.assert('a', 2)).toThrow(HttpException)
    expect(() => q.assert('b', 2)).not.toThrow()
  })

  it('frees the window after it elapses', () => {
    const q = new UserQuota(1, 1000)
    q.assert('a', 0)
    expect(() => q.assert('a', 500)).toThrow()
    expect(() => q.assert('a', 1001)).not.toThrow()
  })
})
