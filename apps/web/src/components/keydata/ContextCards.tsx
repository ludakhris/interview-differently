// Option C — Cards with inline context.
//
// Tile grid where each card carries a short caption beneath the number, and
// optionally a mini share-bar (driven by panel.share, 0-100). Best when each
// data point needs a one-line reframing for the candidate (e.g. "50% of
// rural population") — heavier than a plain tile grid but reads like a
// briefing dashboard.

import type { ContextPanel } from '@id/types'
import { panelBase, panelTone, toneBar, toneBorder, toneText, eyebrow } from './tokens'

export function ContextCards({ panels }: { panels: ContextPanel[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {panels.map((p, i) => {
        const tone = panelTone(p)
        const hasBar = typeof p.share === 'number'
        return (
          <div key={i} className={`${panelBase} ${toneBorder[tone]}`}>
            <div className="flex items-baseline justify-between gap-2">
              <p className={`text-[28px] font-display font-extrabold leading-none ${toneText[tone]}`}>
                {p.value}
              </p>
              {p.unit && (
                <span className="text-[12px] text-white/55 whitespace-nowrap">
                  {p.unit}
                </span>
              )}
            </div>

            <p className={`${eyebrow} mt-2`}>{p.label}</p>

            {hasBar && (
              <div className="mt-3">
                <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/8">
                  <div
                    className={toneBar[tone]}
                    style={{ width: `${Math.max(0, Math.min(100, p.share!))}%` }}
                  />
                </div>
              </div>
            )}

            {p.caption && (
              <p className="mt-2 text-[13px] leading-snug text-white/55">
                {p.caption}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
