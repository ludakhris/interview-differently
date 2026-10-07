import { describe, expect, it } from 'vitest'
import { interpretHandBack, safeHttpUrl } from '../ltiService'

const LINK = 'https://ld.test/x'
const SESSION = 'https://ld.test/course'

describe('interpretHandBack', () => {
  it('navigates to the return link on 200', () => {
    expect(interpretHandBack(200, { score: 80, returnUrl: LINK }, SESSION)).toEqual({
      ok: true,
      navigateTo: LINK,
      courseUrl: LINK,
    })
  })
  it('treats 409 as sent and navigates when the body has a link', () => {
    expect(interpretHandBack(409, { returnUrl: LINK }, SESSION)).toEqual({
      ok: true,
      navigateTo: LINK,
      courseUrl: LINK,
    })
  })
  it('on 410 reports a replaced session, never success', () => {
    expect(interpretHandBack(410, null, SESSION)).toEqual({ ok: false, replaced: true })
  })

  it('on 409 without a link, shows the session link instead of navigating', () => {
    expect(interpretHandBack(409, null, SESSION)).toEqual({
      ok: true,
      navigateTo: null,
      courseUrl: SESSION,
    })
    expect(interpretHandBack(409, {}, null)).toEqual({
      ok: true,
      navigateTo: null,
      courseUrl: null,
    })
  })
  it('on 409 ignores a non-http(s) body link and a non-http(s) session link', () => {
    expect(interpretHandBack(409, { returnUrl: 'javascript:alert(1)' }, SESSION)).toEqual({
      ok: true,
      navigateTo: null,
      courseUrl: SESSION,
    })
    expect(interpretHandBack(409, null, 'javascript:alert(1)')).toEqual({
      ok: true,
      navigateTo: null,
      courseUrl: null,
    })
  })
  it('fails on other 4xx/5xx, never claiming success', () => {
    for (const status of [400, 401, 403, 404, 429, 500, 502]) {
      expect(interpretHandBack(status, { returnUrl: LINK }, SESSION)).toEqual({ ok: false })
    }
  })
  it('fails on a 200 with a malformed body, no link, or a non-http(s) link', () => {
    expect(interpretHandBack(200, null, SESSION)).toEqual({ ok: false })
    expect(interpretHandBack(200, 'oops', SESSION)).toEqual({ ok: false })
    expect(interpretHandBack(200, { returnUrl: 42 }, SESSION)).toEqual({ ok: false })
    expect(interpretHandBack(200, { returnUrl: 'not a url' }, SESSION)).toEqual({ ok: false })
    expect(interpretHandBack(200, { returnUrl: 'javascript:alert(1)' }, SESSION)).toEqual({
      ok: false,
    })
  })
  it('tolerates a malformed body on 409', () => {
    expect(interpretHandBack(409, 'oops', SESSION)).toEqual({
      ok: true,
      navigateTo: null,
      courseUrl: SESSION,
    })
  })
})

describe('safeHttpUrl', () => {
  it('allows http and https only', () => {
    expect(safeHttpUrl('http://a.test/')).toBe('http://a.test/')
    expect(safeHttpUrl('https://a.test/')).toBe('https://a.test/')
    expect(safeHttpUrl('data:text/html,hi')).toBeNull()
    expect(safeHttpUrl(null)).toBeNull()
  })
})
