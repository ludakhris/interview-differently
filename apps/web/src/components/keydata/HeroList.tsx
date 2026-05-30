// Option B — Hero stat + secondary list.
//
// One framing metric dominates the left panel (gradient background); the
// remaining metrics stack as a compact name/value list on the right. Best
// when one number drives the case (e.g. "22,000 stores") and the rest are
// context.
//
// Panel selection: the first panel with `hero: true` becomes the hero. If
// none is marked, the first panel is promoted automatically.

import type { ContextPanel } from '@id/types'
import { panelBase, panelTone, toneText, eyebrow } from './tokens'

interface Props {
  panels: ContextPanel[]
  accentColor?: string // case track colour, drives the gradient highlight
}

export function HeroList({ panels, accentColor = '#0f5b89' }: Props) {
  if (panels.length === 0) return null

  const heroIndex = Math.max(0, panels.findIndex(p => p.hero))
  const hero = panels[heroIndex]
  const rest = panels.filter((_, i) => i !== heroIndex)
  const heroTone = panelTone(hero)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
      <div
        className={`${panelBase} border-white/10 flex flex-col justify-center min-h-[160px]`}
        style={{ backgroundImage: `linear-gradient(135deg, ${accentColor}22 0%, #0d0d0d 70%)` }}
      >
        <p className={eyebrow}>{hero.label}</p>
        <p className={`mt-2 text-[36px] font-display font-extrabold leading-none ${toneText[heroTone]}`}>
          {hero.value}
          {hero.unit && (
            <span className="ml-2 text-[16px] font-normal text-white/65 align-baseline">
              {hero.unit}
            </span>
          )}
        </p>
        {hero.caption && (
          <p className="mt-3 text-[15px] text-white/75 leading-relaxed max-w-md">
            {hero.caption}
          </p>
        )}
      </div>

      <div className={`${panelBase} border-white/10`}>
        <p className={eyebrow}>Supporting</p>
        <dl className="mt-3 space-y-2.5">
          {rest.map((p, i) => {
            const tone = panelTone(p)
            return (
              <div
                key={i}
                className="flex items-baseline justify-between border-b border-white/8 pb-2.5 last:border-0 last:pb-0"
              >
                <dt className="text-[14px] text-white/65">{p.label}</dt>
                <dd className={`text-[15px] font-semibold ${toneText[tone]}`}>
                  {p.value}
                  {p.unit && <span className="ml-1 text-[13px] font-normal text-white/55">{p.unit}</span>}
                </dd>
              </div>
            )
          })}
        </dl>
      </div>
    </div>
  )
}
