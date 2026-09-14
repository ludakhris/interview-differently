// In-app confirm / notice dialogs. Native `confirm()` / `alert()` are
// auto-dismissed by some hosts (embedded browsers, "block dialogs"), which
// silently no-ops any action gated on them — including a student's Submit.
//
//   const confirm = useConfirm()
//   if (!(await confirm({ title: 'Delete cohort?', body: '…', confirmLabel: 'Delete', danger: true }))) return
//
//   const notify = useNotify()
//   await notify('Could not load the scenario to export.')

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export interface ConfirmOptions {
  title: string
  body?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button for destructive actions. */
  danger?: boolean
}

interface Pending extends ConfirmOptions {
  /** Notice mode: one OK button, resolves true. */
  notice?: boolean
  resolve: (ok: boolean) => void
}

const ConfirmContext = createContext<((opts: ConfirmOptions, notice?: boolean) => Promise<boolean>) | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const confirmBtn = useRef<HTMLButtonElement>(null)

  const ask = useCallback((opts: ConfirmOptions, notice = false) => {
    return new Promise<boolean>(resolve => setPending({ ...opts, notice, resolve }))
  }, [])

  const close = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }

  useEffect(() => {
    if (!pending) return
    confirmBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
      if (e.key === 'Enter') close(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={() => close(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#111] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 pt-5 pb-4">
              <h2 id="confirm-title" className="font-display font-bold text-[16px] text-[#f5f3ee]">{pending.title}</h2>
              {pending.body && <div className="mt-2 text-[13px] text-white/60 leading-relaxed">{pending.body}</div>}
            </div>
            <div className="px-6 pb-5 flex gap-2 justify-end">
              {!pending.notice && (
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="px-3 py-2 rounded-lg border border-white/10 text-[13px] text-white/60 hover:text-white/85 hover:border-white/25 transition-colors"
                >
                  {pending.cancelLabel ?? 'Cancel'}
                </button>
              )}
              <button
                ref={confirmBtn}
                type="button"
                onClick={() => close(true)}
                className={`px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
                  pending.danger
                    ? 'bg-red-500/20 text-red-300 border border-red-400/30 hover:bg-red-500/40 hover:text-white'
                    : 'bg-[#1a6b3c] hover:bg-[#2d9e5f] text-white'
                }`}
              >
                {pending.confirmLabel ?? (pending.notice ? 'OK' : 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

/** Promise-based confirm. Resolves true when the user confirms. */
export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ask = useContext(ConfirmContext)
  if (!ask) throw new Error('useConfirm must be used inside <ConfirmProvider>')
  return useCallback((opts: ConfirmOptions) => ask(opts, false), [ask])
}

/** Promise-based notice (alert replacement). Resolves when dismissed. */
export function useNotify(): (message: string, title?: string) => Promise<void> {
  const ask = useContext(ConfirmContext)
  if (!ask) throw new Error('useNotify must be used inside <ConfirmProvider>')
  return useCallback(async (message: string, title = 'Something went wrong') => { await ask({ title, body: message }, true) }, [ask])
}
