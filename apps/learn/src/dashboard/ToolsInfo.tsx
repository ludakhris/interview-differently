import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { API_URL } from './api'
import { infoSections, registrationUrls, type Actor, type RegistrationUrls } from './toolsInfoText'

const svg = (size: number) =>
  ({
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    'aria-hidden': true,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }) as const

/** The small "i" in a circle. */
export function InfoIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...svg(size)}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v5.5M12 7.6v.1" />
    </svg>
  )
}
const CloseIcon = () => (
  <svg {...svg(20)} strokeWidth={2.2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
const ShieldIcon = () => (
  <svg {...svg(26)}>
    <path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.2-7.5 9.5-4.4-1.3-7.5-4.9-7.5-9.5V6L12 3z" />
    <path d="M8.8 12l2.4 2.4 4.2-4.6" />
  </svg>
)
const CheckIcon = () => (
  <svg {...svg(16)} strokeWidth={2.4}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)
const CrossIcon = () => (
  <svg {...svg(16)} strokeWidth={2.4}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
const ArrowIcon = () => (
  <svg {...svg(16)} strokeWidth={2}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

const ACTOR_CLASS: Record<Actor, string> = {
  You: 'dash-tl-actor-you',
  LearnDifferently: 'dash-tl-actor-us',
  'The tool': 'dash-tl-actor-tool',
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="dash-tl-info-sec" aria-labelledby={`tl-info-${id}`}>
      <h3 id={`tl-info-${id}`}>{title}</h3>
      {children}
    </section>
  )
}

/**
 * The "How this works" help sheet: what connections and tools are, how registering a tool works,
 * and the technical details. A native modal dialog, so Escape closes it, focus stays inside it and
 * returns to the button that opened it. Only the body scrolls; the header stays put.
 */
export function ToolsInfoDialog({
  open,
  registration,
  onClose,
}: {
  open: boolean
  /** The addresses the platform serves, from the API. */
  registration?: RegistrationUrls
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) d.showModal?.()
    if (!open && d.open) d.close?.()
  }, [open])
  const c = infoSections(registrationUrls(registration, API_URL))
  return (
    <dialog
      ref={dialog}
      className="dash-tl-info"
      aria-labelledby="tl-info-title"
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself, outside its content) closes it.
        if (e.target === dialog.current) onClose()
      }}
    >
      <div className="dash-tl-info-box">
        <header className="dash-tl-info-head">
          <span className="dash-tl-info-mark">
            <InfoIcon size={22} />
          </span>
          <div className="dash-tl-info-titles">
            <h2 id="tl-info-title">How connected tools work</h2>
            <p>What a connection and a tool are, and how a tool gets added.</p>
          </div>
          <button type="button" className="dash-tl-info-x" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>

        <div className="dash-tl-info-body">
          <Section id="model" title="At a glance">
            <div className="dash-tl-glance">
              {[c.glance.connection, c.glance.tool].map((g) => (
                <div key={g.title} className="dash-tl-glance-card">
                  <h4>{g.title}</h4>
                  <p>{g.text}</p>
                  <ul>
                    {g.facts.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="dash-tl-relation">
              <ArrowIcon /> {c.glance.relation}
            </p>
          </Section>

          <Section id="by-hand" title="Adding a tool by hand">
            <p>{c.byHand}</p>
          </Section>

          <Section id="by-link" title="Registering a tool from its link">
            <p className="dash-tl-lede">
              A tool that supports IMS LTI Dynamic Registration 1.0 can register itself, so nobody
              copies ids and addresses by hand.
            </p>
            <ol className="dash-tl-steps">
              {c.steps.map((s) => (
                <li key={s.lead}>
                  <div className="dash-tl-step-head">
                    <strong>{s.lead}</strong>
                    <span className={`dash-tl-actor ${ACTOR_CLASS[s.actor]}`}>{s.actor}</span>
                  </div>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
            <ul className="dash-tl-endpoints">
              {c.endpoints.map((e) => (
                <li key={e.method}>
                  <div className="dash-tl-endpoint-head">
                    <span className={`dash-tl-method dash-tl-method-${e.method.toLowerCase()}`}>
                      {e.method}
                    </span>
                    <span className="dash-tl-access">{e.access}</span>
                  </div>
                  <code>{e.url}</code>
                  <small>{e.note}</small>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="accepts" title="What we accept, and what we refuse">
            <div className="dash-tl-cols">
              <div>
                <h4 className="dash-tl-yes">Accepted</h4>
                <ul className="dash-tl-marks">
                  {c.accepts.map((t) => (
                    <li key={t}>
                      <span className="dash-tl-mark dash-tl-mark-yes">
                        <CheckIcon />
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="dash-tl-no">Refused</h4>
                <ul className="dash-tl-marks">
                  {c.refuses.map((t) => (
                    <li key={t}>
                      <span className="dash-tl-mark dash-tl-mark-no">
                        <CrossIcon />
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>

          <Section id="safety" title="Why this is safe">
            <div className="dash-tl-callout">
              <span className="dash-tl-callout-icon">
                <ShieldIcon />
              </span>
              <ul>
                {c.safety.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          </Section>

          <Section id="limits" title="Good to know">
            <ul className="dash-tl-notes">
              {c.notes.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </dialog>
  )
}
