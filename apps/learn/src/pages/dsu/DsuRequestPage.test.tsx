// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()
let signedIn = true
vi.mock('@clerk/react', () => ({
  useUser: () => ({
    isLoaded: true,
    isSignedIn: signedIn,
    user: signedIn
      ? { fullName: 'Test Learner', primaryEmailAddress: { emailAddress: 't@example.org' } }
      : null,
  }),
}))
vi.mock('../../auth', () => ({ authConfigured: true }))
vi.mock('../../dashboard/api', () => ({
  ApiError: class extends Error {},
  useApiSend: () => send,
}))
vi.mock('../../public-api', () => ({
  usePublic: () => ({
    data: { id: 'c1', title: 'Paralegal', acceptsRequests: true },
    error: null,
    loading: false,
  }),
}))

import { DsuRequestPage } from './DsuRequestPage'

afterEach(() => {
  cleanup()
  send.mockReset()
  signedIn = true
})

function fillIn() {
  fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '302-555-0100' } })
  fireEvent.change(screen.getByLabelText('Highest education'), {
    target: { value: 'High School/GED' },
  })
  fireEvent.click(screen.getByLabelText('No'))
  fireEvent.click(screen.getByLabelText(/I will pay myself/))
  fireEvent.click(screen.getByRole('button', { name: 'Send my request' }))
}

describe('DSU request form (#124)', () => {
  it('says it is a demonstration, and checks the required answers before sending', () => {
    render(<DsuRequestPage tenant="dsu" courseId="c1" href={(p) => p} />)
    expect(screen.getByText(/please don.t enter real details/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Send my request' }))
    expect(send).not.toHaveBeenCalled()
    expect(screen.getByText('Enter a phone number.')).toBeTruthy()
    expect(screen.getByText('Choose how you plan to pay.')).toBeTruthy()
    expect(document.activeElement?.id).toBe('dsu-phone')
  })

  it('sends the answers and confirms in demonstration terms', async () => {
    send.mockResolvedValue({ pending: true, request: { courseTitle: 'Paralegal' } })
    render(<DsuRequestPage tenant="dsu" courseId="c1" href={(p) => p} />)
    fillIn()
    expect(send.mock.calls[0][1]).toBe('/learn/me/catalog/dsu/courses/c1/request')
    const done = await screen.findByRole('heading', { name: /Request sent/ })
    expect(document.activeElement).toBe(done)
    expect(screen.getByText(/no one at DSU receives it/)).toBeTruthy()
  })

  it('lets a signed-out visitor try the whole form but sends nothing', async () => {
    signedIn = false
    render(<DsuRequestPage tenant="dsu" courseId="c1" href={(p) => p} />)
    expect(screen.getByText(/Nothing you type here is sent or kept/)).toBeTruthy()
    fillIn()
    expect(await screen.findByRole('heading', { name: /nothing was sent/ })).toBeTruthy()
    expect(send).not.toHaveBeenCalled()
  })
})
