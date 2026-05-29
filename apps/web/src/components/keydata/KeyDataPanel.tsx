// Dispatcher for the case-style KeyData layouts.
//
// Each business-case scenario picks one of these by setting
// `display.contextStyle` in its yaml. The same `ContextPanel[]` payload
// feeds every renderer, so authors can swap layouts without rewriting data.

import type { ContextPanel as ContextPanelType, ContextDisplayStyle } from '@id/types'
import { TileGrid } from './TileGrid'
import { HeroList } from './HeroList'
import { ContextCards } from './ContextCards'
import { BriefingSections } from './BriefingSections'

export const KEY_DATA_LAYOUTS = [
  'tile-grid',
  'hero-list',
  'context-cards',
  'briefing-sections',
] as const

export type KeyDataLayout = (typeof KEY_DATA_LAYOUTS)[number]

export function isKeyDataLayout(
  style: ContextDisplayStyle | undefined,
): style is KeyDataLayout {
  return !!style && (KEY_DATA_LAYOUTS as readonly string[]).includes(style)
}

interface Props {
  layout: KeyDataLayout
  panels: ContextPanelType[]
  accentColor?: string
}

export function KeyDataPanel({ layout, panels, accentColor }: Props) {
  switch (layout) {
    case 'tile-grid':
      return <TileGrid panels={panels} />
    case 'hero-list':
      return <HeroList panels={panels} accentColor={accentColor} />
    case 'context-cards':
      return <ContextCards panels={panels} />
    case 'briefing-sections':
      return <BriefingSections panels={panels} />
  }
}

export { TileGrid, HeroList, ContextCards, BriefingSections }
