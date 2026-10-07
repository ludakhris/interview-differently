import { describe, expect, it } from 'vitest'
import { infoSections } from './toolsInfoText'

describe('the "How connected tools work" text', () => {
  const sections = infoSections('https://api.example.com/api/')

  it('has the sections in reading order, each with a unique id', () => {
    expect(sections.map((s) => s.id)).toEqual([
      'model',
      'by-hand',
      'by-link',
      'accepts',
      'safety',
      'limits',
    ])
    expect(new Set(sections.map((s) => s.id)).size).toBe(sections.length)
  })

  it("shows this environment's real endpoints, without doubling a trailing slash", () => {
    const code = sections.find((s) => s.id === 'by-link')?.code ?? ''
    expect(code).toContain('GET  https://api.example.com/api/lti/platform/openid-configuration')
    expect(code).toContain('POST https://api.example.com/api/lti/platform/registration')
    expect(code).not.toContain('//lti')
  })

  it('numbers the registration steps and says the tool arrives switched off', () => {
    const steps = sections.find((s) => s.id === 'by-link')
    expect(steps?.ordered).toBe(true)
    expect(steps?.items).toHaveLength(5)
    expect(steps?.items?.join(' ')).toMatch(/switched off/)
  })

  it('states the safety rules that the platform enforces', () => {
    const text = JSON.stringify(sections.find((s) => s.id === 'safety'))
    for (const fact of ['hash', '15 minutes', 'works once', '32 KB', 'switched off', 'history'])
      expect(text).toContain(fact)
  })

  it('every section has some text to show', () => {
    for (const s of sections)
      expect(s.paragraphs.length + (s.items?.length ?? 0)).toBeGreaterThan(0)
  })
})
