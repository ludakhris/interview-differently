import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, UserButton } from '@clerk/react'
import { ChevronDown } from 'lucide-react'
import { TOOL_META, type ToolKey } from '@id/types'
import { useMyTools } from '@/hooks/useMyTools'
import { useRole } from '@/hooks/useRole'
import { Wordmark } from '@/components/Wordmark'

interface NavProps {
  trackLabel?: string
  stepLabel?: string
}

export function Nav({ trackLabel, stepLabel }: NavProps) {
  const navigate = useNavigate()
  const { isSignedIn, isLoaded } = useAuth()
  const { isAnyAdmin } = useRole()
  const tools = useMyTools()
  const link =
    'text-[14px] font-semibold text-slate-light hover:text-fg transition-colors whitespace-nowrap'

  return (
    <nav className="sm:sticky top-0 z-50 bg-surface/95 backdrop-blur border-b border-edge/10">
      <div className="max-w-[1200px] mx-auto flex flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 sm:px-8 py-4">
        <button
          onClick={() => navigate('/')}
          className="hover:opacity-80 transition-opacity"
          aria-label="Interview Differently home"
        >
          <Wordmark />
        </button>

        <div className="flex flex-wrap items-center gap-x-5 sm:gap-x-6 gap-y-2">
          {trackLabel && (
            <span className="font-mono text-[11px] font-medium tracking-[0.14em] uppercase text-slate-mid bg-surface-alt px-3 hidden sm:inline py-1 rounded-full border border-edge/10">
              {trackLabel}
              {stepLabel && <span className="text-slate-mid ml-2">{stepLabel}</span>}
            </span>
          )}
          <button onClick={() => navigate('/request-scenario')} className={link}>
            Request a scenario
          </button>
          {isLoaded && isSignedIn && (
            <button onClick={() => navigate('/dashboard')} className={link}>
              Dashboard
            </button>
          )}
          {isLoaded && isSignedIn && tools.length > 0 && <ToolsMenu tools={tools} />}
          {isLoaded && isSignedIn && isAnyAdmin && (
            <button onClick={() => navigate('/builder')} className={link}>
              Builder
            </button>
          )}
          {isLoaded && isSignedIn && isAnyAdmin && (
            <button onClick={() => navigate('/admin')} className={link}>
              Admin
            </button>
          )}
          {isLoaded && isSignedIn && (
            <button onClick={() => navigate('/settings')} className={link}>
              Settings
            </button>
          )}
          {isLoaded &&
            (isSignedIn ? (
              <UserButton />
            ) : (
              <button
                onClick={() => navigate('/sign-in')}
                className="text-[14px] font-semibold text-on-primary bg-primary hover:bg-accent px-4 py-2 rounded-[10px] transition-colors"
              >
                Sign in
              </button>
            ))}
        </div>
      </div>
    </nav>
  )
}

function ToolsMenu({ tools }: { tools: ToolKey[] }) {
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
        className="inline-flex items-center gap-1 text-[14px] font-semibold text-slate-light hover:text-fg transition-colors"
      >
        Tools
        <ChevronDown
          size={12}
          className={`text-slate-mid transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-edge/10 bg-surface-alt shadow-card-lg py-1 z-50">
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
                className="w-full text-left px-3 py-2 hover:bg-ink/5 disabled:hover:bg-transparent disabled:opacity-50 transition-colors"
              >
                <p className="text-[13px] font-semibold text-fg">
                  {meta.label}
                  {!live && (
                    <span className="ml-2 text-[9px] uppercase tracking-widest text-slate-mid">
                      soon
                    </span>
                  )}
                </p>
                <p className="text-[12px] text-slate-mid leading-snug">{meta.description}</p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
