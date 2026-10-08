/**
 * Candidate layouts for the five measures under "Report once". Picked with
 * ?measures=1|2|3 while under review; the default is the ruled list in CHomePage. The
 * losers get deleted once one is chosen.
 */
import { MEASURES, MEASURES_MORE } from './cContent'

const ALL = [...MEASURES, ...MEASURES_MORE] as { name: string; how: string; soon?: string }[]

/** When each measure is captured, for the timeline option. */
const WHEN: Record<string, string> = {
  'Enrollment Target Fulfillment': 'Day 1 · on enrollment',
  'Measurable Skill Gains': 'Every scored exercise',
  'Program Completion Rate': 'Last module',
  'Credential Attainment Rate': 'Program end',
  'Initial Job Placement': 'After completion',
}
const ORDER = [
  'Enrollment Target Fulfillment',
  'Measurable Skill Gains',
  'Program Completion Rate',
  'Credential Attainment Rate',
  'Initial Job Placement',
]

/** Fictional cohort for the export option. */
const SAMPLE: Record<string, { n: string; rate: string }> = {
  'Enrollment Target Fulfillment': { n: '112 of 100 contracted', rate: '112%' },
  'Measurable Skill Gains': { n: '84 of 112', rate: '75%' },
  'Program Completion Rate': { n: '96 of 112', rate: '86%' },
  'Credential Attainment Rate': { n: '71 of 112', rate: '63%' },
  'Initial Job Placement': { n: 'with Talent Match', rate: '—' },
}

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

function Soon({ soon }: { soon?: string }) {
  return soon ? <span className="ld-piece-status">{soon}</span> : null
}

/** Option 1: a checklist, two columns. */
export function MeasureChecklist() {
  return (
    <div className="c-mo c-mo-1">
      <h3 className="c-measure-heading">Automatically tracked and reported on</h3>
      <ul className="c-mo-check">
        {ALL.map((m) => (
          <li key={m.name}>
            <i>
              <Check />
            </i>
            <div>
              <strong>
                {m.name} <Soon soon={m.soon} />
              </strong>
              <span className="c-measure-how">{m.how}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="ld-small ld-faint">
        The first three are the measures every program is held to; the last two are what the grant
        asks for during an audit.
      </p>
    </div>
  )
}

/** Option 2: when each measure is captured, along the cohort. */
export function MeasureTimeline() {
  const items = ORDER.map((n) => ALL.find((m) => m.name === n)!)
  return (
    <div className="c-mo c-mo-2">
      <h3 className="c-measure-heading">Tracked as the cohort runs, not reconstructed after</h3>
      <ol className="c-mo-time">
        {items.map((m, i) => (
          <li key={m.name} className={m.soon ? 'c-mo-time-soon' : undefined}>
            <span className="c-mo-time-dot" aria-hidden="true">
              {i + 1}
            </span>
            <span className="ld-mono ld-eyebrow">{WHEN[m.name].toUpperCase()}</span>
            <strong>
              {m.name} <Soon soon={m.soon} />
            </strong>
            <span className="c-measure-how">{m.how}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Option 3: the export itself, as a sample report. */
export function MeasureExport() {
  const items = ORDER.map((n) => ALL.find((m) => m.name === n)!)
  return (
    <div className="c-mo c-mo-3">
      <h3 className="c-measure-heading">The report you pull, not the one you build</h3>
      <figure className="c-mo-export">
        <div className="c-mo-export-head">
          <span className="ld-mono">cohort-outcomes · IT Support · Spring cohort</span>
          <span className="ld-mono c-mo-export-stamp">SAMPLE · FICTIONAL COHORT</span>
        </div>
        <table>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col">How it’s tracked</th>
              <th scope="col" className="c-mo-num">
                Count
              </th>
              <th scope="col" className="c-mo-num">
                Rate
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.name} className={m.soon ? 'c-mo-row-soon' : undefined}>
                <th scope="row">
                  {m.name} <Soon soon={m.soon} />
                </th>
                <td className="c-measure-how">{m.how}</td>
                <td className="c-mo-num">{SAMPLE[m.name].n}</td>
                <td className="c-mo-num c-mo-rate">{SAMPLE[m.name].rate}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <figcaption className="ld-small ld-faint">
          Exported as CSV, any day of the grant. Numbers are illustrative.
        </figcaption>
      </figure>
    </div>
  )
}

/** Which option to show while they are under review; null means the default list. */
export function MeasuresVisual() {
  const pick = new URLSearchParams(window.location.search).get('measures')
  if (pick === '1') return <MeasureChecklist />
  if (pick === '2') return <MeasureTimeline />
  if (pick === '3') return <MeasureExport />
  return null
}
