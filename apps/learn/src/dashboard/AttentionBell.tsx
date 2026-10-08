import type { AttentionSummary } from '@id/types'
import { useEffect, useRef, useState } from 'react'
import { useLoad } from './api'
import { useApp } from './app-context'
import './attention-bell.css'

/** An item's link keeps the visitor's ?brand= (and ?site= when the item names no workspace). */
export function withVisitorContext(href: string, query: string): string {
  const [path, own = ''] = href.split('?')
  const params = new URLSearchParams(own)
  for (const [k, v] of new URLSearchParams(query)) if (!params.has(k)) params.set(k, v)
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M12 3a6 6 0 0 0-6 6v3.6L4.5 16v1.5h15V16L18 12.6V9a6 6 0 0 0-6-6Zm-2 16a2 2 0 0 0 4 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The header bell (#74): what waits for the signed-in person, as counts, from GET /learn/me/attention.
 * Loaded once per page and again each time the popover opens. A failed request shows no bell at all.
 */
export function AttentionBell() {
  const { query } = useApp()
  const { data, reload } = useLoad<AttentionSummary>('/learn/me/attention')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!data) return null
  const total = data.total
  const label =
    total > 0
      ? `${total} ${total === 1 ? 'item needs' : 'items need'} your attention`
      : 'Nothing needs your attention'

  return (
    <div className="attn" ref={ref}>
      <button
        type="button"
        ref={button}
        className="attn-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls="attn-panel"
        onClick={() => {
          if (!open) reload()
          setOpen(!open)
        }}
      >
        <BellIcon />
        {total > 0 && (
          <span className="attn-badge" aria-hidden="true">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>
      {open && (
        <div id="attn-panel" className="attn-panel">
          <p className="attn-title">Needs your attention</p>
          {data.items.length === 0 ? (
            <p className="attn-empty">You&rsquo;re all caught up.</p>
          ) : (
            <ul>
              {data.items.map((item) => (
                <li key={`${item.kind}:${item.href}`}>
                  <a href={withVisitorContext(item.href, query)}>
                    <span className="attn-text">
                      <span className="attn-item-title">{item.title}</span>
                      {item.detail && <span className="attn-detail">{item.detail}</span>}
                    </span>
                    {item.count !== undefined && <span className="attn-count">{item.count}</span>}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
