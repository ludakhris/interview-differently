// Shared tokens for exhibit renderers. Centralising the dark-mode panel
// chrome means all 5 exhibit subtypes (DataTable, ProfitTree,
// SegmentationMatrix, ChartExhibit, TextExhibit) read as a single coherent
// family — useful for the future author userguide where each subtype gets
// its own example screenshot.

export const exhibitCard = 'bg-surface-deep border border-edge/10 rounded-2xl overflow-hidden'

export const exhibitHeader = 'px-5 py-4 border-b border-edge/8'

export const exhibitTitle = 'text-[15px] font-semibold text-fg leading-tight'

export const exhibitCaption = 'mt-1 text-[13px] text-ink/60 leading-snug'

export const exhibitFootnote =
  'px-5 py-3 border-t border-edge/8 text-[12px] text-ink/40 leading-snug'

export const exhibitBody = 'px-5 py-4'

export const toneText = {
  accent: 'text-mint',
  danger: 'text-amber-400',
  neutral: 'text-fg',
}
