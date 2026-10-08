/**
 * Three candidate graphics for "Every learner takes a different path. Same job-ready
 * outcome." Picked with ?pace=1|2|3 while under review; the losers get deleted.
 *
 * All three say the same thing: Maya and Theo cover the same six skills. Maya proved three
 * of them on day one, in the skills assessment (a simulation of the job), so she is job
 * ready at week 6; Theo learns all six and is job ready at week 10.
 */

const SKILLS = [
  'Password resets',
  'Caller verification',
  'DNS basics',
  'Ticket triage',
  'Escalation',
  'Phishing response',
]

interface Learner {
  name: string
  score: string
  weeks: number
  /** Index into SKILLS of what the day-one assessment already verified. */
  proved: number[]
  /** Week each skill is verified, in SKILLS order (1 = day-one assessment). */
  weekOf: number[]
}

const MAYA: Learner = {
  name: 'Maya',
  score: '80%',
  weeks: 6,
  proved: [0, 1, 2],
  weekOf: [1, 1, 1, 2, 4, 6],
}
const THEO: Learner = {
  name: 'Theo',
  score: '34%',
  weeks: 10,
  proved: [],
  weekOf: [2, 3, 5, 7, 8, 10],
}
const LEARNERS = [MAYA, THEO]
const LONGEST = Math.max(...LEARNERS.map((l) => l.weeks))

function Check() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        d="m5 12.5 4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Outcome() {
  return (
    <div className="c-pace-end">
      <span className="ld-mono">SAME OUTCOME</span>
      <strong>Job ready. Six verified skills.</strong>
      <span className="ld-small">On the record, in the funder’s terms.</span>
    </div>
  )
}

function Legend() {
  return (
    <p className="c-pace-legend">
      <span className="c-pace-key c-pace-key-proved">
        <i>
          <Check />
        </i>{' '}
        proved on day 1, in the skills assessment
      </span>
      <span className="c-pace-key c-pace-key-learned">
        <i /> learned in the loop
      </span>
      <span className="ld-faint">Maya and Theo are illustrative.</span>
    </p>
  )
}

