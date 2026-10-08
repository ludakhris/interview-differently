/**
 * Two learners, the same six skills, different weeks. Maya proved three on day one in the
 * skills assessment and one more on day three in a simulation, so she is job ready at week
 * 6; Theo learns all six and is job ready at week 10. Illustrative.
 */

interface Node {
  label: string
  /** When it happened; shown under the label. */
  when?: string
  /** Proved without a lesson (checked node); otherwise learned in the loop. */
  proved?: boolean
  /** Position along the track, as a percentage of its length. */
  at: number
}

interface Learner {
  name: string
  score: string
  weeks: number
  nodes: Node[]
}

const LEARNERS: Learner[] = [
  {
    name: 'Maya',
    score: '80%',
    weeks: 6,
    nodes: [
      { label: 'Password resets · Caller verification', when: 'proved day 1', proved: true, at: 6 },
      { label: 'DNS basics', when: 'day 2', at: 30 },
      { label: 'Ticket triage', when: 'proved day 3', proved: true, at: 52 },
      { label: 'Escalation', at: 72 },
      { label: 'Phishing response', at: 90 },
    ],
  },
  {
    name: 'Theo',
    score: '34%',
    weeks: 10,
    nodes: [
      { label: 'Password resets', at: 10 },
      { label: 'Caller verification', at: 26 },
      { label: 'DNS basics', at: 42 },
      { label: 'Ticket triage', at: 58 },
      { label: 'Escalation', at: 74 },
      { label: 'Phishing response', at: 90 },
    ],
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
                {l.nodes.map((n, i) => (
                  <span
                    key={n.label}
                    className={[
                      'c-pace-node',
                      n.proved ? 'c-pace-node-proved' : '',
                      i === 0 ? 'c-pace-node-first' : '',
                    ].join(' ')}
                    style={{ left: `${n.at}%` }}
                  >
                    <i>{n.proved && <Check />}</i>
                    <em>
                      {n.label}
                      {n.when && <b>{n.when}</b>}
                    </em>
                  </span>
                ))}
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
