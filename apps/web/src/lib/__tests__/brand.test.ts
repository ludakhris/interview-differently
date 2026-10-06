// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { applyBrand, NO_BRAND } from '../brand'

const ok = { name: 'Acme University' }

describe('applyBrand', () => {
  it('gives the untouched defaults when there is no brand', () => {
    for (const input of [null, undefined, 'x', 42, [], {}]) {
      expect(applyBrand(input)).toEqual(NO_BRAND)
    }
    expect(NO_BRAND.cssVars).toEqual({})
    expect(NO_BRAND.scheme).toBe('dark')
  })

  it('a name-only dark brand changes no colours', () => {
    const b = applyBrand(ok)
    expect(b.name).toBe('Acme University')
    expect(b.cssVars).toEqual({})
    expect(b.logoUrl).toBeNull()
  })

  it('applies a valid full brand as channel triplets', () => {
    const b = applyBrand({
      name: ' Acme ',
      logoUrl: 'https://cdn.acme.edu/logo.svg',
      scheme: 'dark',
      primary: '#112233',
      accent: '#AABBCC',
      surface: '#000000',
      surfaceAlt: '#202020',
      text: '#ffffff',
      textSoft: '#999999',
      border: '#333333',
    })
    expect(b.name).toBe('Acme')
    expect(b.logoUrl).toBe('https://cdn.acme.edu/logo.svg')
    expect(b.accent).toBe('#aabbcc')
    expect(b.cssVars['--ld-primary']).toBe('17 34 51')
    expect(b.cssVars['--ld-accent']).toBe('170 187 204')
    expect(b.cssVars['--ld-surface']).toBe('0 0 0')
    expect(b.cssVars['--ld-surface-alt']).toBe('32 32 32')
    expect(b.cssVars['--ld-edge']).toBe('51 51 51')
    for (const v of Object.values(b.cssVars)) expect(v).toMatch(/^[\d ]+$/)
  })

  it('light scheme supplies its own readable defaults', () => {
    const b = applyBrand({ ...ok, scheme: 'light' })
    expect(b.scheme).toBe('light')
    expect(b.cssVars['--ld-surface']).toBe('255 255 255')
    expect(b.cssVars['--ld-ink']).toBe(b.cssVars['--ld-text'])
    expect(b.cssVars['--ld-red-400']).toBeDefined()
  })

  it('picks a readable text colour for the primary button', () => {
    expect(applyBrand({ ...ok, primary: '#ffee00' }).cssVars['--ld-on-primary']).toBe('17 17 17')
    expect(applyBrand({ ...ok, primary: '#102030' }).cssVars['--ld-on-primary']).toBe('255 255 255')
  })

  it('drops the whole brand for an invalid name', () => {
    for (const name of [
      undefined,
      42,
      '',
      '   ',
      'x'.repeat(61),
      'a\nb',
      '<b>x</b>',
      'a<script>',
    ]) {
      expect(applyBrand({ name, primary: '#112233' })).toEqual(NO_BRAND)
    }
  })

  it('ignores each invalid colour and keeps the rest', () => {
    const bad = [
      'red',
      '#fff',
      '#12345',
      '#1234567',
      '#gggggg',
      'rgb(1,2,3)',
      '123456',
      12,
      null,
      'red; background:url(x)',
      '#112233; color:red',
      '#112233)',
      'url(javascript:alert(1))',
    ]
    for (const field of [
      'primary',
      'accent',
      'surface',
      'surfaceAlt',
      'text',
      'textSoft',
      'border',
    ]) {
      for (const v of bad) {
        const b = applyBrand({ name: 'A', [field]: v })
        expect(b.cssVars).toEqual({})
        expect(b.accent).toBeNull()
      }
    }
    const b = applyBrand({ name: 'A', primary: 'red', accent: '#010203' })
    expect(b.cssVars['--ld-primary']).toBeUndefined()
    expect(b.cssVars['--ld-accent']).toBe('1 2 3')
  })

  it('never lets injection text reach a CSS variable', () => {
    const b = applyBrand({
      name: 'A',
      scheme: 'light',
      primary: 'red; background:url(x)',
      text: '#fff;}body{display:none',
      border: '#000000" onload="x',
    })
    for (const [k, v] of Object.entries(b.cssVars)) {
      expect(k).toMatch(/^--ld-[a-z0-9-]+$/)
      expect(v).toMatch(/^[\d ]+$/)
    }
  })

  it('falls back to defaults for an invalid scheme', () => {
    expect(applyBrand({ ...ok, scheme: 'blue' }).scheme).toBe('dark')
    expect(applyBrand({ ...ok, scheme: 'LIGHT' }).scheme).toBe('dark')
  })

  it('accepts https logos and localhost http only', () => {
    const logo = (logoUrl: unknown) => applyBrand({ ...ok, logoUrl }).logoUrl
    expect(logo('https://a.edu/l.png')).toBe('https://a.edu/l.png')
    expect(logo('http://localhost:3000/l.png')).toBe('http://localhost:3000/l.png')
    expect(logo('http://127.0.0.1/l.png')).toBe('http://127.0.0.1/l.png')
    for (const bad of [
      'http://a.edu/l.png',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'ftp://a.edu/l.png',
      '//a.edu/l.png',
      '/l.png',
      'https://u:p@a.edu/l.png',
      'https://a.edu/l.png"onerror="x',
      "https://a.edu/l'.png",
      'https://a.edu/(x).png',
      'https://a.edu/a b.png',
      'https://a.edu/' + 'x'.repeat(300),
      42,
      null,
    ]) {
      expect(logo(bad)).toBeNull()
    }
  })

  it('keeps the name and colours when only the logo is invalid', () => {
    const b = applyBrand({ ...ok, logoUrl: 'javascript:alert(1)', primary: '#112233' })
    expect(b.name).toBe('Acme University')
    expect(b.logoUrl).toBeNull()
    expect(b.cssVars['--ld-primary']).toBe('17 34 51')
  })
})
