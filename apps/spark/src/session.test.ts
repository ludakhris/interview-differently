import { beforeEach, describe, expect, it } from 'vitest'
import { captureToken, resetToken, type TokenWindow } from './session'

function fakeWindow(hash: string, stored: Record<string, string> = {}) {
  const store = { ...stored }
  const replaced: string[] = []
  const win: TokenWindow = {
    location: { hash, pathname: '/lesson', search: '' },
    history: { replaceState: (_d, _u, url) => replaced.push(url ?? '') },
    sessionStorage: {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => {
        store[k] = v
      },
    },
  }
  return { win, store, replaced }
}

describe('captureToken', () => {
  beforeEach(() => resetToken())

  it('takes the token from the fragment, stores it and strips it from the address', () => {
    const { win, store, replaced } = fakeWindow('#token=abc.def')
    expect(captureToken(win)).toBe('abc.def')
    expect(store['spark.lessonToken']).toBe('abc.def')
    expect(replaced).toEqual(['/lesson'])
  })

  it('falls back to the token stored earlier in this tab (a reload)', () => {
    const { win, replaced } = fakeWindow('', { 'spark.lessonToken': 'saved' })
    expect(captureToken(win)).toBe('saved')
    expect(replaced).toEqual([])
  })

  it('keeps the token in memory when storage is blocked', () => {
    const { win } = fakeWindow('#token=tok')
    win.sessionStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(captureToken(win)).toBe('tok')
    win.location.hash = ''
    expect(captureToken(win)).toBe('tok')
  })

  it('is null with no token anywhere', () => {
    expect(captureToken(fakeWindow('#other=1').win)).toBeNull()
  })
})
