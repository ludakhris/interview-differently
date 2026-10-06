/** Nav for LTI launches: brand and track label only, nothing that leads away. */
export function LtiNav({ trackLabel, stepLabel }: { trackLabel?: string; stepLabel?: string }) {
  return (
    <nav className="flex items-center justify-between px-8 py-4 bg-[#0a0a0a] sticky top-0 z-50">
      <span className="font-display font-extrabold text-[17px] text-[#f5f3ee] tracking-tight">
        Interview<span className="text-green-light">Differently</span>
      </span>
      {trackLabel && (
        <span className="text-[11px] font-medium tracking-widest uppercase text-slate-light bg-white/8 px-3 py-1 rounded-full border border-white/10">
          {trackLabel}
          {stepLabel && <span className="text-white/40 ml-2">{stepLabel}</span>}
        </span>
      )}
    </nav>
  )
}
