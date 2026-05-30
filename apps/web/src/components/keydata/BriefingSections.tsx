// Option D — Briefing card with section heads.
//
// One large card subdivided into named sections (Market / Customer /
// Constraint) — each section holds 2-3 label/value rows. Best when the
// data naturally clusters into thematic groups and the candidate needs to
// see those groupings spelled out.
//
// Panel grouping: each panel's `group` field defines the section. Panels
// without a group fall into an "Overview" section that renders first.

import type { ContextPanel } from '@id/types'
import { panelBase, panelTone, toneText, eyebrow } from './tokens'

const DEFAULT_GROUP = 'Overview'

export function BriefingSections({ panels }: { panels: ContextPanel[] }) {
  const groups = new Map<string, ContextPanel[]>()
  for (const p of panels) {
    const key = p.group ?? DEFAULT_GROUP
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  }

  return (
    <div className={`${panelBase} border-white/10`}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {Array.from(groups.entries()).map(([groupName, items]) => {
          const isConstraintGroup = /constraint|risk/i.test(groupName)
          const headColor = isConstraintGroup ? 'text-amber-400' : 'text-[#7fc8b2]'
          return (
            <div key={groupName}>
              <p className={`${eyebrow} ${headColor}`}>{groupName}</p>
              <dl className="mt-3 space-y-2.5">
                {items.map((p, i) => {
                  const tone = panelTone(p)
                  return (
                    <div key={i} className="flex items-baseline justify-between">
                      <dt className="text-[15px] text-white/65">{p.label}</dt>
                      <dd className={`text-[15px] font-semibold ${toneText[tone]}`}>
                        {p.value}
                        {p.unit && (
                          <span className="ml-1 text-[13px] font-normal text-white/55">
                            {p.unit}
                          </span>
                        )}
                      </dd>
                    </div>
                  )
                })}
              </dl>
            </div>
          )
        })}
      </div>
    </div>
  )
}
