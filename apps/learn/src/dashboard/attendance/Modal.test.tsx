// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Modal } from './Modal'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.body.style.overflow = ''
})

function Harness({ dirty = false }: { dirty?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open it</button>
      {open && (
        <Modal
          title="Hello"
          dirty={dirty}
          onClose={() => setOpen(false)}
          footer={<button>Last</button>}
        >
          <input aria-label="First field" data-autofocus />
          <button>Middle</button>
        </Modal>
      )}
    </>
  )
}

describe('Modal', () => {
  it('is a labelled modal dialog, focuses its first field and locks body scroll', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }))
    const dialog = screen.getByRole('dialog', { name: 'Hello' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(screen.getByLabelText('First field'))
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('traps Tab and Shift+Tab inside the dialog', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }))
    // Order: Close, First field, Middle, Last.
    const last = screen.getByRole('button', { name: 'Last' })
    last.focus()
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
    await userEvent.tab({ shift: true })
    expect(document.activeElement).toBe(last)
  })

  it('Esc closes, restores scroll and returns focus to the opener', async () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open it' })
    await userEvent.click(opener)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(document.body.style.overflow).toBe('')
  })

  it('a click on the backdrop closes it, a click inside does not', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }))
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.mouseDown(screen.getByTestId('at-backdrop'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('with unsaved changes Esc, backdrop and Close all ask first; declining keeps it open', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Harness dirty />)
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }))
    await userEvent.keyboard('{Escape}')
    fireEvent.mouseDown(screen.getByTestId('at-backdrop'))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(confirm).toHaveBeenCalledTimes(3)
    expect(screen.getByRole('dialog')).toBeTruthy()
    confirm.mockReturnValue(true)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
