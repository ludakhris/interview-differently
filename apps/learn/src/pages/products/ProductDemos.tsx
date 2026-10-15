import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { BoardPathItem } from '@id/types'
import { PathTimeline } from '../../dashboard/adaptive/PathTimeline'
import { diffPaths, type PathSnapshot } from '../../dashboard/adaptive/planDiff'
import { PRODUCTS, type Product, type ProductShot } from '../../products'
import './product-demos.css'

/**
 * The pictures on the product pages, drawn with made-up data rather than screenshots:
 * three learners with a lesson each, one learner's course path with help added for a gap, the steps a lesson goes
 * through before it is ready, the LMS hub, a hero card for the other pages and two simulation chats. Each plays one step at a
 * time and loops; with reduced motion each shows its finished state at once.
 */

const STEP_MS = 1600
const HOLD_STEPS = 3

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** How many of n steps are showing: one more every stepMs, held at n for a few steps, then from 1 again. */
export function useReveal(
  n: number,
  stepMs = STEP_MS,
  delay = 0
): { shown: number; still: boolean } {
  const [still] = useState(reducedMotion)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (still) return
    let timer: ReturnType<typeof setInterval> | undefined
    const start = setTimeout(() => {
      timer = setInterval(() => setTick((t) => (t + 1) % (n + HOLD_STEPS)), stepMs)
    }, delay)
    return () => {
      clearTimeout(start)
      clearInterval(timer)
    }
  }, [still, n, stepMs, delay])
  return { shown: still ? n : Math.min(tick + 1, n), still }
}

const on = (yes: boolean) => (yes ? ' is-on' : '')

/* Spark hero: three learners, each with a short lesson on the one skill they need. Still, in plain words. */

// `gap`: what the learner struggled with, in plain words; the lesson below it is made for that.
const HERO_LESSONS = [
  {
    who: 'Maya',
    gap: 'pulled the wrong rows for a report',
    title: 'Picking out the right rows',
    minutes: 2,
  },
  {
    who: 'Theo',
    gap: 'couldn’t total sales by region',
    title: 'Adding up totals by group',
    minutes: 2,
  },
  {
    who: 'Ana',
    gap: 'got stuck linking customers to orders',
    title: 'Matching customers to their orders',
    minutes: 1,
  },
]

