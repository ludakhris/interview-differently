import { isLearnOrigin, resolveLearnOrigin } from './lti-env'

describe('isLearnOrigin', () => {
  const learn = 'https://learndifferently.tech'

  it.each([
    ['https://learndifferently.tech'],
    ['https://learndifferently.tech/lms/learning/k1/i1'],
    ['https://delaware.learndifferently.tech'],
    ['https://delaware.learndifferently.tech/lms/learning/k1/i1'],
    ['https://a.b.learndifferently.tech'],
    ['https://DELAWARE.LearnDifferently.tech'],
  ])('accepts %p', (value) => {
    expect(isLearnOrigin(value, learn)).toBe(true)
  })

  it.each([
    ['https://evil-learndifferently.tech'],
    ['https://learndifferently.tech.evil.com'],
    ['https://evil.com'],
    ['https://learndifferently.tech@evil.com'],
    ['https://delaware.learndifferently.tech@evil.com'],
    ['https://user:pw@delaware.learndifferently.tech'],
    ['https://user@learndifferently.tech'],
    ['http://delaware.learndifferently.tech'],
    ['http://learndifferently.tech'],
    ['ftp://delaware.learndifferently.tech'],
    ['javascript:alert(1)'],
    ['https://delaware.learndifferently.tech:8443'],
    ['https://learndifferently.tech:8443'],
    ['https://learndifferently.tech.'],
    ['https://.learndifferently.tech'],
    ['https://a..learndifferently.tech'],
    ['not a url'],
    [''],
    [42],
    [undefined],
    [null],
  ])('rejects %p', (value) => {
    expect(isLearnOrigin(value, learn)).toBe(false)
  })

  it('accepts the exact local development origin, including http and a port', () => {
    const local = 'http://localhost:5174'
    expect(isLearnOrigin('http://localhost:5174', local)).toBe(true)
    expect(isLearnOrigin('http://localhost:5174/lms/x', local)).toBe(true)
    expect(isLearnOrigin('http://localhost:5175', local)).toBe(false)
    // https on the same host and port is the same rule as production (https + the learn hostname)
    expect(isLearnOrigin('https://localhost:5174', local)).toBe(true)
    expect(isLearnOrigin('http://localhost:5174@evil.test', local)).toBe(false)
    expect(isLearnOrigin('http://evil.localhost:5174', local)).toBe(false)
  })

  it('accepts a tenant host only on the learn port when the learn URL has one', () => {
    const withPort = 'https://learn.test:8443'
    expect(isLearnOrigin('https://delaware.learn.test:8443', withPort)).toBe(true)
    expect(isLearnOrigin('https://delaware.learn.test', withPort)).toBe(false)
  })

  it('rejects everything when the learn URL is not a URL', () => {
    expect(isLearnOrigin('https://learndifferently.tech', 'nope')).toBe(false)
  })
})

describe('resolveLearnOrigin', () => {
  it('uses LTI_LEARN_URL with trailing slashes trimmed, whatever the database host', () => {
    expect(resolveLearnOrigin('https://learndifferently.tech/', 'db.rlwy.net')).toBe(
      'https://learndifferently.tech'
    )
  })

  it.each([['localhost'], ['127.0.0.1']])('falls back to localhost for a %s database', (host) => {
    expect(resolveLearnOrigin(undefined, host)).toBe('http://localhost:5174')
    expect(resolveLearnOrigin('  ', host)).toBe('http://localhost:5174')
  })

  it.each([['zephyr.proxy.rlwy.net'], ['db.example.com']])(
    'throws for a %s database when LTI_LEARN_URL is unset',
    (host) => {
      expect(() => resolveLearnOrigin(undefined, host)).toThrow('LTI_LEARN_URL is not set')
    }
  )
})
