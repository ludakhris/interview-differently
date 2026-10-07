// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

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
})
