// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  captureLtiSession,
  clearLtiSession,
  getLtiReturnUrl,
  getLtiToken,
  isLtiPath,
  isLtiSession,
  parseSessionFromHash,
  preferLtiToken,
} from '../ltiSession'
import { authHeader, registerTokenGetter } from '../authToken'

const TOKEN = 'abc.DEF-123_xyz'

function stubBrowser(hash: string, pathname = '/lti/play/s1') {
  const store = new Map<string, string>()
  const replaceState = vi.fn()
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  const location = { hash, pathname, search: '' }
  vi.stubGlobal('window', { location, history: { replaceState } })
  return { store, replaceState, location }
}

describe('parseSessionFromHash', () => {
  it('reads the session value', () => {
    expect(parseSessionFromHash(`#session=${TOKEN}`)).toBe(TOKEN)
    expect(parseSessionFromHash(`#a=1&session=${TOKEN}`)).toBe(TOKEN)
  })
  it('returns null when missing or garbled', () => {
    expect(parseSessionFromHash('')).toBeNull()
    expect(parseSessionFromHash('#other=1')).toBeNull()
    expect(parseSessionFromHash('#session=')).toBeNull()
    expect(parseSessionFromHash('#session=%E0%A4%A')).toBeNull()
    expect(parseSessionFromHash('#session=short')).toBeNull()
    expect(parseSessionFromHash('#session=has space in it!!')).toBeNull()
  })
})

describe('isLtiPath', () => {
  it('matches only the LTI play and assessment routes', () => {
    expect(isLtiPath('/lti/play/abc')).toBe(true)
    expect(isLtiPath('/lti/assessment/d1')).toBe(true)
    expect(isLtiPath('/lti/assessment/')).toBe(false)
    expect(isLtiPath('/lti/other/d1')).toBe(false)
    expect(isLtiPath('/tools/assessments/attempt/a1')).toBe(false)
    expect(isLtiPath('/scenario/abc/play')).toBe(false)
    expect(isLtiPath('/lti/play/')).toBe(false)
    expect(isLtiPath('/dashboard')).toBe(false)
  })
})

describe('captureLtiSession', () => {
  beforeEach(() => clearLtiSession())
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stores the token, strips the fragment, and activates LTI mode', () => {
    const { store, replaceState } = stubBrowser(`#session=${TOKEN}`)
    expect(captureLtiSession()).toBe(TOKEN)
    expect(store.get('lti-session-token')).toBe(TOKEN)
    expect(replaceState).toHaveBeenCalledWith(null, '', '/lti/play/s1')
    expect(getLtiToken()).toBe(TOKEN)
    expect(isLtiSession('/lti/play/s1')).toBe(true)
    expect(isLtiSession('/lti/assessment/d1')).toBe(true)
    expect(isLtiSession('/tools/assessments/attempt/a1')).toBe(false)
    expect(isLtiSession('/dashboard')).toBe(false)
  })

  it('reuses the stored token after the fragment is gone (reload)', () => {
    const { store } = stubBrowser('')
    store.set('lti-session-token', TOKEN)
    expect(captureLtiSession()).toBe(TOKEN)
  })

  it('returns null with no token and still strips a garbled fragment', () => {
    const { replaceState } = stubBrowser('#session=bad!')
    expect(captureLtiSession()).toBeNull()
    expect(replaceState).toHaveBeenCalled()
    expect(isLtiSession('/lti/play/s1')).toBe(false)
  })

  it('keeps working when sessionStorage throws', () => {
    stubBrowser(`#session=${TOKEN}`)
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {},
    })
    expect(captureLtiSession()).toBe(TOKEN)
  })

  it('sends the lti. bearer on the LTI route and falls back to Clerk elsewhere', async () => {
    const { location } = stubBrowser(`#session=${TOKEN}`)
    registerTokenGetter(async () => 'clerk-jwt')
    captureLtiSession()
    expect(await authHeader()).toEqual({ Authorization: `Bearer lti.${TOKEN}` })
    location.pathname = '/dashboard'
    expect(await authHeader()).toEqual({ Authorization: 'Bearer clerk-jwt' })
  })
})

describe('preferLtiToken', () => {
  afterEach(() => {
    clearLtiSession()
    vi.unstubAllGlobals()
  })

  it('uses the LTI session on an LTI play route', async () => {
    stubBrowser(`#session=${TOKEN}`)
    captureLtiSession()
    const clerk = vi.fn(async () => 'clerk-jwt')
    expect(await preferLtiToken(clerk)()).toBe(`lti.${TOKEN}`)
    expect(clerk).not.toHaveBeenCalled()
  })

  it('falls through to Clerk off an LTI route, even with a stored token', async () => {
    const b = stubBrowser(`#session=${TOKEN}`)
    captureLtiSession()
    b.location.pathname = '/dashboard'
    const clerk = vi.fn(async () => 'clerk-jwt')
    expect(await preferLtiToken(clerk)()).toBe('clerk-jwt')
  })

  it('falls through to Clerk when there is no LTI token', async () => {
    stubBrowser('')
    expect(await preferLtiToken(async () => null)()).toBeNull()
  })
})

describe('getLtiReturnUrl', () => {
  const tokenWith = (payload: unknown) =>
    `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig12345`
  const load = (token: string) => {
    stubBrowser(`#session=${token}`)
    captureLtiSession()
  }
  beforeEach(() => clearLtiSession())
  afterEach(() => {
    clearLtiSession()
    vi.unstubAllGlobals()
  })

  it('reads an http(s) returnUrl from the token payload', () => {
    load(tokenWith({ returnUrl: 'https://ld.test/lms/learning/1/2' }))
    expect(getLtiReturnUrl()).toBe('https://ld.test/lms/learning/1/2')
  })
  it('gives null for a missing, non-http(s) or non-string link', () => {
    load(tokenWith({ sub: 'u' }))
    expect(getLtiReturnUrl()).toBeNull()
    load(tokenWith({ returnUrl: 'javascript:alert(1)' }))
    expect(getLtiReturnUrl()).toBeNull()
    load(tokenWith({ returnUrl: 7 }))
    expect(getLtiReturnUrl()).toBeNull()
  })
  it('gives null for garbage or no token', () => {
    load('!!notbase64!!.sig12345')
    expect(getLtiReturnUrl()).toBeNull()
    clearLtiSession()
    expect(getLtiReturnUrl()).toBeNull()
  })
})
