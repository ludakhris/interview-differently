import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useUser, UserButton } from '@clerk/clerk-react'
import { ChevronDown } from 'lucide-react'
import { TOOL_META, type ToolKey } from '@id/types'
import { useMyTools } from '@/hooks/useMyTools'

interface NavProps {
  trackLabel?: string
  stepLabel?: string
}

export function Nav({ trackLabel, stepLabel }: NavProps) {
  const navigate = useNavigate()
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const isAdmin = user?.publicMetadata?.role === 'admin'
  const tools = useMyTools()

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
            onClick={() => navigate('/dashboard')}
            className="text-[12px] font-medium text-slate-mid hover:text-[#f5f3ee] transition-colors"
          >
            Dashboard
          </button>
        )}
        {isLoaded && isSignedIn && tools.length > 0 && <ToolsMenu tools={tools} isAdmin={isAdmin} />}
        {isLoaded && isSignedIn && isAdmin && (
          <button
            onClick={() => navigate('/builder')}
            className="text-[12px] font-medium text-slate-mid hover:text-[#f5f3ee] transition-colors"
          >
            Builder
          </button>
        )}
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

function ToolsMenu({ tools, isAdmin }: { tools: ToolKey[]; isAdmin: boolean }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-mid hover:text-[#f5f3ee] transition-colors"
      >
        Tools
        <ChevronDown size={12} className={`text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-white/10 bg-[#111111] shadow-card-lg py-1 z-50">
          {tools.map((key) => {
            const meta = TOOL_META[key]
            const live = meta.live
            return (
              <button
                key={key}
                disabled={!live}
                onClick={() => {
                  setOpen(false)
                  navigate(meta.path)
                }}
                className="w-full text-left px-3 py-2 hover:bg-white/5 disabled:hover:bg-transparent disabled:opacity-50 transition-colors"
              >
                <p className="text-[13px] font-semibold text-[#f5f3ee]">
                  {meta.label}
                  {!live && <span className="ml-2 text-[9px] uppercase tracking-widest text-white/40">soon</span>}
                </p>
                <p className="text-[11px] text-slate-mid leading-snug">{meta.description}</p>
              </button>
            )
          })}
          {isAdmin && (
            <>
              <div className="my-1 border-t border-white/8" />
              <p className="px-3 pt-1.5 pb-0.5 text-[9px] font-bold uppercase tracking-widest text-white/30">Admin</p>
              {[
                { label: 'Datasets', path: '/admin/datasets' },
                { label: 'Assessments', path: '/admin/assessments' },
                { label: 'Institutions & Cohorts', path: '/admin/institutions' },
              ].map((item) => (
                <button
                  key={item.path}
                  onClick={() => {
                    setOpen(false)
                    navigate(item.path)
                  }}
                  className="w-full text-left px-3 py-1.5 text-[12px] text-slate-mid hover:text-[#f5f3ee] hover:bg-white/5 transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
