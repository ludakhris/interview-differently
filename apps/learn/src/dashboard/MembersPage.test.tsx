// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

let role = 'provider-admin'
let members: unknown = null
const reload = vi.fn()
const send = vi.fn()
const paths: Array<string | null> = []
vi.mock('./api', () => ({
  useApiSend: () => send,
  useLoad: (path: string | null) => {
    paths.push(path)
    if (path === null) return { data: null, error: null, loading: false, reload }
    if (path.endsWith('/cohorts'))
      return {
        data: [{ id: 'c1', name: 'Electrical 2026-C' }],
        error: null,
        loading: false,
        reload,
      }
    return { data: members, error: null, loading: false, reload }
  },
}))
vi.mock('./app-context', () => ({
  useApp: () => ({ current: { name: 'Cedar Mill', kind: 'provider' } }),
}))
vi.mock('./shared', () => ({
  errorNotice: () => null,
  useWorkspaceRole: () => role,
}))

import { MembersPage } from './MembersPage'

const data = {
  invites: [
    {
      inviteId: 'i1',
      email: 'soon@example.com',
      role: 'instructor',
      cohort: { id: 'c1', name: 'Electrical 2026-C' },
      createdAt: '2026-10-10T00:00:00Z',
    },
  ],
  grantable: ['provider-admin', 'case-manager', 'instructor'],
  members: [
    {
      membershipId: 'm1',
      userId: 'u1',
      name: 'Pat Admin',
      email: 'pat@example.com',
      role: 'provider-admin',
      cohort: null,
    },
    {
      membershipId: 'm2',
      userId: 'u2',
      name: 'Ira Teacher',
      email: 'ira@example.com',
      role: 'instructor',
      cohort: { id: 'c1', name: 'Electrical 2026-C' },
    },
  ],
}

afterEach(() => {
  cleanup()
  send.mockReset()
  reload.mockReset()
  paths.length = 0
  role = 'provider-admin'
})

const openPanel = () => fireEvent.click(screen.getByRole('button', { name: 'Add person' }))
const bodyRows = () => screen.getAllByRole('row').slice(1)

