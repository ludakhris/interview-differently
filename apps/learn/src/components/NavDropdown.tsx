import { useEffect, useRef, useState } from 'react'
import type { NavItem } from '../dashboard/navModel'
import './nav-dropdown.css'

/** A header menu of links, with optional section headings and line breaks. */
export function NavDropdown({ label, items }: { label: string; items: NavItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const id = `nd-${label.toLowerCase().replace(/\W+/g, '-')}`

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="nd" ref={ref}>
      <button
        type="button"
        className="nd-trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {label}
        <span className="nd-caret" aria-hidden="true" />
      </button>
      {open && (
        <ul id={id} className="nd-panel">
          {items.map((item, n) =>
            'divider' in item ? (
              <li key={`d${n}`} className="nd-divider" role="separator" />
            ) : 'heading' in item ? (
              <li key={`h${n}`} className="nd-heading">
                {item.heading}
              </li>
            ) : (
              <li key={item.label}>
                <a href={item.href}>{item.label}</a>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  )
}
