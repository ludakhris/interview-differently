import { describe, expect, it, vi } from 'vitest'
import { copyText, infoContent, INFO_SECTION_IDS, toolEndpoints } from '../ltiPlatformsInfo'

describe('toolEndpoints', () => {
  it('uses what the API sent', () => {
    const sent = {
      registrationUrl: 'https://a.example/r',
      loginUrl: 'https://a.example/l',
      launchUrl: 'https://a.example/x',
      jwksUrl: 'https://a.example/k',
    }
    expect(toolEndpoints(sent, 'http://localhost:3000')).toEqual(sent)
  })

  it('derives from the API address when the API sent nothing', () => {
    const e = toolEndpoints(undefined, 'https://api.example.com/')
    expect(e.registrationUrl).toBe('https://api.example.com/api/lti/tool/register')
    expect(e.loginUrl).toBe('https://api.example.com/api/lti/tool/login')
    expect(e.launchUrl).toBe('https://api.example.com/api/lti/tool/launch')
    expect(e.jwksUrl).toBe('https://api.example.com/api/lti/tool/jwks')
  })

  it('fills only the missing ones', () => {
    const e = toolEndpoints({ jwksUrl: 'https://real.example/keys' }, 'https://api.example.com')
    expect(e.jwksUrl).toBe('https://real.example/keys')
    expect(e.loginUrl).toBe('https://api.example.com/api/lti/tool/login')
  })
})

describe('infoContent', () => {
  const e = toolEndpoints(undefined, 'https://api.example.com')
  const c = infoContent(e)

  it('has every part, and a section id for each group', () => {
    expect(INFO_SECTION_IDS).toHaveLength(7)
    for (const list of [
      c.glance,
      c.steps,
      c.approval,
      c.addresses,
      c.accepts,
      c.refuses,
      c.safety,
      c.notes,
    ])
      expect(list.length).toBeGreaterThan(0)
  })

  it('puts the real addresses in the table, never a placeholder', () => {
    expect(c.addresses.map((a) => a.url)).toEqual([
      e.registrationUrl,
      e.loginUrl,
      e.launchUrl,
      e.jwksUrl,
    ])
    expect(JSON.stringify(c)).not.toContain('localhost')
  })

  it('names an actor on every step', () => {
    expect(new Set(c.steps.map((s) => s.actor))).toEqual(
      new Set(['You', 'The platform', 'Interview Differently'])
    )
  })
})

describe('copyText', () => {
  it('uses the clipboard when there is one', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    expect(await copyText('x', { clipboard: { writeText } as unknown as Clipboard })).toBe(true)
    expect(writeText).toHaveBeenCalledWith('x')
  })

  it('falls back to a textarea when the clipboard is missing or refuses', async () => {
    const area = { value: '', setAttribute: vi.fn(), select: vi.fn(), style: {} }
    const doc = {
      createElement: vi.fn(() => area),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      execCommand: vi.fn(() => true),
    } as unknown as Document
    expect(await copyText('y', { clipboard: undefined as unknown as Clipboard }, doc)).toBe(true)
    expect(area.value).toBe('y')
    const refuse = { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) } }
    expect(await copyText('z', refuse as unknown as Navigator, doc)).toBe(true)
    expect(area.value).toBe('z')
  })

  it('reports false when nothing works', async () => {
    expect(await copyText('q', undefined, undefined)).toBe(false)
  })
})
