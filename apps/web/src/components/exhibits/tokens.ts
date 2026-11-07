// Shared tokens for exhibit renderers: a light card with a dark outline and a dark header bar.
// Centralising the chrome means all 5 exhibit subtypes (DataTable, ProfitTree,
// SegmentationMatrix, ChartExhibit, TextExhibit) read as a single coherent
// family — useful for the future author userguide where each subtype gets
// its own example screenshot.

export const exhibitCard = 'bg-surface-alt border border-ink rounded-2xl overflow-hidden'

/** The dark header bar; `sim-dark` gives it the navy panel colours (the tenant's in a launch). */
export const exhibitHeader = 'sim-dark bg-surface px-5 py-4'

export const exhibitTitle = 'text-[15px] font-semibold text-fg leading-tight'

export const exhibitCaption = 'mt-1 text-[13px] text-slate-light leading-snug'

export const exhibitFootnote =
  'px-5 py-3 border-t border-edge/8 text-[12px] text-slate-mid leading-snug'

export const exhibitBody = 'px-5 py-4'

export const toneText = {
  accent: 'text-mint',
  danger: 'text-amber-400',
  neutral: 'text-fg',
}
