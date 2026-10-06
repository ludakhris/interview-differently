import { sanitizeBrand } from './lti-brand'

const full = {
  name: 'Delaware Department of Labor',
  logoUrl: 'https://learn.example.org/tenants/delaware/dol-logo.png',
  scheme: 'light',
  primary: '#05405c',
  accent: '#d76f0f',
  surface: '#ffffff',
  surfaceAlt: '#f2f2f2',
  text: '#353535',
  textSoft: '#4a4a4a',
  border: '#e5e5e5',
}

describe('sanitizeBrand', () => {
  it('keeps a fully valid brand unchanged', () => {
    expect(sanitizeBrand(full)).toEqual(full)
  })

  it('accepts a name alone', () => {
    expect(sanitizeBrand({ name: 'Acme' })).toEqual({ name: 'Acme' })
  })

  it('lowercases colors and drops unknown fields', () => {
    expect(sanitizeBrand({ name: 'A', primary: '#ABCDEF', sky: '#daf2fd', extra: 1 })).toEqual({
      name: 'A',
      primary: '#abcdef',
    })
  })

  it('trims the name', () => {
    expect(sanitizeBrand({ name: '  Acme  ' })).toEqual({ name: 'Acme' })
  })

  it.each([undefined, null, 'Acme', 5, true, [], [{ name: 'A' }], () => ({ name: 'A' })])(
    'treats a non-object (%p) as no brand',
    (v) => expect(sanitizeBrand(v)).toBeNull()
  )

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['blank', '   '],
    ['a number', 5],
    ['an object', {}],
    ['too long', 'x'.repeat(61)],
    ['markup', '<script>alert(1)</script>'],
    ['a tag', 'Acme <b>'],
    ['a newline', 'Ac\nme'],
    ['a control char', 'Ac\u0000me'],
  ])('drops the whole brand when the name is %s', (_l, name) => {
    expect(sanitizeBrand({ ...full, name })).toBeNull()
  })

  it('accepts a 60 character name', () => {
    expect(sanitizeBrand({ name: 'x'.repeat(60) })?.name).toHaveLength(60)
  })

  describe('logoUrl', () => {
    const logo = (logoUrl: unknown) => sanitizeBrand({ name: 'A', logoUrl })?.logoUrl
    it.each([
      'https://cdn.example.com/a.png',
      'http://localhost:5174/tenants/x.png',
      'http://127.0.0.1/x.png',
    ])('accepts %s', (u) => expect(logo(u)).toBe(u))

    it.each([
      ['http on a public host', 'http://example.com/a.png'],
      ['http on a lookalike host', 'http://localhost.evil.com/a.png'],
      ['javascript:', 'javascript:alert(1)'],
      ['data:', 'data:image/png;base64,AAAA'],
      ['ftp', 'ftp://example.com/a.png'],
      ['relative', '/tenants/delaware/dol-logo.png'],
      ['protocol relative', '//example.com/a.png'],
      ['credentials', 'https://user:pw@example.com/a.png'],
      ['username only', 'https://user@example.com/a.png'],
      ['css url() breakout', 'https://example.com/a.png);background:url(https://evil.test/x'],
      ['a quote', 'https://example.com/a".png'],
      ['a single quote', "https://example.com/a'.png"],
      ['angle brackets', 'https://example.com/<script>'],
      ['a space', 'https://example.com/a b.png'],
      ['a newline', 'https://example.com/a\n.png'],
      ['a backslash', 'https://example.com/a\\.png'],
      ['too long', `https://example.com/${'a'.repeat(300)}`],
      ['a number', 5],
      ['an object', { href: 'https://example.com/a.png' }],
      ['url(...)', 'url(https://example.com/a.png)'],
    ])('drops %s but keeps the rest of the brand', (_l, u) => {
      expect(logo(u)).toBeUndefined()
      expect(sanitizeBrand({ name: 'A', logoUrl: u, primary: '#000000' })).toEqual({
        name: 'A',
        primary: '#000000',
      })
    })

    it('accepts a URL of exactly 300 characters', () => {
      const u = `https://example.com/${'a'.repeat(300 - 'https://example.com/'.length)}`
      expect(u).toHaveLength(300)
      expect(logo(u)).toBe(u)
    })
  })

  describe('scheme', () => {
    it.each(['light', 'dark'])('accepts %s', (s) =>
      expect(sanitizeBrand({ name: 'A', scheme: s })?.scheme).toBe(s)
    )
    it.each(['Light', 'auto', '', 1, null, {}])('drops %p', (s) =>
      expect(sanitizeBrand({ name: 'A', scheme: s })).toEqual({ name: 'A' })
    )
  })

  describe.each(['primary', 'accent', 'surface', 'surfaceAlt', 'text', 'textSoft', 'border'])(
    'color %s',
    (field) => {
      it('accepts #rrggbb and lowercases it', () => {
        expect(sanitizeBrand({ name: 'A', [field]: '#0A1B2C' })).toEqual({
          name: 'A',
          [field]: '#0a1b2c',
        })
      })
      it.each([
        '#fff',
        '#12345',
        '#1234567',
        '#12345g',
        '123456',
        'red',
        'rgb(0,0,0)',
        'url(https://evil.test/x)',
        '#000000;background:red',
        '#000000 ',
        ' #000000',
        '#000000\n',
        'expression(alert(1))',
        '<script>',
        '',
        5,
        null,
        {},
      ])('drops %p', (c) => {
        expect(sanitizeBrand({ name: 'A', [field]: c })).toEqual({ name: 'A' })
      })
    }
  )

  it('does not copy prototype pollution keys', () => {
    const out = sanitizeBrand(JSON.parse('{"name":"A","__proto__":{"primary":"#000000"}}'))
    expect(out).toEqual({ name: 'A' })
    expect((out as unknown as Record<string, unknown>).primary).toBeUndefined()
  })
})
