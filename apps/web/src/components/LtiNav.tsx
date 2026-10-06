import { useState } from 'react'
import { useLtiBrand } from '@/components/LtiBrandProvider'
import { getLtiReturnUrl } from '@/services/ltiSession'

/** Nav for LTI launches: brand, track label, and a way back to the course the learner came from. */
export function LtiNav({ trackLabel, stepLabel }: { trackLabel?: string; stepLabel?: string }) {
  const brand = useLtiBrand()
  const [logoFailed, setLogoFailed] = useState(false)
  const branded = Boolean(brand?.name)
  const courseUrl = getLtiReturnUrl()
  return (
    <nav
      className={`flex items-center justify-between px-8 py-4 bg-surface sticky top-0 z-50 ${branded ? 'border-b border-edge/10' : ''}`}
    >
      {branded && brand ? (
        <span className="flex items-center gap-3 min-w-0">
          {brand.logoUrl && !logoFailed ? (
            <img
              src={brand.logoUrl}
              alt={brand.name ?? ''}
              referrerPolicy="no-referrer"
              onError={() => setLogoFailed(true)}
              className="h-7 max-w-[160px] object-contain"
            />
          ) : (
            <span className="font-display font-extrabold text-[17px] text-fg tracking-tight truncate">
              {brand.name}
            </span>
          )}
          <span className="hidden sm:inline text-[10px] tracking-wide text-ink/40 whitespace-nowrap">
            Powered by Interview Differently
          </span>
        </span>
      ) : (
        <span className="font-display font-extrabold text-[17px] text-fg tracking-tight">
          Interview<span className="text-green-light">Differently</span>
        </span>
      )}
      <span className="flex items-center gap-4">
        {courseUrl && (
          <a
            href={courseUrl}
            className="text-[12px] font-semibold text-slate-mid hover:text-fg transition-colors whitespace-nowrap"
          >
            ← Back to course
          </a>
        )}
        {trackLabel && (
          <span className="text-[11px] font-medium tracking-widest uppercase text-slate-light bg-ink/8 px-3 py-1 rounded-full border border-edge/10">
            {trackLabel}
            {stepLabel && <span className="text-ink/40 ml-2">{stepLabel}</span>}
          </span>
        )}
      </span>
    </nav>
  )
}
