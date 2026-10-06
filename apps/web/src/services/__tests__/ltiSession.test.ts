// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  captureLtiSession,
  clearLtiSession,
  getLtiToken,
  isLtiPath,
  isLtiSession,
  parseSessionFromHash,
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
  it('matches only the LTI play route', () => {
    expect(isLtiPath('/lti/play/abc')).toBe(true)
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
