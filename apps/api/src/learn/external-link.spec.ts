import { parseExternalLink } from './external-link'

describe('parseExternalLink', () => {
  it.each([
    ['https://www.udemy.com/course/safe-lifting/', 'www.udemy.com'],
    ['https://business.udemy.com/path', 'business.udemy.com'],
    ['https://acme.udemy.com/learning-paths/1', 'acme.udemy.com'],
    ['https://www.coursera.org/learn/python', 'www.coursera.org'],
    ['https://www.khanacademy.org/math', 'www.khanacademy.org'],
    ['https://learn.microsoft.com/en-us/training/paths/x/', 'learn.microsoft.com'],
    ['https://skillshop.withgoogle.com/', 'skillshop.withgoogle.com'],
    ['https://www.linkedin.com/learning/excel-tips', 'www.linkedin.com'],
    ['https://WWW.UDEMY.COM/course/x', 'www.udemy.com'],
  ])('accepts %s', (input, host) => {
    expect(parseExternalLink(input)?.host).toBe(host)
  })

  it.each([
    ['plain http', 'http://www.udemy.com/course/x'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    ['lookalike host', 'https://udemy.com.evil.com/course/x'],
    ['lookalike suffix', 'https://notudemy.com/course/x'],
    ['userinfo trick', 'https://www.udemy.com@evil.com/course/x'],
    ['userinfo', 'https://user:pw@www.udemy.com/course/x'],
    ['custom port', 'https://www.udemy.com:8443/course/x'],
    ['not allowlisted', 'https://example.com/course'],
    ['linkedin outside learning', 'https://www.linkedin.com/in/someone'],
    ['linkedin learning lookalike path', 'https://www.linkedin.com/learningx/abc'],
    ['not a url', 'hello world'],
    ['empty', ''],
  ])('rejects %s', (_name, input) => {
    expect(parseExternalLink(input)).toBeNull()
  })

  it('rejects anything that is not text', () => {
    expect(parseExternalLink(undefined)).toBeNull()
    expect(parseExternalLink(42)).toBeNull()
    expect(parseExternalLink({ url: 'https://www.udemy.com/' })).toBeNull()
  })

  it('keeps the query and drops the fragment, and rebuilds the URL from its parts', () => {
    expect(parseExternalLink('https://www.udemy.com/course/x/?couponCode=ABC#reviews')?.url).toBe(
      'https://www.udemy.com/course/x/?couponCode=ABC'
    )
  })
})
