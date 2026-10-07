import './modal.css'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export const UNSAVED_PROMPT = 'You have unsaved changes. Close without saving?'

/**
 * One accessible dialog: labelled by its title, Tab stays inside, Esc and a backdrop click close it
 * (asking first when `dirty`), focus returns to the opener, and the page behind does not scroll.
 * On a phone it is a full-height sheet (see .at-modal in attendance.css).
 */
export function Modal({
  title,
  onClose,
  dirty = false,
  footer,
  className = '',
  wide = false,
  children,
}: {
  title: string
  onClose: () => void
  dirty?: boolean
  footer?: ReactNode
  /** Extra classes on the dialog (a feature's own style tokens). */
  className?: string
  wide?: boolean
  children: ReactNode
}) {
  const titleId = useId()
  // Portal into the themed page root (.dash), not <body>, so fonts, colours and button styles apply.
  const [host, setHost] = useState<HTMLElement | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const requestClose = () => {
    if (dirtyRef.current && !window.confirm(UNSAVED_PROMPT)) return
    closeRef.current()
  }
  const requestCloseRef = useRef(requestClose)
  requestCloseRef.current = requestClose

  // Focus moves in on open and back to the opener on close; the body stops scrolling meanwhile.
  useEffect(() => {
    if (!host) return
    const opener = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const first = dialog.current?.querySelector<HTMLElement>('[data-autofocus]')
    ;(first ?? dialog.current)?.focus()
    return () => {
      document.body.style.overflow = overflow
      if (opener && opener.isConnected) opener.focus()
    }
  }, [host])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      requestCloseRef.current()
      return
    }
    if (e.key !== 'Tab' || !dialog.current) return
    const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .filter((el) => el.tabIndex >= 0)
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    if (items.length === 0) {
      e.preventDefault()
      dialog.current.focus()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === dialog.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  if (!host)
    return (
      <span
        hidden
        ref={(el) => {
          if (el) setHost((el.closest('.dash') as HTMLElement | null) ?? document.body)
        }}
      />
    )
  return createPortal(
    <div
      className="dash-backdrop"
      data-testid="dash-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose()
      }}
    >
      <div
        className={`dash-modal${wide ? ' dash-modal-wide' : ''} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialog}
        onKeyDown={onKeyDown}
      >
        <header className="dash-modal-head">
          <h2 className="dash-modal-title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="dash-btn-quiet" onClick={requestClose}>
            Close
          </button>
        </header>
        <div className="dash-modal-body">{children}</div>
        {footer && <footer className="dash-modal-foot">{footer}</footer>}
      </div>
    </div>,
    host
  )
}
