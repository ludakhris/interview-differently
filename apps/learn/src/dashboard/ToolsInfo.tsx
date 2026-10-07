import { useEffect, useRef } from 'react'
import { API_URL } from './api'
import { infoSections } from './toolsInfoText'

const ICON = { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': true } as const

/** The small "i" in a circle. */
export function InfoIcon() {
  return (
    <svg {...ICON} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v5.5M12 7.6v.1" />
    </svg>
  )
}

/**
 * The "How this works" dialog: what connections and tools are, and how registering a tool works,
 * with the technical details. A native modal dialog, so Escape closes it, focus stays inside it
 * and returns to the button that opened it.
 */
export function ToolsInfoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) d.showModal?.()
    if (!open && d.open) d.close?.()
  }, [open])
  const sections = infoSections(API_URL)
  return (
    <dialog
      ref={dialog}
      className="dash-tl-info"
      aria-labelledby="tl-info-title"
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself, outside its content) closes it.
        if (e.target === dialog.current) onClose()
      }}
    >
      <div className="dash-tl-info-box">
        <header className="dash-tl-info-head">
          <h2 id="tl-info-title">How connected tools work</h2>
          <button type="button" className="dash-btn-quiet" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>
        <div className="dash-tl-info-body">
          {sections.map((s) => (
            <section key={s.id} aria-labelledby={`tl-info-${s.id}`}>
              <h3 id={`tl-info-${s.id}`}>{s.title}</h3>
              {s.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
              {s.items &&
                (s.ordered ? (
                  <ol>
                    {s.items.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ol>
                ) : (
                  <ul>
                    {s.items.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                ))}
              {s.code && <pre>{s.code}</pre>}
            </section>
          ))}
        </div>
      </div>
    </dialog>
  )
}