describe('MembersPage', () => {
  it('shows members and invitations in one grid, highest role first, with counts', () => {
    members = data
    render(<MembersPage workspace="cedar" />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Manage Provider Staff')
    expect(document.title).toBe('Manage Provider Staff')
    expect(paths[0]).toBe('/learn/workspaces/cedar/members')
    const rows = bodyRows()
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain('Pat Admin')
    expect(rows[0].textContent).toContain('Whole workspace')
    expect(rows[0].textContent).toContain('Active')
    expect(rows[1].textContent).toContain('Ira Teacher')
    expect(rows[1].textContent).toContain('Electrical 2026-C')
    expect(rows[2].textContent).toContain('soon@example.com')
    expect(rows[2].textContent).toContain('waiting for them to sign in')
    const strip = screen.getByLabelText('People by role')
    expect(strip.textContent).toContain('Provider admins1')
    expect(strip.textContent).toContain('Instructors1')
    expect(strip.textContent).toContain('Invited1')
  })

  it('filters by role chip and by search', () => {
    members = data
    render(<MembersPage workspace="cedar" />)
    fireEvent.click(screen.getByRole('button', { name: 'Invited' }))
    expect(bodyRows()).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'ira@' } })
    expect(bodyRows()).toHaveLength(1)
    expect(bodyRows()[0].textContent).toContain('Ira Teacher')
  })

  it('opens Add person in a dialog on the email field and returns focus when it closes', async () => {
    members = data
    render(<MembersPage workspace="cedar" />)
    const opener = screen.getByRole('button', { name: 'Add person' })
    expect(screen.queryByRole('dialog')).toBeNull()
    opener.focus()
    fireEvent.click(opener)
    const dialog = await screen.findByRole('dialog', { name: 'Add person' })
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByLabelText('Email')))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
    // Esc closes it too.
    fireEvent.click(opener)
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('asks before closing a dialog with an email typed in', async () => {
    members = data
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<MembersPage workspace="cedar" />)
    openPanel()
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'half@ex' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(confirm).toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    confirm.mockRestore()
  })

  it('offers only the roles the caller may grant, and asks for a cohort for an instructor', async () => {
    members = data
    send.mockResolvedValue({ status: 'added', member: { name: 'New Person' } })
    render(<MembersPage workspace="cedar" />)
    openPanel()
    await screen.findByRole('dialog')
    const select = screen.getByLabelText(/^Role/) as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(data.grantable)
    expect(screen.queryByLabelText(/Cohort they teach/)).toBeNull()
    fireEvent.change(select, { target: { value: 'instructor' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText(/Cohort they teach/), { target: { value: 'c1' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add person' }))
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith('POST', '/learn/workspaces/cedar/members', {
        email: 'new@example.com',
        role: 'instructor',
        cohortId: 'c1',
      })
    )
    expect((await screen.findByRole('status')).textContent).toContain(
      'Added New Person as Instructor.'
    )
    expect(reload).toHaveBeenCalled()
    // The panel closes and focus goes back to the button.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('defaults to the first role the workspace kind allows', async () => {
    const lists: Record<string, string[]> = {
      agency: ['agency-admin', 'case-manager'],
      provider: ['provider-admin', 'case-manager', 'instructor'],
      organization: ['organization-admin', 'case-manager', 'instructor'],
    }
    for (const [kind, grantable] of Object.entries(lists)) {
      members = { grantable, members: [], invites: [] }
      const { unmount } = render(<MembersPage workspace={kind} />)
      openPanel()
      await screen.findByRole('dialog')
      const select = screen.getByLabelText(/^Role/) as HTMLSelectElement
      expect([...select.options].map((o) => o.value)).toEqual(grantable)
      expect(select.value).toBe(grantable[0])
      unmount()
    }
  })

  it('says plainly when the person was invited, and the message can be dismissed', async () => {
    members = data
    send.mockResolvedValueOnce({ status: 'invited', invite: {} })
    render(<MembersPage workspace="cedar" />)
    openPanel()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'b@example.com' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add person' }))
    const status = await screen.findByRole('status')
    expect(status.textContent).toContain(
      'Invited b@example.com as Provider admin. They get access when they sign in with this email.'
    )
    fireEvent.click(within(status).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows an add error as an alert and keeps the panel open', async () => {
    members = data
    send.mockRejectedValue(new Error('That person already has this role.'))
    render(<MembersPage workspace="cedar" />)
    openPanel()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'x@example.com' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add person' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'That person already has this role.'
    )
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toBeTruthy()
  })

  it('removes a person only after confirming, and withdraws an invitation the same way', async () => {
    members = data
    send.mockResolvedValue(undefined)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<MembersPage workspace="cedar" />)
    const remove = screen.getByRole('button', {
      name: 'Remove Ira Teacher, instructor, Electrical 2026-C',
    })
    fireEvent.click(remove)
    expect(send).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    fireEvent.click(remove)
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith('DELETE', '/learn/workspaces/cedar/members/m2')
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Withdraw invitation for soon@example.com, instructor, Electrical 2026-C',
      })
    )
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith('DELETE', '/learn/workspaces/cedar/members/invites/i1')
    )
    confirm.mockRestore()
  })

  it('opened from a cohort, opens the dialog on that cohort and shows only its staff until asked', async () => {
    members = data
    window.history.pushState({}, '', '/lms/members?site=cedar&cohort=c1')
    render(<MembersPage workspace="cedar" />)
    await screen.findByRole('dialog', { name: 'Add person' })
    expect((screen.getByLabelText(/^Role/) as HTMLSelectElement).value).toBe('instructor')
    expect((screen.getByLabelText(/Cohort they teach/) as HTMLSelectElement).value).toBe('c1')
    expect(bodyRows()).toHaveLength(2)
    expect(screen.queryByText('Pat Admin')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show everyone' }))
    expect(bodyRows()).toHaveLength(3)
    window.history.pushState({}, '', '/')
  })

  it('says how to start when no one is listed', () => {
    members = { grantable: ['provider-admin'], members: [], invites: [] }
    render(<MembersPage workspace="cedar" />)
    expect(screen.getByText(/Use Add person/)).toBeTruthy()
  })

  it('does not load or show anything for a role that cannot manage members', () => {
    role = 'instructor'
    members = data
    render(<MembersPage workspace="cedar" />)
    expect(screen.getByText('Page not found')).toBeTruthy()
    expect(paths.every((p) => p === null)).toBe(true)
  })
})
