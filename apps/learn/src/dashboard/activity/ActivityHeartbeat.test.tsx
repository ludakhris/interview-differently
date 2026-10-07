// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { act } from 'react'

let signedIn = true
const getToken = vi.fn(async () => 'tok')
vi.mock('@clerk/clerk-react', () => ({ useAuth: () => ({ isSignedIn: signedIn, getToken }) }))
vi.mock('../api', () => ({ API_URL: 'http://api.test' }))

import { ActivityHeartbeat } from './ActivityHeartbeat'

const fetchMock = vi.fn()
beforeEach(() => {
  signedIn = true
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, status: 204 })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const click = () => document.dispatchEvent(new Event('pointerdown'))
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('ActivityHeartbeat', () => {
  it('renders nothing and sends a beat for the item on first activity', async () => {
    const { container } = render(<ActivityHeartbeat pathname="/lms/learning/c1/i1" />)
    expect(container.innerHTML).toBe('')
    click()
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://api.test/learn/me/activity/heartbeat')
    expect(init.method).toBe('POST')
    expect(init.keepalive).toBe(true)
    expect(init.headers.Authorization).toBe('Bearer tok')
    // The browser never reports a duration.
    expect(JSON.parse(init.body)).toEqual({ cohortId: 'c1', itemId: 'i1', kind: 'page' })
  })

  it('sends the cohort page with no item', async () => {
    render(<ActivityHeartbeat pathname="/lms/learning/c1" />)
    click()
    await flush()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      cohortId: 'c1',
      itemId: null,
      kind: 'page',
    })
  })

  it('does nothing when signed out', async () => {
    signedIn = false
    render(<ActivityHeartbeat pathname="/lms/learning/c1/i1" />)
    click()
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['/lms/learning', '/lms/learning/outcomes', '/lms/learning/profile', '/lms/cohorts/c1'])(
    'does nothing on %s',
    async (path) => {
      render(<ActivityHeartbeat pathname={path} />)
      click()
      await flush()
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )

  it('a failing request is silent', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    render(<ActivityHeartbeat pathname="/lms/learning/c1/i1" />)
    click()
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stops listening when unmounted', async () => {
    const { unmount } = render(<ActivityHeartbeat pathname="/lms/learning/c1/i1" />)
    unmount()
    click()
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes the cached token when the page is hidden, so the closing beat is fresh', async () => {
    getToken.mockResolvedValueOnce('tok1').mockResolvedValue('tok2')
    render(<ActivityHeartbeat pathname="/lms/learning/c1/i1" />)
    click()
    await flush()
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok1')
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    click()
    window.dispatchEvent(new Event('pagehide'))
    await flush()
    const last = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
    expect(last[1].headers.Authorization).toBe('Bearer tok2')
    getToken.mockResolvedValue('tok')
  })

  it('forgets the token on sign-out', async () => {
    const { rerender } = render(<ActivityHeartbeat pathname="/lms/learning/c1/i1" />)
    click()
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    signedIn = false
    rerender(<ActivityHeartbeat pathname="/lms/learning/c1/i1" />)
    // Another person signs in; their token is not available yet.
    getToken.mockResolvedValue(null as unknown as string)
    getToken.mockClear()
    signedIn = true
    fetchMock.mockClear()
    rerender(<ActivityHeartbeat pathname="/lms/learning/c1/i1" />)
    await act(async () => {
      click()
      window.dispatchEvent(new Event('pagehide'))
    })
    await flush()
    // A stale token from the first session would have been sent here.
    expect(fetchMock.mock.calls.some((c) => c[1].headers.Authorization === 'Bearer tok')).toBe(
      false
    )
    getToken.mockResolvedValue('tok')
  })
})
