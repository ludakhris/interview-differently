import { useNavigate } from 'react-router-dom'
import { useAuth, UserButton } from '@clerk/clerk-react'

interface NavProps {
  trackLabel?: string
  stepLabel?: string
}

export function Nav({ trackLabel, stepLabel }: NavProps) {
  const navigate = useNavigate()
  const { isSignedIn, isLoaded } = useAuth()

  return (
    <nav className="flex items-center justify-between px-8 py-4 bg-[#0a0a0a] sticky top-0 z-50">
      <button
        onClick={() => navigate('/')}
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
        <button
          onClick={() => navigate('/request-scenario')}
          className="text-[12px] font-medium text-slate-mid hover:text-[#f5f3ee] transition-colors"
        >
          Request a scenario
        </button>
        {isLoaded && isSignedIn && (
          <button
            onClick={() => navigate('/settings')}
            className="text-[12px] font-medium text-slate-mid hover:text-[#f5f3ee] transition-colors"
          >
            Settings
          </button>
        )}
        {isLoaded && (
          isSignedIn
            ? <UserButton afterSignOutUrl="/dashboard" />
            : (
              <button
                onClick={() => navigate('/sign-in')}
                className="text-[13px] font-semibold text-[#f5f3ee] hover:text-white/70 transition-colors"
              >
                Sign in
              </button>
            )
        )}
      </div>
    </nav>
  )
}
