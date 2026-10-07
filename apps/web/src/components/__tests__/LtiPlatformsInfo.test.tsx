// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { LtiPlatformsInfoDialog } from '../LtiPlatformsInfo'

vi.mock('@/services/authToken', () => ({ authHeader: async () => ({}) }))

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>How this works</button>
      <LtiPlatformsInfoDialog
        open={open}
        endpoints={{ registrationUrl: 'https://id.example/api/lti/tool/register' }}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

afterEach(cleanup)

describe('LtiPlatformsInfoDialog', () => {
  it('opens, focuses Close, locks the page scroll, and shows the real address', async () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'How this works' }))
    expect(screen.getByRole('dialog', { name: 'How platforms work' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
    expect(document.body.style.overflow).toBe('hidden')
    expect(screen.getByText('https://id.example/api/lti/tool/register')).toBeTruthy()
    expect(document.body.textContent).not.toContain('placeholder')
  })

  it('Escape closes it and focus returns to the opener', async () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'How this works' })
    await userEvent.click(opener)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(document.body.style.overflow).toBe('')
  })

  it('the X closes it and focus returns', async () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'How this works' })
    await userEvent.click(opener)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('keeps Tab inside the dialog', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'How this works' }))
    const dialog = screen.getByRole('dialog')
    for (let i = 0; i < 12; i++) {
      await userEvent.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })
})
