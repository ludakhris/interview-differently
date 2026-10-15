import type { AdaptiveSyncResult } from '@id/types'
import { useEffect, useRef, type CSSProperties } from 'react'
import { ProvenChip } from './ProvenChip'

const stagger = (i: number, start: number): CSSProperties =>
  ({ '--ad-delay': `${start + i * 0.18}s` }) as CSSProperties

/**
 * The moment the learner's answers change their path: what they have proven (struck through, one by one) and what
 * was added to help (sliding in), side by side. Keeping going is the main action; the path is one link away.
 */
export function PlanChangeOverlay({
  result,
  courseHref,
  onClose,
}: {
  result: AdaptiveSyncResult
  courseHref: string
  onClose: () => void
}) {
  const keep = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  // Once, on open: the rest of the page goes inert, focus moves in, Tab stays inside and Esc closes. On close the
  // page comes back and focus returns to where it was (the checkpoint frame).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const madeInert = makeRestInert(dialog.current)
    keep.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
        return
      }
      if (e.key === 'Tab' && dialog.current) trapTab(e, dialog.current)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      for (const el of madeInert) el.removeAttribute('inert')
      if (opener?.isConnected) opener.focus()
    }
  }, [])
  const proven = result.planSkipped.length > 0
  const added = result.planAdded.length > 0

  return (
    <div
      ref={dialog}
      className="ad-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="h-plan-changed"
    >
      <div className="ad pc-card">
        <header className="pc-band">
          <span className="pc-medal" aria-hidden="true">
            🏅
          </span>
          <h2 id="h-plan-changed">Your path just changed</h2>
          <p>
            {proven && added
              ? 'You proved some skills and found a gap, so your path moved both ways.'
              : proven
                ? 'You proved some skills, so you can skip what you already know.'
                : 'Your answers found a gap, so we added help right where you need it.'}
          </p>
        </header>
        <div className="pc-cols">
          {proven && (
            <section>
              <h3>
                <ProvenChip>Proven</ProvenChip> No longer needed
              </h3>
              <ol>
                {result.planSkipped.map((s, i) => (
                  <li
                    key={s.itemId}
                    className="ad-row is-skipped is-skipping"
                    style={stagger(i, 0.4)}
                  >
                    <span className="ad-row-title">{s.title}</span>
                    <small>{s.skill}</small>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {added && (
            <section>
              <h3>
                <span className="ad-chip ad-chip-add">+ Added</span> To help you with a gap
              </h3>
              <ol>
                {result.planAdded.map((a, i) => (
                  <li
                    key={a.itemId}
                    className="ad-row is-entering"
                    style={stagger(i, 0.4 + result.planSkipped.length * 0.18)}
                  >
                    <span className="ad-row-title">{a.title}</span>
                    <small>{a.skill}</small>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
        <footer className="pc-foot">
          <button ref={keep} type="button" className="pc-keep" onClick={onClose}>
            Keep working
          </button>
          <a className="pc-path" href={courseHref}>
            See my updated path
          </a>
        </footer>
      </div>
    </div>
  )
}

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/** Everything on the page but `el` and its ancestors goes inert; returns what it changed, to undo on close. */
function makeRestInert(el: HTMLElement | null): HTMLElement[] {
  const changed: HTMLElement[] = []
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    for (const sibling of Array.from(node.parentElement?.children ?? [])) {
      if (sibling === node || !(sibling instanceof HTMLElement) || sibling.hasAttribute('inert'))
        continue
      sibling.setAttribute('inert', '')
      changed.push(sibling)
    }
  }
  return changed
}

/** Tab and Shift+Tab wrap around inside the dialog. */
function trapTab(e: KeyboardEvent, dialog: HTMLElement) {
  // In document order (some DOM implementations return a selector list's matches grouped by selector).
  const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  )
  if (items.length === 0) return
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  if (!dialog.contains(active)) {
    e.preventDefault()
    first.focus()
  } else if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}