/** Option 1: the earlier two-track visual, with proved skills as checked nodes at the start. */
export function PaceTracks() {
  return (
    <div className="c-pace c-pace-1">
      <div className="c-pace-rows">
        {LEARNERS.map((l) => {
          const proved = l.proved.length
          const learned = SKILLS.length - proved
          return (
            <div key={l.name} className="c-pace-row">
              <div className="c-pace-who">
                <strong>{l.name}</strong>
                <span className="ld-mono ld-faint">ASSESSMENT {l.score}</span>
              </div>
              <div className="c-pace-track">
                <div className="c-pace-line" style={{ width: `${(l.weeks / LONGEST) * 100}%` }}>
                  {SKILLS.map((s, i) => {
                    const isProved = l.proved.includes(i)
                    // Proved skills cluster at the start; learned ones spread over the rest.
                    const left = isProved
                      ? 3 + i * 5
                      : 3 + proved * 5 + ((i - proved + 1) / (learned + 1)) * (97 - proved * 5)
                    return (
                      <span
                        key={s}
                        className={isProved ? 'c-pace-node c-pace-node-proved' : 'c-pace-node'}
                        style={{ left: `${left}%` }}
                      >
                        <i>{isProved && <Check />}</i>
                        <em className={isProved ? 'c-pace-node-hidden' : undefined}>{s}</em>
                      </span>
                    )
                  })}
                  {proved > 0 && (
                    <span className="c-pace-proved-label" style={{ left: '3%' }}>
                      {proved} proved day 1
                    </span>
                  )}
                  <span className="c-pace-flag">
                    <Check /> Job ready @ week {l.weeks}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <Outcome />
      <Legend />
    </div>
  )
}

/** Option 2: a day-one column first (what the assessment proved), then the track for the rest. */
export function PaceColumns() {
  return (
    <div className="c-pace c-pace-2">
      <div className="c-pace-rows">
        <div className="c-pace-row c-pace-row-head" aria-hidden="true">
          <span />
          <span className="ld-mono ld-faint">DAY 1 · SKILLS ASSESSMENT</span>
          <span className="ld-mono ld-faint">THEN, IN THE LOOP</span>
        </div>
        {LEARNERS.map((l) => {
          const rest = SKILLS.filter((_, i) => !l.proved.includes(i))
          return (
            <div key={l.name} className="c-pace-row">
              <div className="c-pace-who">
                <strong>{l.name}</strong>
                <span className="ld-mono ld-faint">ASSESSMENT {l.score}</span>
              </div>
              <div className="c-pace-day1">
                {l.proved.length === 0 ? (
                  <span className="c-pace-day1-none">No skills proved yet. Full route.</span>
                ) : (
                  l.proved.map((i) => (
                    <span key={i} className="c-pace-chip">
                      <Check /> {SKILLS[i]}
                    </span>
                  ))
                )}
              </div>
              <div className="c-pace-track">
                <div className="c-pace-line" style={{ width: `${(l.weeks / LONGEST) * 100}%` }}>
                  {rest.map((s, i) => (
                    <span
                      key={s}
                      className="c-pace-node"
                      style={{ left: `${((i + 1) / (rest.length + 1)) * 100}%` }}
                    >
                      <i />
                      <em>{s}</em>
                    </span>
                  ))}
                  <span className="c-pace-flag">
                    <Check /> Job ready @ week {l.weeks}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <Outcome />
      <Legend />
    </div>
  )
}

/** Option 3: skills by week. One row per skill, a mark in the week each learner verified it. */
export function PaceGrid() {
  const weeks = Array.from({ length: LONGEST }, (_, i) => i + 1)
  return (
    <div className="c-pace c-pace-3">
      <div className="c-pace-grid" style={{ gridTemplateColumns: `180px repeat(${LONGEST}, 1fr)` }}>
        <span className="c-pace-grid-corner" />
        {weeks.map((w) => (
          <span key={w} className="ld-mono ld-faint c-pace-grid-week">
            W{w}
          </span>
        ))}
        {SKILLS.map((s, i) => (
          <div key={s} className="c-pace-grid-rowwrap">
            <span className="c-pace-grid-skill">{s}</span>
            {weeks.map((w) => (
              <span key={w} className="c-pace-grid-cell">
                {LEARNERS.map((l) =>
                  l.weekOf[i] === w ? (
                    <i
                      key={l.name}
                      className={`c-pace-mark c-pace-mark-${l.name.toLowerCase()}${l.proved.includes(i) ? ' c-pace-mark-proved' : ''}`}
                      title={`${l.name}: ${s}, week ${w}${l.proved.includes(i) ? ' (proved in the assessment)' : ''}`}
                    >
                      {l.proved.includes(i) && <Check />}
                    </i>
                  ) : null
                )}
              </span>
            ))}
          </div>
        ))}
        <div className="c-pace-grid-rowwrap c-pace-grid-ready">
          <span className="c-pace-grid-skill">Job ready</span>
          {weeks.map((w) => (
            <span key={w} className="c-pace-grid-cell">
              {LEARNERS.filter((l) => l.weeks === w).map((l) => (
                <b key={l.name} className={`c-pace-ready c-pace-mark-${l.name.toLowerCase()}`}>
                  {l.name}
                </b>
              ))}
            </span>
          ))}
        </div>
      </div>
      <Outcome />
      <p className="c-pace-legend">
        <span className="c-pace-key">
          <i className="c-pace-mark c-pace-mark-maya" /> Maya · assessment 80%
        </span>
        <span className="c-pace-key">
          <i className="c-pace-mark c-pace-mark-theo" /> Theo · assessment 34%
        </span>
        <span className="c-pace-key">
          <i className="c-pace-mark c-pace-mark-maya c-pace-mark-proved">
            <Check />
          </i>{' '}
          proved on day 1, in the skills assessment
        </span>
        <span className="ld-faint">Maya and Theo are illustrative.</span>
      </p>
    </div>
  )
}

/** Which option to show while they are under review. */
export function PaceVisual() {
  const pick = new URLSearchParams(window.location.search).get('pace')
  if (pick === '2') return <PaceColumns />
  if (pick === '3') return <PaceGrid />
  return <PaceTracks />
}
