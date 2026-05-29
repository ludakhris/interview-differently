// Option A — Stat tile grid.
//
// 4-up equal cards with a single big number and a short label. Best when
// the brief is a balanced set of independent facts (no clear hero) and the
// candidate just needs to scan the framing data quickly.

import type { ContextPanel } from '@id/types'
import { panelBase, panelTone, toneBorder, toneText, eyebrow } from './tokens'

export function TileGrid({ panels }: { panels: ContextPanel[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {panels.map((p, i) => {
        const tone = panelTone(p)
        return (
          <div key={i} className={`${panelBase} ${toneBorder[tone]}`}>
            <p className={`text-[28px] font-display font-extrabold leading-none ${toneText[tone]}`}>
              {p.value}
              {p.unit && (
                <span className="ml-1 text-[14px] font-normal text-white/50 align-baseline">
                  {p.unit}
                </span>
              )}
            </p>
            <p className={`${eyebrow} mt-2`}>{p.label}</p>
          </div>
        )
      })}
    </div>
  )
}
