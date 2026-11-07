// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { applyBrand, ltiAccent, NO_BRAND, STANDALONE_ACCENT, textOn } from '../brand'

const ok = { name: 'Acme University' }

describe('applyBrand', () => {
  it('gives the untouched defaults when there is no brand', () => {
    for (const input of [null, undefined, 'x', 42, [], {}]) {
      expect(applyBrand(input)).toEqual(NO_BRAND)
    }
    expect(NO_BRAND.cssVars).toEqual({})
    expect(NO_BRAND.scheme).toBe('light')
  })

  it('a name-only brand keeps the standalone look', () => {
    const b = applyBrand(ok)
    expect(b.name).toBe('Acme University')
    expect(b.cssVars).toEqual({})
    expect(b.logoUrl).toBeNull()
  })

  it('a dark brand keeps the pre-rebrand dark look for every colour it leaves out', () => {
    const b = applyBrand({ ...ok, scheme: 'dark' })
    expect(b.cssVars['--ld-surface']).toBe('10 10 10')
    expect(b.cssVars['--ld-text']).toBe('245 243 238')
    expect(b.cssVars['--ld-ink']).toBe('255 255 255')
    expect(b.cssVars['--ld-primary']).toBe('26 107 60')
    expect(b.cssVars['--ld-accent']).toBe('45 158 95')
    expect(b.cssVars['--ld-red-400']).toBe('248 113 113')
  })

  it('a branded launch sets every colour variable the theme reads', () => {
    // index.css reads these with standalone fallbacks; a brand must set each so no
    // standalone colour leaks into a tenant's screens.
    const themeVars = [
      'surface',
      'surface-alt',
      'surface-deep',
      'surface-bar',
      'text',
      'ink',
      'edge',
      'on-primary',
      'on-accent',
      'mint',
      'jade',
      'azure',
      'primary',
      'accent',
      'blue-soft',
      'amber-200',
      'amber-300',
      'amber-400',
      'red-300',
      'red-400',
      'emerald-300',
      'emerald-400',
      'violet-400',
      'sky-400',
      'soft',
      'soft-light',
      'border',
    ]
    for (const input of [
      { ...ok, scheme: 'light' },
      { ...ok, scheme: 'dark' },
      { ...ok, primary: '#112233' },
      {
        ...ok,
        scheme: 'light',
        primary: '#05405c',
        accent: '#d76f0f',
        surface: '#ffffff',
        surfaceAlt: '#f2f2f2',
        text: '#353535',
        textSoft: '#4a4a4a',
        border: '#e5e5e5',
      },
    ]) {
      const vars = applyBrand(input).cssVars
      for (const v of themeVars)
        expect(vars[`--ld-${v}`], `${v} for ${JSON.stringify(input)}`).toBeDefined()
    }
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

  it('keeps a font only from the allowed list, and never as a CSS variable', () => {
    expect(applyBrand({ ...ok, font: 'Open Sans' }).font).toBe('Open Sans')
    expect(applyBrand({ ...ok, font: 'Open Sans', scheme: 'light' }).font).toBe('Open Sans')
    for (const font of ['open sans', 'Comic Sans MS', "Lato'; color:red", 'url(x)', 3]) {
      expect(applyBrand({ ...ok, font }).font).toBeNull()
    }
    const vars = applyBrand({ ...ok, scheme: 'light', font: 'Lato' }).cssVars
    for (const v of Object.values(vars)) expect(v).toMatch(/^[\d ]+$/)
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
    // the invalid primary falls back to the dark baseline's
    expect(b.cssVars['--ld-primary']).toBe('26 107 60')
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
    expect(applyBrand({ ...ok, scheme: 'blue' }).scheme).toBe('light')
    expect(applyBrand({ ...ok, scheme: 'LIGHT', primary: '#112233' }).scheme).toBe('dark')
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

  it('a light brand without colours never falls back to the standalone blue', () => {
    const b = applyBrand({ name: 'Acme University', scheme: 'light', surface: '#ffffff' })
    expect(Object.keys(b.cssVars).length).toBeGreaterThan(0)
    expect(Object.values(b.cssVars)).not.toContain('37 99 235')
  })

  it('textOn picks readable text for a colour', () => {
    expect(textOn('#ffffff')).toBe('rgb(17 17 17)')
    expect(textOn('#05405c')).toBe('rgb(255 255 255)')
    expect(textOn('not a colour')).toBe('#ffffff')
  })

  it('ltiAccent is the brand blue standalone and with no brand, the tenant accent in a launch', () => {
    expect(ltiAccent(null, '#1a6b3c')).toBe(STANDALONE_ACCENT)
    expect(ltiAccent(NO_BRAND, '#1a6b3c')).toBe(STANDALONE_ACCENT)
    const b = applyBrand({ name: 'Acme', scheme: 'light', accent: '#d76f0f' })
    expect(ltiAccent(b, '#1a6b3c')).toBe('#d76f0f')
  })
})
