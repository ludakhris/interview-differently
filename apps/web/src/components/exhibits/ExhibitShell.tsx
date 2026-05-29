// Common header/body/footnote shell shared by every exhibit subtype.
// Keeps title styling, captions, and source notes consistent across the
// library so authors only choose the subtype, never the chrome.

import type { ReactNode } from 'react'
import {
  exhibitCard,
  exhibitHeader,
  exhibitTitle,
  exhibitCaption,
  exhibitFootnote,
  exhibitBody,
} from './tokens'

interface Props {
  title: string
  caption?: string
  footnote?: string
  badge?: string                       // e.g. 'Table', 'Chart', 'Matrix'
  children: ReactNode
  bodyClassName?: string
}

export function ExhibitShell({ title, caption, footnote, badge, children, bodyClassName }: Props) {
  return (
    <article className={exhibitCard}>
      <header className={exhibitHeader}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className={exhibitTitle}>{title}</h3>
            {caption && <p className={exhibitCaption}>{caption}</p>}
          </div>
          {badge && (
            <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-widest text-white/40 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </div>
      </header>
      <div className={bodyClassName ?? exhibitBody}>{children}</div>
      {footnote && <footer className={exhibitFootnote}>{footnote}</footer>}
    </article>
  )
}
