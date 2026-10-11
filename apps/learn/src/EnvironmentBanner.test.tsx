// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { EnvironmentBanner } from './EnvironmentBanner'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const respond = (body: unknown, ok = true) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => body }))

describe('EnvironmentBanner', () => {
  it('names a test environment', async () => {
    respond({ status: 'ok', environment: 'dev' })
    render(<EnvironmentBanner healthUrl="https://api.example.test/api/health" />)
    expect(await screen.findByText(/Test system · dev · not production/)).toBeTruthy()
  })

  it('shows nothing for production, a local API, or an API that does not answer', async () => {
    for (const body of [{ environment: 'production' }, { environment: 'local' }, {}]) {
      respond(body)
      const { container, unmount } = render(<EnvironmentBanner healthUrl="https://x.test/health" />)
      await waitFor(() => expect(fetch).toHaveBeenCalled())
      expect(container.textContent).toBe('')
      unmount()
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { container } = render(<EnvironmentBanner healthUrl="https://x.test/health" />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })
})
