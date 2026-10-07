// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmProvider } from '@/components/ConfirmDialog'
import { LtiPlatformsPanel } from '../LtiPlatformsPanel'
import type { LtiPlatform } from '@/services/ltiPlatformsService'

vi.mock('@/services/authToken', () => ({ authHeader: async () => ({}) }))

const base: LtiPlatform = {
  id: 'p1',
  name: 'Canvas',
  issuer: 'https://canvas.example.edu',
  clientId: 'client-1',
  deploymentId: 'dep-1',
  authUrl: 'https://canvas.example.edu/auth',
  tokenUrl: 'https://canvas.example.edu/token',
  jwksUrl: 'https://canvas.example.edu/jwks',
  enabled: false,
  approvedAt: null,
  createdAt: '2026-10-01T10:00:00Z',
  source: 'registered',
}
const builtIn: LtiPlatform = {
  ...base,
  id: 'b1',
  name: 'Moodle',
  enabled: true,
  source: 'built-in',
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))

function mockApi(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(handler)
  vi.stubGlobal('fetch', fn)
  return fn
}

const renderPanel = () =>
  render(
    <ConfirmProvider>
      <LtiPlatformsPanel />
    </ConfirmProvider>
  )

beforeEach(() => {
  vi.unstubAllGlobals()
})
afterEach(cleanup)

describe('LtiPlatformsPanel', () => {
  it('shows the empty state', async () => {
    mockApi(() => json({ platforms: [] }))
    renderPanel()
    expect(await screen.findByText(/No platforms yet/)).toBeTruthy()
  })

  it('shows an error with Retry that reloads', async () => {
    let calls = 0
    mockApi(() => (++calls === 1 ? json({ message: 'boom' }, 500) : json({ platforms: [base] })))
    renderPanel()
    expect((await screen.findByRole('alert')).textContent).toContain('boom')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Canvas' })).toBeTruthy()
  })

  it('shows the built-in platform read-only', async () => {
    mockApi(() => json({ platforms: [builtIn] }))
    renderPanel()
    await screen.findByRole('heading', { name: 'Moodle' })
    expect(screen.getByText('Built in')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Enable|Disable/ })).toBeNull()
  })

  it('asks before enabling, naming the issuer, and does nothing on cancel', async () => {
    const api = mockApi(() => json({ platforms: [base] }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Enable' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('https://canvas.example.edu')
    expect(dialog.textContent).toContain('never been approved')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(api.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
    expect(screen.getByText('Waiting for approval')).toBeTruthy()
  })

  it('enables after confirming and announces it', async () => {
    const api = mockApi((_url, init) =>
      init?.method === 'PUT'
        ? json({ ...base, enabled: true, approvedAt: '2026-10-02T10:00:00Z' })
        : json({ platforms: [base] })
    )
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Enable' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Switch on' })
    )
    await screen.findByRole('button', { name: 'Disable' })
    const put = api.mock.calls.find(([, init]) => init?.method === 'PUT')!
    expect(String(put[0])).toContain('/api/lti/platforms/p1')
    expect(JSON.parse(String(put[1]?.body))).toEqual({ enabled: true })
    expect(screen.getByText('On')).toBeTruthy()
    expect(screen.getByText('Canvas is now on.')).toBeTruthy()
  })

  it('disables without a confirm step', async () => {
    mockApi((_url, init) =>
      init?.method === 'PUT'
        ? json({ ...base, enabled: false, approvedAt: '2026-10-02T10:00:00Z' })
        : json({ platforms: [{ ...base, enabled: true, approvedAt: '2026-10-02T10:00:00Z' }] })
    )
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Disable' }))
    await screen.findByRole('button', { name: 'Enable' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows an inline alert when the change fails and keeps the old state', async () => {
    mockApi((_url, init) =>
      init?.method === 'PUT' ? json({ message: 'nope' }, 400) : json({ platforms: [base] })
    )
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Enable' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Switch on' })
    )
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('nope'))
    expect(screen.getByRole('button', { name: 'Enable' })).toBeTruthy()
  })

  it('loads history on demand in plain language', async () => {
    const api = mockApi((url) =>
      url.includes('/history')
        ? json({
            changes: [
              {
                id: 'c2',
                subjectId: 'p1',
                subjectName: 'Canvas',
                action: 'enabled',
                userName: 'Chow',
                createdAt: '2026-10-02T10:00:00Z',
              },
              {
                id: 'c1',
                subjectId: 'p1',
                subjectName: 'Canvas',
                action: 'created',
                userName: null,
                createdAt: '2026-10-01T10:00:00Z',
              },
            ],
          })
        : json({ platforms: [base] })
    )
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Show history' }))
    expect(await screen.findByText('Chow switched it on')).toBeTruthy()
    expect(screen.getByText('It registered itself')).toBeTruthy()
    expect(api.mock.calls.some(([u]) => String(u).includes('subjectId=p1'))).toBe(true)
  })

  it('shows a clear message and no Retry on 403', async () => {
    mockApi(() => json({ message: 'Forbidden' }, 403))
    renderPanel()
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Only full administrators can manage platforms'
    )
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('lists platforms waiting for approval first', async () => {
    const on = {
      ...base,
      id: 'p0',
      name: 'Alpha',
      enabled: true,
      approvedAt: '2026-10-02T10:00:00Z',
    }
    mockApi(() => json({ platforms: [on, base] }))
    renderPanel()
    await screen.findByRole('heading', { name: 'Alpha' })
    const names = screen.getAllByRole('heading').map((h) => h.textContent)
    expect(names).toEqual(['Canvas', 'Alpha'])
  })

  it('rejects a waiting platform after confirming and removes it', async () => {
    const api = mockApi((_url, init) =>
      init?.method === 'DELETE' ? json({ ok: true }) : json({ platforms: [base] })
    )
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('would have to register again')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Canvas' })).toBeNull())
    const del = api.mock.calls.find(([, init]) => init?.method === 'DELETE')!
    expect(String(del[0])).toContain('/api/lti/platforms/p1')
    expect(screen.getByText('Canvas was rejected and removed.')).toBeTruthy()
  })

  it('does not reject on cancel, and offers no Reject once approved', async () => {
    const api = mockApi(() => json({ platforms: [base] }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' })
    )
    expect(api.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
    cleanup()
    mockApi(() => json({ platforms: [{ ...base, approvedAt: '2026-10-02T10:00:00Z' }] }))
    renderPanel()
    await screen.findByRole('heading', { name: 'Canvas' })
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull()
  })

  it('shows an alert and keeps the card when rejecting fails', async () => {
    mockApi((_url, init) =>
      init?.method === 'DELETE' ? json({ message: 'nope' }, 400) : json({ platforms: [base] })
    )
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reject' })
    )
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('nope'))
    expect(screen.getByRole('heading', { name: 'Canvas' })).toBeTruthy()
  })
})
