import { useNavigate } from 'react-router-dom'

interface NavProps {
  trackLabel?: string
  stepLabel?: string
}

export function Nav({ trackLabel, stepLabel }: NavProps) {
  const navigate = useNavigate()

  return (
    <nav className="flex items-center justify-between px-8 py-4 bg-[#0a0a0a] sticky top-0 z-50">
      <button
        onClick={() => navigate('/dashboard')}
        className="font-display font-extrabold text-[17px] text-[#f5f3ee] tracking-tight hover:opacity-80 transition-opacity"
      >
        Interview<span className="text-green-light">Differently</span>
      </button>

      <div className="flex items-center gap-4">
        {trackLabel && (
          <span className="text-[11px] font-medium tracking-widest uppercase text-slate-light bg-white/8 px-3 py-1 rounded-full border border-white/10">
            {trackLabel}
            {stepLabel && <span className="text-white/40 ml-2">{stepLabel}</span>}
          </span>
        )}
        <div className="w-8 h-8 rounded-full bg-green flex items-center justify-center text-white text-[12px] font-display font-bold cursor-pointer select-none">
          JD
        </div>
      </div>
    </nav>
  )
}
