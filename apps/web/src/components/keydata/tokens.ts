// Shared design tokens + helpers for the KeyData layout library.
//
// Each KeyData layout renderer (TileGrid, HeroList, ContextCards,
// BriefingSections) imports from here so accent / danger colours stay
// consistent across scenarios and across layouts. Tweak in one place to
// re-skin every business-case scenario at once.

import type { ContextPanel } from '@id/types'

/**
 * Resolve the colour of a panel's value text. Explicit `tone` overrides the
 * legacy `type` mapping so authors can ship a `type: 'info'` panel that still
 * renders in accent green.
 */
export function panelTone(panel: ContextPanel): 'accent' | 'danger' | 'neutral' {
  if (panel.tone) return panel.tone
  if (panel.type === 'alert') return 'danger'
  if (panel.type === 'metric') return 'accent'
  return 'neutral'
}

export const toneText: Record<'accent' | 'danger' | 'neutral', string> = {
  accent: 'text-mint', // brand green, lighter for legibility on dark
  danger: 'text-amber-400',
  neutral: 'text-fg',
}

export const toneBar: Record<'accent' | 'danger' | 'neutral', string> = {
  accent: 'bg-jade',
  danger: 'bg-amber-400',
  neutral: 'bg-ink/40',
}

export const toneBorder: Record<'accent' | 'danger' | 'neutral', string> = {
  accent: 'border-edge/10',
  danger: 'border-amber-500/35',
  neutral: 'border-edge/10',
}

export const panelBase = 'bg-surface-deep border rounded-2xl p-5 transition-colors'

export const eyebrow = 'text-[10px] font-bold uppercase tracking-[0.18em] text-ink/40'
