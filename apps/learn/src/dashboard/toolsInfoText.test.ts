import { describe, expect, it } from 'vitest'
import { INFO_SECTION_IDS, infoSections, registrationUrls } from './toolsInfoText'

const served = {
  configurationUrl: 'https://platform.example/api/lti/platform/openid-configuration',
  registrationUrl: 'https://platform.example/api/lti/platform/registration',
}

describe('registrationUrls', () => {
  it('uses the addresses the platform served', () => {
    expect(registrationUrls(served, 'https://other.example/api')).toEqual(served)
  })
  it('falls back to the API address without doubling a trailing slash', () => {
    const u = registrationUrls(undefined, 'https://api.example.com/api/')
    expect(u.configurationUrl).toBe('https://api.example.com/api/lti/platform/openid-configuration')
    expect(u.registrationUrl).toBe('https://api.example.com/api/lti/platform/registration')
  })
})

describe('the "How connected tools work" text', () => {
  const c = infoSections(served)

  it('has unique, ordered section ids', () => {
    expect(new Set(INFO_SECTION_IDS).size).toBe(INFO_SECTION_IDS.length)
    expect(INFO_SECTION_IDS[0]).toBe('model')
  })

  it('shows the addresses it was given, public GET and token-protected POST', () => {
    expect(c.endpoints.map((e) => [e.method, e.url])).toEqual([
      ['GET', served.configurationUrl],
      ['POST', served.registrationUrl],
    ])
    expect(c.endpoints[0].access).toBe('Public')
    expect(c.endpoints[1].access).toMatch(/token/)
  })

  it('walks five steps with named actors, ending switched off then on', () => {
    expect(c.steps.map((s) => s.actor)).toEqual([
      'You',
      'The tool',
      'The tool',
      'LearnDifferently',
      'You',
    ])
    expect(c.steps.map((s) => s.text).join(' ')).toMatch(/switched off/)
  })

  it('says what is accepted and what is refused', () => {
    expect(c.accepts.join(' ')).toMatch(/private_key_jwt/)
    expect(c.refuses.join(' ')).toMatch(/inline/)
    expect(c.refuses.join(' ')).toMatch(/169\.254/)
    // things that are tidied or ignored are not listed as refused
    expect(c.refuses.join(' ')).not.toMatch(/ignored|removed/)
  })

  it('explains the one-to-many relation', () => {
    expect(c.glance.relation).toContain('1 connection')
  })

  it('states the safety rules the platform enforces', () => {
    const text = c.safety.join(' ')
    for (const fact of ['hash', '15 minutes', 'works once', '32 KB', 'switched off', 'history'])
      expect(text).toContain(fact)
  })
})
