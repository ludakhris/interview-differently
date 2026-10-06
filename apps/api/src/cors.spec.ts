import { corsOrigin } from './cors'

function check(frontendUrl: string | undefined, origin: string | undefined): boolean | undefined {
  let result: boolean | undefined
  corsOrigin(frontendUrl)(origin, (_err, allow) => {
    result = allow
  })
  return result
}

describe('corsOrigin', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production'
  })

  it('allows every origin in a comma-separated FRONTEND_URL', () => {
    const list = 'https://app.interviewdifferently.com, https://www.interviewdifferently.com'
    expect(check(list, 'https://app.interviewdifferently.com')).toBe(true)
    expect(check(list, 'https://www.interviewdifferently.com')).toBe(true)
    expect(check(list, 'https://other.example.com')).toBe(false)
  })

  it('falls back to the local frontend when FRONTEND_URL is unset', () => {
    expect(check(undefined, 'http://localhost:5173')).toBe(true)
  })

  it('allows learndifferently.tech and any tenant subdomain', () => {
    expect(check('https://app.interviewdifferently.com', 'https://learndifferently.tech')).toBe(
      true
    )
    expect(
      check('https://app.interviewdifferently.com', 'https://delaware.learndifferently.tech')
    ).toBe(true)
  })

  it('rejects lookalike hosts', () => {
    const f = 'https://app.interviewdifferently.com'
    expect(check(f, 'https://learndifferently.tech.evil.com')).toBe(false)
    expect(check(f, 'https://evillearndifferently.tech')).toBe(false)
    expect(check(f, 'http://delaware.learndifferently.tech')).toBe(false)
  })

  it('allows localhost tenants only outside production', () => {
    expect(check('https://x.example.com', 'http://delaware.localhost:5174')).toBe(false)
    process.env.NODE_ENV = 'development'
    expect(check('https://x.example.com', 'http://delaware.localhost:5174')).toBe(true)
  })

  it('allows requests with no Origin header', () => {
    expect(check('https://x.example.com', undefined)).toBe(true)
  })
})
