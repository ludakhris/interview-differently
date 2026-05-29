// Shared tokens for exhibit renderers. Centralising the dark-mode panel
// chrome means all 5 exhibit subtypes (DataTable, ProfitTree,
// SegmentationMatrix, ChartExhibit, TextExhibit) read as a single coherent
// family — useful for the future author userguide where each subtype gets
// its own example screenshot.

export const exhibitCard =
  'bg-[#0d0d0d] border border-white/10 rounded-2xl overflow-hidden'

export const exhibitHeader =
  'px-5 py-4 border-b border-white/8'

export const exhibitTitle =
  'text-[14px] font-semibold text-[#f5f3ee] leading-tight'

export const exhibitCaption =
  'mt-1 text-[12px] text-white/55 leading-snug'

export const exhibitFootnote =
  'px-5 py-3 border-t border-white/8 text-[11px] text-white/35 leading-snug'

export const exhibitBody = 'px-5 py-4'

export const toneText = {
  accent: 'text-[#7fc8b2]',
  danger: 'text-amber-400',
  neutral: 'text-[#f5f3ee]',
}
