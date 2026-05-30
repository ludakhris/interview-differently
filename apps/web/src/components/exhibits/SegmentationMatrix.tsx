// segmentation-matrix exhibit. 2x2 grid with labelled axes + named
// quadrants. Common in case interviews for BCG-style growth-share matrices,
// value-vs-effort prioritisation, etc.

import type { SegmentationMatrixExhibit, SegmentationMatrixItem } from '@id/types'
import { ExhibitShell } from './ExhibitShell'

export function SegmentationMatrix({ exhibit }: { exhibit: SegmentationMatrixExhibit }) {
  return (
    <ExhibitShell
      title={exhibit.title}
      caption={exhibit.caption}
      footnote={exhibit.footnote}
      badge="Matrix"
    >
      <div className="relative">
        {/* y-axis label */}
        <div className="flex items-stretch">
          <div className="flex flex-col items-center justify-between pr-3 py-1">
            <span className="text-[10px] text-white/45 -rotate-90 whitespace-nowrap origin-center mb-3">
              {exhibit.yAxis.highLabel}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/30 -rotate-90 whitespace-nowrap">
              {exhibit.yAxis.label}
            </span>
            <span className="text-[10px] text-white/45 -rotate-90 whitespace-nowrap origin-center mt-3">
              {exhibit.yAxis.lowLabel}
            </span>
          </div>

          {/* 2x2 grid */}
          <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2">
            <Quadrant
              items={exhibit.quadrants.topLeft}
              label={exhibit.quadrantLabels?.topLeft}
            />
            <Quadrant
              items={exhibit.quadrants.topRight}
              label={exhibit.quadrantLabels?.topRight}
              accent
            />
            <Quadrant
              items={exhibit.quadrants.bottomLeft}
              label={exhibit.quadrantLabels?.bottomLeft}
            />
            <Quadrant
              items={exhibit.quadrants.bottomRight}
              label={exhibit.quadrantLabels?.bottomRight}
            />
          </div>
        </div>

        {/* x-axis labels */}
        <div className="flex items-center mt-2 pl-12">
          <span className="text-[10px] text-white/45 flex-1">{exhibit.xAxis.lowLabel}</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">
            {exhibit.xAxis.label}
          </span>
          <span className="text-[10px] text-white/45 flex-1 text-right">
            {exhibit.xAxis.highLabel}
          </span>
        </div>
      </div>
    </ExhibitShell>
  )
}

function Quadrant({
  items,
  label,
  accent = false,
}: {
  items: SegmentationMatrixItem[]
  label?: string
  accent?: boolean
}) {
  return (
    <div
      className={`rounded-lg border p-3 min-h-[100px] ${
        accent
          ? 'bg-[#4ea58a14] border-[#4ea58a55]'
          : 'bg-white/3 border-white/10'
      }`}
    >
      {label && (
        <p
          className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${
            accent ? 'text-[#7fc8b2]' : 'text-white/50'
          }`}
        >
          {label}
        </p>
      )}
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i}>
            <p className="text-[14px] font-medium text-[#f5f3ee] leading-snug">{it.label}</p>
            {it.caption && (
              <p className="text-[12px] text-white/55 leading-snug">{it.caption}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
