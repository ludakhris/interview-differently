import { useEffect, useRef, useState, type ReactNode } from 'react'
import { API_URL } from '@/services/ltiPlatformsService'
import {
  copyText,
  infoContent,
  toolEndpoints,
  type Actor,
  type ToolEndpoints,
} from '@/lib/ltiPlatformsInfo'

const svg = (size: number, width = 1.8) =>
  ({
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    'aria-hidden': true,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: width,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }) as const

export function InfoIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...svg(size)}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v5.5M12 7.6v.1" />
    </svg>
  )
}
const Check = () => (
  <svg {...svg(16, 2.4)}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)
const Cross = () => (
  <svg {...svg(16, 2.4)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

const ACTOR: Record<Actor, string> = {
  You: 'bg-green/20 text-green-light',
  'The platform': 'bg-amber-400/15 text-amber-300',
  'Interview Differently': 'bg-ink/10 text-ink/70',
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="mb-7 last:mb-0" aria-labelledby={`lti-info-${id}`}>
      <h3 id={`lti-info-${id}`} className="font-display font-bold text-[14px] text-fg mb-3">
        {title}
      </h3>
      {children}
    </section>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        setState((await copyText(text)) ? 'copied' : 'failed')
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setState('idle'), 2000)
      }}
      className="shrink-0 px-2.5 py-1 rounded-md border border-edge/15 text-[11px] font-semibold text-ink/70 hover:text-ink hover:border-edge/30 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-light"
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select it' : 'Copy'}
    </button>
  )
}

/**
 * The "How this works" sheet for the Platforms page: what a platform is, how one registers itself
 * and the addresses to give it. A modal dialog: Escape and the X close it, Tab stays inside it,
 * focus returns to what opened it, and only its body scrolls (the page behind is locked).
 */
export function LtiPlatformsInfoDialog({
  open,
  endpoints,
  onClose,
}: {
  open: boolean
  /** The addresses from the API; derived from the API address when it sent none. */
  endpoints?: Partial<ToolEndpoints> | null
  onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !box.current) return
      const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !box.current.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !box.current.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      opener?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null
  const c = infoContent(toolEndpoints(endpoints, API_URL))

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lti-info-title"
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col w-full max-w-2xl max-h-full rounded-2xl border border-edge/10 bg-surface-alt shadow-2xl"
      >
        <header className="flex items-start gap-3 px-5 sm:px-6 py-4 border-b border-edge/10">
          <span className="mt-0.5 text-green-light">
            <InfoIcon size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="lti-info-title" className="font-display font-bold text-[17px] text-fg">
              How platforms work
            </h2>
            <p className="text-[13px] text-slate-mid mt-0.5">
              What a platform is, how one registers itself, and the addresses to give it.
            </p>
          </div>
          <button
            ref={closeBtn}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-ink/60 hover:text-ink hover:bg-ink/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-light"
          >
            <svg {...svg(20, 2.2)}>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 text-[13px] text-ink/80 leading-relaxed">
          <Section id="model" title="At a glance">
            <div className="grid sm:grid-cols-2 gap-3">
              {c.glance.map((g) => (
                <div key={g.title} className="rounded-xl border border-edge/10 bg-surface p-4">
                  <h4 className="font-bold text-[13px] text-fg">{g.title}</h4>
                  <p className="mt-1">{g.text}</p>
                  <ul className="mt-2 space-y-0.5 text-ink/60">
                    {g.facts.map((f) => (
                      <li key={f}>· {f}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-3 font-semibold text-green-light">{c.relation}</p>
          </Section>

          <Section id="registering" title="A platform registers itself">
            <ol className="space-y-3">
              {c.steps.map((s, i) => (
                <li key={s.lead} className="flex gap-3">
                  <span
                    aria-hidden
                    className="shrink-0 w-6 h-6 rounded-full bg-ink/10 text-[12px] font-bold text-ink/70 flex items-center justify-center"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-fg">{s.lead}</strong>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${ACTOR[s.actor]}`}
                      >
                        {s.actor}
                      </span>
                    </div>
                    <p className="mt-0.5 text-ink/70">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section id="approval" title="Approval">
            <ul className="space-y-2 list-disc pl-5">
              {c.approval.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </Section>

          <Section id="addresses" title="The addresses to give a platform">
            <ul className="space-y-2">
              {c.addresses.map((a) => (
                <li key={a.label} className="rounded-xl border border-edge/10 bg-surface p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-fg">{a.label}</span>
                    <CopyButton text={a.url} label={a.label.toLowerCase()} />
                  </div>
                  <code className="block mt-1 font-mono text-[12px] text-ink/80 break-all">
                    {a.url}
                  </code>
                  <small className="block mt-1 text-slate-mid">{a.note}</small>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="accepts" title="What is accepted, and what is refused">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <h4 className="font-bold text-green-light mb-2">Accepted</h4>
                <ul className="space-y-2">
                  {c.accepts.map((t) => (
                    <li key={t} className="flex gap-2">
                      <span className="mt-0.5 shrink-0 text-green-light">
                        <Check />
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-bold text-red-400 mb-2">Refused</h4>
                <ul className="space-y-2">
                  {c.refuses.map((t) => (
                    <li key={t} className="flex gap-2">
                      <span className="mt-0.5 shrink-0 text-red-400">
                        <Cross />
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>

          <Section id="safety" title="Why this is safe">
            <ul className="space-y-2 rounded-xl border border-green/30 bg-green/10 p-4 list-disc pl-9">
              {c.safety.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </Section>

          <Section id="notes" title="Good to know">
            <ul className="space-y-2 list-disc pl-5 text-ink/70">
              {c.notes.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  )
}
