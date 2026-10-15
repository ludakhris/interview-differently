import { CONTACT_EMAIL } from '../../contact'
import { PRODUCTS, productPagePath, type Product } from '../../products'
import { NotFoundPage } from '../NotFoundPage'
import {
  ChatMock,
  HERO_CARDS,
  HeroCardDemo,
  LmsHubDemo,
  SIMULATIONS,
  ShotPipeline,
  SparkHeroDemo,
  SparkPathDemo,
  useReveal,
} from './ProductDemos'
import { SimpleShell } from '../SimpleShell'
import type { CSSProperties, ReactNode } from 'react'
import '../home/home-sections.css'
import './product-page.css'

/** The headline, with its highlight phrases in the accent orange (each at its first place in the headline). */
function Headline({ p }: { p: Product }) {
  const marks = (p.highlight ?? [])
    .map((h) => ({ h, at: p.headline.indexOf(h) }))
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at)
  const parts: ReactNode[] = []
  let from = 0
  for (const { h, at } of marks) {
    if (at < from) continue
    parts.push(
      p.headline.slice(from, at),
      <span key={at} className="ld-orange">
        {h}
      </span>
    )
    from = at + h.length
  }
  parts.push(p.headline.slice(from))
  return <>{parts}</>
}

/**
 * A section with a picture on one side and, on the other, a small eyebrow, a big title and a short
 * text. The picture is on the left unless `flip`, so rows can alternate.
 */
function Row({
  visual,
  eyebrow,
  title,
  flip = false,
  children,
}: {
  visual: ReactNode
  eyebrow: string
  title: string
  flip?: boolean
  children: ReactNode
}) {
  const copy = (
    <div className="pp-row-copy">
      <p className="ld-mono pp-row-eyebrow">{eyebrow.toUpperCase()}</p>
      <h2 className="ld-h2 ld-h2-sm">{title}</h2>
      {children}
    </div>
  )
  const pic = <div className="pp-row-visual">{visual}</div>
  return (
    <section className={`pp-section pp-row${flip ? ' pp-row-flip' : ''}`}>
      {flip ? copy : pic}
      {flip ? pic : copy}
    </section>
  )
}

/** The picture beside the hero copy: the LMS hub, Spark's learners, or a card for the others. */
function HeroVisual({ p }: { p: Product }) {
  if (p.id === 'lms') return <LmsHubDemo />
  if (p.id === 'micro-learning') return <SparkHeroDemo />
  const card = HERO_CARDS[p.id]
  return card ? <HeroCardDemo card={card} /> : null
}

/** One icon per step, in the order of the steps in products.ts. */
const STEP_ICONS: Record<Product['id'], string[]> = {
  lms: ['🗺️', '📝', '🗓️', '📈', '🎓'],
  'micro-learning': ['🎯', '🔎', '🎬', '🧭'],
  'skill-simulator': ['🏢', '🛠️', '💬', '🤖', '✅'],
  'job-board-match': ['✅', '🔎', '🧭', '📨'],
  'talent-match': ['🕹️', '🪪', '🔍', '🤝'],
}

/**
 * How it works: the steps down a line, with a token that moves from stop to stop and lights each step as it
 * arrives, then starts again. With reduced motion every step is lit and nothing moves.
 */
