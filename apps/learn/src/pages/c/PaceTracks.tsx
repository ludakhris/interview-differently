/**
 * Two learners, the same six skills, different weeks. Maya proved three on day one in the
 * skills assessment and one more on day three in a simulation, so she is job ready at week
 * 6; Theo learns all six and is job ready at week 10. Illustrative.
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
  /** Skill index to the day it was proved without a lesson; absent means learned in the loop. */
  proved: Record<number, number>
  /** Where each skill sits along the track, as a percentage of its length. */
  at: number[]
}

const LEARNERS: Learner[] = [
  {
    name: 'Maya',
    score: '80%',
    weeks: 6,
    proved: { 0: 1, 1: 1, 2: 1, 3: 3 },
    at: [8, 24, 40, 56, 72, 88],
  },
  {
    name: 'Theo',
    score: '34%',
    weeks: 10,
    proved: {},
    at: [10, 26, 42, 58, 74, 90],
  },
]
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

export function PaceTracks() {
  return (
    <div className="c-pace">
      <div className="c-pace-rows">
        {LEARNERS.map((l) => (
          <div key={l.name} className="c-pace-row">
            <div className="c-pace-who">
              <strong>{l.name}</strong>
              <span className="ld-mono ld-faint">ASSESSMENT {l.score}</span>
            </div>
            <div className="c-pace-track">
              <div className="c-pace-line" style={{ width: `${(l.weeks / LONGEST) * 100}%` }}>
                {SKILLS.map((s, i) => {
                  const day = l.proved[i]
                  return (
                    <span
                      key={s}
                      className={day ? 'c-pace-node c-pace-node-proved' : 'c-pace-node'}
                      style={{ left: `${l.at[i]}%` }}
                    >
                      <i>{day && <Check />}</i>
                      <em>
                        {s}
                        {day && <b>proved day {day}</b>}
                      </em>
                    </span>
                  )
                })}
                <span className="c-pace-flag">
                  <Check /> Job ready @ week {l.weeks}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="c-pace-end">
        <span className="ld-mono">SAME OUTCOME</span>
        <strong>Job ready. Six verified skills.</strong>
        <span className="ld-small">On the record, in the funder’s terms.</span>
      </div>
      <p className="c-pace-legend">
        <span className="c-pace-key c-pace-key-proved">
          <i>
            <Check />
          </i>{' '}
          proved without a lesson: day 1 in the skills assessment, day 3 in a simulation
        </span>
        <span className="c-pace-key">
          <i /> learned in the loop
        </span>
        <span className="ld-faint">Maya and Theo are illustrative.</span>
      </p>
    </div>
  )
}