export function SparkHeroDemo() {
  return (
    <div
      className="pd-learners"
      role="img"
      aria-label="Illustration: three learners, Maya, Theo and Ana, each stuck on something different, each with a short lesson made for it."
    >
      <p className="ld-mono pd-learners-tag">THREE LEARNERS, THREE UNIQUE LESSONS</p>
      <ul className="pd-learners-list">
        {HERO_LESSONS.map((l) => (
          <li key={l.who}>
            <span className="pd-avatar" aria-hidden="true">
              {l.who[0]}
            </span>
            <span className="pd-learner-copy">
              <small>
                {l.who} {l.gap}
              </small>
              <strong>{l.title}</strong>
            </span>
            <span className="pd-learner-len">▶ {l.minutes} min</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* Spark "one gap, one lesson": the steps a lesson goes through tick along a rail, ending on the lesson player. */

export function ShotPipeline({ shot }: { shot: ProductShot }) {
  const steps = shot.pipeline ?? []
  const { shown } = useReveal(steps.length, 1300)
  const ready = shown >= steps.length
  return (
    <div className="pd-pipe">
      <ol className="pd-pipe-rail" aria-label="How this lesson was made">
        {steps.map((s, i) => (
          <li
            key={s.label}
            className={`pd-pipe-step${on(i < shown)}${i === shown - 1 && !ready ? ' is-now' : ''}`}
          >
            <span className="pd-pipe-node" aria-hidden="true">
              {i < shown ? '✓' : i + 1}
            </span>
            <span className="pd-pipe-label">
              {s.label}
              {s.optional && <small className="pd-pipe-optional">optional</small>}
            </span>
          </li>
        ))}
      </ol>
      <div className={`pp-frame pd-pipe-frame${on(ready)}`}>
        <img src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} loading="lazy" />
      </div>
    </div>
  )
}

/* Spark "see it at work": the real course-path timeline, played step by step. */

const item = (
  itemId: string,
  title: string,
  type: string,
  minutes: number,
  state: BoardPathItem['state'] = 'done',
  gap?: number
): BoardPathItem => ({
  itemId,
  moduleTitle: 'Data requests',
  title,
  type,
  minutes,
  skill: gap === undefined ? null : 'filtering',
  state,
  reason: null,
  at: null,
  evidence: gap === undefined ? null : { pct: gap, n: 4, source: 'Checkpoint: filtering requests' },
})

/** The course, in order, before anything is added. */
const COURSE: BoardPathItem[] = [
  item('diag', 'Diagnostic', 'tool', 15),
  item('l1', 'Lesson: finding the right rows with WHERE', 'lesson', 12),
  item('c1', 'Checkpoint: filtering requests', 'tool', 10),
  item('l2', 'Lesson: counting per group with GROUP BY', 'lesson', 12),
  item('c2', 'Checkpoint: grouping requests', 'tool', 10),
  item('l3', 'Lesson: joining customers to orders', 'lesson', 12),
  item('c3', 'Checkpoint: joining requests', 'tool', 10),
]
/** Added after the filtering checkpoint showed the gap. */
const VIDEO = item(
  'v1',
  'Finding Missing Values: IS NULL, Not = NULL',
  'spark_lesson',
  2,
  'added',
  50
)
const PRACTICE = item('p1', 'Targeted practice: filtering', 'tool', 10, 'added')
const AFTER_CHECKPOINT = 3

type Added = BoardPathItem['state'] | null
/** Each step of the story: course items done, the video's and practice's state, and a note on what happened. */
const FRAMES: { done: number; video: Added; practice: Added; note?: 'gap' | 'added' }[] = [
  { done: 0, video: null, practice: null },
  { done: 1, video: null, practice: null },
  { done: 2, video: null, practice: null },
  { done: 3, video: null, practice: null, note: 'gap' },
  { done: 3, video: 'added', practice: 'added', note: 'added' },
  { done: 3, video: 'added_done', practice: 'added', note: 'added' },
  { done: 3, video: 'added_done', practice: 'added_done', note: 'added' },
  { done: 4, video: 'added_done', practice: 'added_done' },
  { done: 5, video: 'added_done', practice: 'added_done' },
  { done: 6, video: 'added_done', practice: 'added_done' },
  { done: 7, video: 'added_done', practice: 'added_done' },
]
const LAST = FRAMES.length - 1

function pathAt(f: number): BoardPathItem[] {
  const { done, video, practice } = FRAMES[f]
  const course = COURSE.map(
    (p, i) => ({ ...p, state: i < done ? 'done' : 'todo' }) as BoardPathItem
  )
  const added = [
    ...(video ? [{ ...VIDEO, state: video }] : []),
    ...(practice ? [{ ...PRACTICE, state: practice }] : []),
  ]
  return [...course.slice(0, AFTER_CHECKPOINT), ...added, ...course.slice(AFTER_CHECKPOINT)]
}
const snapshot = (path: BoardPathItem[]): PathSnapshot =>
  Object.fromEntries(path.map((p) => [p.itemId, p.state]))

const PATH_PROPS = { color: '#4aaee8', goals: { filtering: 'Pull the right customers and orders' } }

export function SparkPathDemo() {
  const { shown, still } = useReveal(FRAMES.length, 1300)
  const f = shown - 1
  const path = pathAt(f)
  const anim = still || f === 0 ? undefined : diffPaths(snapshot(pathAt(f - 1)), snapshot(path))
  const ready = f === LAST
  const note = FRAMES[f].note
  const minutesLeft = path.reduce(
    (m, p) => (p.state === 'done' || p.state === 'added_done' ? m : m + p.minutes),
    0
  )
  return (
    <div className="pd-path">
      <p className="ld-mono pd-path-tag">ONE COURSE PATH, ADJUSTED AS THEY LEARN</p>
      <p className={`pd-path-note${note ? ` is-${note}` : ''}`} aria-hidden="true">
        {note === 'gap'
          ? '⚑ Checkpoint: filtering at 50%. Gap found.'
          : note === 'added'
            ? '+ Video and practice added for the gap'
            : ''}
      </p>
      <div className="pd-path-stage">
        {/* The finished path, unseen, holds the card at its full height while the live one plays. */}
        {!still && (
          <div className="pd-path-ghost" aria-hidden="true">
            <PathTimeline
              learner={{ path: pathAt(LAST), ready: true, minutesLeft: 0 }}
              anim={undefined}
              {...PATH_PROPS}
            />
          </div>
        )}
        <PathTimeline learner={{ path, ready, minutesLeft }} anim={anim} {...PATH_PROPS} />
      </div>
    </div>
  )
}

/* LMS hero: the LMS in the middle, the other four around it, and dots running along the spokes into the
   learner record. With reduced motion the dots are hidden and the picture is still. */

/** Where each of the four sits around the hub, in percent of the drawing's width and height. */
const SPOKES = [
  { x: 22, y: 15 },
  { x: 78, y: 15 },
  { x: 22, y: 85 },
  { x: 78, y: 85 },
]

export function LmsHubDemo() {
  const [hub, ...rest] = PRODUCTS
  const around = rest.slice(0, SPOKES.length)
  const soon = around.filter((q) => q.status === 'soon').map((q) => q.name)
  const label = `Illustration: ${hub.name} in the middle, joined to ${around
    .map((q) => q.name)
    .join(', ')}. Each one writes to the same learner record${
    soon.length ? `; ${soon.join(' and ')} are coming soon` : ''
  }.`
  return (
    <div className="pd-hub" role="img" aria-label={label}>
      <p className="ld-mono pd-card-tag">FIVE COMPONENTS, ONE LEARNER RECORD</p>
      <div className="pd-hub-stage">
        <svg
          className="pd-hub-lines"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {SPOKES.map((s, i) => (
            <line key={i} x1={50} y1={50} x2={s.x} y2={s.y} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {SPOKES.map((s, i) => (
          <span
            key={i}
            className="pd-hub-dot"
            aria-hidden="true"
            style={
              {
                '--x': `${s.x}%`,
                '--y': `${s.y}%`,
                animationDelay: `${i * 0.6}s`,
              } as CSSProperties
            }
          />
        ))}
        <div className="pd-hub-centre">
          <span className="pd-hub-emoji" aria-hidden="true">
            {hub.emoji}
          </span>
          <strong>{hub.name}</strong>
          <small className="ld-mono">LEARNER RECORD</small>
        </div>
        {around.map((q, i) => (
          <div
            key={q.id}
            className={`pd-hub-node${q.status === 'soon' ? ' is-soon' : ''}`}
            style={{ left: `${SPOKES[i].x}%`, top: `${SPOKES[i].y}%` }}
          >
            <span className="pd-hub-emoji" aria-hidden="true">
              {q.emoji}
            </span>
            <span className="pd-hub-name">
              <strong>{q.name}</strong>
              <small className="ld-mono">
                {q.status === 'soon' ? 'COMING SOON' : q.role.toUpperCase()}
              </small>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* Heroes for the Skill Simulator, Job Board Match and Talent Match pages: one card each, in plain words, the
   lines ticking in one at a time and the footer showing once they are all in. */

interface HeroCard {
  tag: string
  /** Read in place of the card by screen readers. */
  description: string
  who: { initial: string; kicker: string; name: string }
  total: string
  facts: { term: string; value: string }[]
  /** A line is a tick unless `gap`, which marks it as the gap. */
  lines: { label: string; result: string; gap?: boolean }[]
  footer: string
}

export const HERO_CARDS: Partial<Record<Product['id'], HeroCard>> = {
  'skill-simulator': {
    tag: 'SIMULATION SCORECARD',
    description:
      'Illustration: Theo’s scorecard from the simulation “Weekly sales report for a store manager”, using the skill of summarizing data. Three criteria are met and one, checking for missing data, is a gap. The evidence is saved to the learner’s record.',
    who: { initial: 'T', kicker: 'LEARNER', name: 'Theo' },
    total: '3 of 4 met · 1 gap',
    facts: [
      { term: 'SCENARIO', value: 'Weekly sales report for a store manager' },
      { term: 'SKILL USED', value: 'Summarizing data' },
    ],
    lines: [
      { label: 'Found the right numbers', result: 'Met' },
      { label: 'Explained the result in plain words', result: 'Met' },
      { label: 'Answered the manager’s follow-up', result: 'Met' },
      { label: 'Checked for missing data', result: 'Gap', gap: true },
    ],
    footer: 'Evidence saved to the learner’s record',
  },
  'job-board-match': {
    tag: 'ROLE MATCH',
    description:
      'Illustration: Maya matched to a junior data analyst role at Tidewater Supply. Three of the four skills it asks for are proven in simulations; building dashboards is the gap, with a lesson that covers it.',
    who: { initial: 'M', kicker: 'LEARNER', name: 'Maya' },
    total: '3 of 4 skills proven',
    facts: [
      { term: 'ROLE', value: 'Junior data analyst' },
      { term: 'EMPLOYER', value: 'Tidewater Supply' },
    ],
    lines: [
      { label: 'Summarizing data', result: 'Proven' },
      { label: 'Finding the right numbers', result: 'Proven' },
      { label: 'Writing clear reports', result: 'Proven' },
      { label: 'Building dashboards', result: 'Lesson added', gap: true },
    ],
    footer: 'Matched on skills she has shown, not words on a resume',
  },
  'talent-match': {
    tag: 'VERIFIED TALENT PROFILE',
    description:
      'Illustration: Ana’s profile as an employer sees it. Data analytics track, completed with a certificate. Three skills verified, each backed by work from a simulation, and she is ready to start.',
    who: { initial: 'A', kicker: 'CANDIDATE', name: 'Ana' },
    total: 'Ready to start',
    facts: [
      { term: 'TRACK', value: 'Data analytics' },
      { term: 'PROGRAM', value: 'Completed, with certificate' },
    ],
    lines: [
      { label: 'Answering data requests', result: 'Verified' },
      { label: 'Handling an outage', result: 'Verified' },
      { label: 'Explaining results to a manager', result: 'Verified' },
    ],
    footer: 'Each skill backed by real work from a simulation',
  },
}

export function HeroCardDemo({ card }: { card: HeroCard }) {
  const { shown } = useReveal(card.lines.length + 1, 1300)
  const done = shown > card.lines.length
  return (
    <div className="pd-card" role="img" aria-label={card.description}>
      <p className="ld-mono pd-card-tag">{card.tag}</p>
      <div className="pd-card-who">
        <span className="pd-avatar" aria-hidden="true">
          {card.who.initial}
        </span>
        <span className="pd-learner-copy">
          <small className="ld-mono">{card.who.kicker}</small>
          <strong>{card.who.name}</strong>
        </span>
        <span className={`pd-card-total${on(done)}`}>{card.total}</span>
      </div>
      <dl className="pd-card-facts">
        {card.facts.map((f) => (
          <div key={f.term}>
            <dt className="ld-mono">{f.term}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
      <ul className="pd-card-lines">
        {card.lines.map((l, i) => (
          <li key={l.label} className={`${l.gap ? 'is-gap' : 'is-met'}${on(i < shown)}`}>
            <span className="pd-card-mark" aria-hidden="true">
              {l.gap ? '!' : '✓'}
            </span>
            <span>{l.label}</span>
            <span className="pd-card-result">{l.result}</span>
          </li>
        ))}
      </ul>
      <p className={`pd-card-footer${on(done)}`}>{card.footer}</p>
    </div>
  )
}

/* Skill Simulator: two team chats. */

interface ChatLine {
  who: string
  role?: string
  /** The learner's own messages sit on the right; feedback is the simulation's verdict. */
  kind: 'alert' | 'colleague' | 'agent' | 'learner' | 'feedback'
  body: ReactNode
}

interface Chat {
  channel: string
  /** Read in place of the animation by screen readers. */
  description: string
  lines: ChatLine[]
}

const LEARNER = 'You (learner)'

const QUERY = `SELECT order_id, customer, total
FROM orders
WHERE total > 500
  AND order_date >= '2026-09-01'`

const DATA_REQUEST: Chat = {
  channel: '#data-requests · Tidewater Supply',
  description:
    'Simulation mockup, a data request: Priya from Finance asks for last month’s orders over $500. The learner answers with a SQL query and a result table of three orders. Priya confirms it matches the ledger, and the answer is marked correct.',
  lines: [
    {
      who: 'Priya',
      role: 'Finance',
      kind: 'colleague',
      body: 'Can you pull last month’s orders over $500? I need them for the close.',
    },
    {
      who: LEARNER,
      kind: 'learner',
      body: (
        <>
          <code className="pd-code">{QUERY}</code>
          <table className="pd-table">
            <tbody>
              <tr>
                <td>10482</td>
                <td>Ridge Cafe</td>
                <td>$640.00</td>
              </tr>
              <tr>
                <td>10495</td>
                <td>Alder Dental</td>
                <td>$1,215.50</td>
              </tr>
              <tr>
                <td>10511</td>
                <td>Kim &amp; Ortiz</td>
                <td>$508.20</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
    },
    { who: 'Priya', role: 'Finance', kind: 'colleague', body: 'That matches the ledger. Thanks!' },
    { who: 'Scored', kind: 'feedback', body: '✓ Correct · filtering with WHERE' },
  ],
}

const INCIDENT: Chat = {
  channel: '#incident-checkout · Harborline Outfitters',
  description:
    'Simulation mockup, an on-call incident: an alert shows the checkout error rate at 7.8 percent, against a normal 0.4. Jordan, the SRE lead, asks what to do. An AI agent surfaces the deploy that went out two minutes before the errors began, payment timeouts in the logs, and a change that cut the payment timeout from 10 seconds to 2. The learner checks the error rate by minute, names the bad deploy, rolls it back and posts a status update for customers. The feedback scores the decision on the spot.',
  lines: [
    {
      who: 'Monitor',
      role: 'Alert',
      kind: 'alert',
      body: (
        <>
          Checkout error rate <b>7.8%</b> (normal 0.4%) since 14:06
        </>
      ),
    },
    {
      who: 'Jordan',
      role: 'SRE lead',
      kind: 'colleague',
      body: 'About 1 in 12 checkouts are failing. You’re on call: what do we do?',
    },
    {
      who: 'Agent',
      role: 'AI assistant',
      kind: 'agent',
      body: (
        <>
          checkout-api <b>v2.14.0</b> deployed at 14:04. Logs since then:
          <code className="pd-code">PaymentClient: timeout after 2000ms ×1,912</code>
          The diff changed the payment timeout from 10000ms to 2000ms.
        </>
      ),
    },
    {
      who: LEARNER,
      kind: 'learner',
      body: (
        <>
          <small className="ld-mono pd-table-label">ERROR RATE BY DEPLOY</small>
          <table className="pd-table">
            <tbody>
              <tr>
                <td>14:00</td>
                <td>v2.13.2</td>
                <td>0.4%</td>
              </tr>
              <tr>
                <td>14:05</td>
                <td>v2.14.0</td>
                <td>0.6%</td>
              </tr>
              <tr>
                <td>14:10</td>
                <td>v2.14.0</td>
                <td>7.8%</td>
              </tr>
            </tbody>
          </table>
          It started with v2.14.0 and its 2-second payment timeout. Rolling back to v2.13.2 now, and
          posting on the status page that some checkouts failed from 14:06 and to try again.
        </>
      ),
    },
    {
      who: 'Scored',
      kind: 'feedback',
      body: '✓ Right call: rolled back first, then told customers. Tip: say when the next update comes.',
    },
  ],
}

/** A team chat that plays one message at a time and loops; with reduced motion it shows every message at once. */
export function ChatMock({ chat, delay = 0 }: { chat: Chat; delay?: number }) {
  const { shown } = useReveal(chat.lines.length, STEP_MS, delay)
  return (
    <div className="pd-chat" role="img" aria-label={chat.description}>
      <div className="pd-chat-bar">
        <span className="pd-dots" aria-hidden="true" />
        <span className="ld-mono">{chat.channel}</span>
      </div>
      <ol className="pd-chat-lines">
        {chat.lines.map((line, i) => (
          <li key={i} className={`pd-msg is-${line.kind}${on(i < shown)}`}>
            {line.kind !== 'feedback' && (
              <span className="pd-who">
                {line.who}
                {line.role && <small> · {line.role}</small>}
              </span>
            )}
            <div className="pd-body">{line.body}</div>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** The two simulations shown on the Skill Simulator page, each with a few plain sentences for institutions. */
export const SIMULATIONS: { name: string; about: string[]; chat: Chat; delay: number }[] = [
  {
    name: 'Data request',
    about: [
      'A colleague in Finance needs last month’s large orders for the month-end close, and asks in the team chat, the way a request arrives at work.',
      'The learner answers as an analyst would: they pull the data with SQL, check it and share the result.',
      'They are scored on whether the numbers are right and whether they understood what was asked.',
    ],
    chat: DATA_REQUEST,
    delay: 0,
  },
  {
    name: 'On-call incident',
    about: [
      'Checkout starts failing at an online store, and the learner is the one on call. An AI assistant brings up the latest changes and the error logs.',
      'The learner has to find the cause, decide what to do and tell customers, which exercises incident response under pressure.',
      'They are scored on the decision, on doing things in the right order, and on how clearly they keep people informed.',
    ],
    chat: INCIDENT,
    delay: STEP_MS * 2,
  },
]