function HowItWorks({ p, steps }: { p: Product; steps: string[] }) {
  const icons = STEP_ICONS[p.id]
  const { shown } = useReveal(steps.length, 1400)
  const at = shown - 1
  const style = { '--steps': steps.length, '--at': at / Math.max(steps.length - 1, 1) }
  return (
    <>
      <h2 className="ld-h2 ld-h2-sm">How it works</h2>
      <div className="pp-journey" style={style as CSSProperties}>
        <div className="pp-journey-track" aria-hidden="true">
          <span className="pp-journey-fill" />
          <span className="pp-journey-token">{icons[at]}</span>
        </div>
        <ol className="pp-journey-list">
          {steps.map((step, i) => (
            <li key={step} className={i <= at ? 'is-on' : undefined}>
              <span className="pp-journey-stop" aria-hidden="true" />
              <span className="ld-mono pp-journey-num">STEP {i + 1}</span>
              <span className="pp-journey-text">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </>
  )
}

/**
 * One page per component, built from the registry so the menu, homepage and page agree: a hero
 * with a picture of it at work, how it works, and where it sits among the five.
 */
export function ProductPage({ id }: { id: string }) {
  const index = PRODUCTS.findIndex((p) => p.id === id)
  if (index < 0) return <NotFoundPage />
  const p = PRODUCTS[index]
  const open = p.status === 'available'
  return (
    <SimpleShell>
      <div className="pp-hero">
        <div className="pp-hero-copy">
          <p className="ld-mono ld-eyebrow">
            COMPONENT {index + 1} OF 5 · {p.role.toUpperCase()}
          </p>
          <h1 className="ld-hero-title pp-title">
            <Headline p={p} />
          </h1>
          <p className="ld-lead">{p.pitch}</p>
          <div className="ld-hero-actions">
            {p.cta && (
              <a className="ld-btn ld-btn-orange ld-btn-lg" href={p.cta.href}>
                {p.cta.label}
              </a>
            )}
            <a className="ld-btn ld-btn-lg pp-btn-book" href="/#demo">
              Book a walkthrough
            </a>
          </div>
        </div>
        <HeroVisual p={p} />
      </div>

      {p.id === 'skill-simulator' && (
        <section className="pp-section">
          <div className="pp-sims-head">
            <h2 className="ld-h2 ld-h2-sm">Learner Simulations</h2>
            <p className="ld-sub">
              A growing catalogue of simulations drawn from real jobs, across data analytics,
              incident response, business decisions, risk and compliance, and business cases. New
              ones are added regularly. Each is scored on the spot, and the learner’s work is saved
              to their record as evidence of the skill. Two of them:
            </p>
          </div>
          <div className="pp-sims">
            {SIMULATIONS.map((sim, i) => (
              <div key={sim.name} className={`pp-sim${i % 2 ? ' pp-sim-flip' : ''}`}>
                <div className="pp-sim-copy">
                  <h3 className="ld-h3">
                    Simulation {i + 1}: {sim.name}
                  </h3>
                  {sim.about.map((para) => (
                    <p key={para} className="ld-sub">
                      {para}
                    </p>
                  ))}
                </div>
                <div className="pp-sim-visual">
                  <ChatMock chat={sim.chat} delay={sim.delay} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {p.id === 'micro-learning' && (
        <Row
          visual={<SparkPathDemo />}
          eyebrow="See it at work"
          title="Help added where the gap showed"
        >
          <p className="ld-sub">
            A checkpoint showed a gap in filtering. A short video and targeted practice were added
            to the learner’s course path, right after it.
          </p>
          <p className="ld-sub">
            The learner finished both and went on to job ready. Instructors see each addition on the
            path and oversee the lessons that are generated.
          </p>
        </Row>
      )}

      {/* Screenshots follow the "See it at work" row, so their picture goes on the right. */}
      {p.shots?.map((s) => (
        <Row
          key={s.src}
          flip
          eyebrow={s.eyebrow}
          title={s.title}
          visual={
            s.pipeline ? (
              <ShotPipeline shot={s} />
            ) : (
              <div className="pp-frame">
                <img src={s.src} alt={s.alt} width={s.width} height={s.height} loading="lazy" />
              </div>
            )
          }
        >
          {s.body.map((para) => (
            <p key={para} className="ld-sub">
              {para}
            </p>
          ))}
        </Row>
      ))}

      {p.steps && (
        <section className="pp-section">
          <HowItWorks p={p} steps={p.steps} />
          {p.benefit && (
            <aside className="pp-learner">
              <span className="ld-mono ld-steel">FOR YOUR TEAM</span>
              <p>
                <span className="pp-callout-emoji" aria-hidden="true">
                  {p.benefit.emoji}
                </span>{' '}
                {p.benefit.title}
              </p>
              <span className="pp-benefit-body">{p.benefit.body}</span>
            </aside>
          )}
        </section>
      )}

      <section className="pp-section">
        <div className="pp-five-head">
          <h2 className="ld-h2 ld-h2-sm">One application, five components.</h2>
          <p className="ld-sub">
            Each one takes over a file or a tool the team keeps today and writes to the same learner
            record. <a href="/#team">See all five on the homepage →</a>
          </p>
        </div>
        <ol className="pp-five">
          {PRODUCTS.map((q, i) => (
            <li key={q.id} className={q.id === p.id ? 'pp-five-on' : undefined}>
              <a href={productPagePath(q)} aria-current={q.id === p.id ? 'page' : undefined}>
                <span className="ld-mono">
                  0{i + 1} · {q.role.toUpperCase()}
                </span>
                <strong>{q.name}</strong>
                <span className="pp-five-tag">{q.tagline}</span>
              </a>
            </li>
          ))}
        </ol>
        {!open && (
          <p className="ld-small ld-faint">
            {p.name} is in development. To hear when it is ready, email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        )}
      </section>
    </SimpleShell>
  )
}
