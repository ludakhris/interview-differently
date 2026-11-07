// DESIGN EXPERIMENT (issue #104): three sets of graphics for the landing page's scenario cards,
// behind ?graphics=a|b|c and the review pill (ReviewSwitch). A is the drawn dark panels, B is real
// screenshots of the product, C is light editorial mockups. Once the owner picks one, delete the
// others, the switch and the parameter handling, so only the chosen set ships. See "Design
// experiments" in CLAUDE.md.
import type { ReactNode } from 'react'
import { ReviewSwitch } from '@/components/ReviewSwitch'
import { IncidentPanel, InterviewPanel, SqlPanel } from './ScenePanels'

export type GraphicsKey = 'a' | 'b' | 'c'

export interface ScenarioGraphics {
  interview: ReactNode
  incident: ReactNode
  sql: ReactNode
}

export function graphicsFromUrl(): GraphicsKey {
  const g = new URLSearchParams(window.location.search).get('graphics')
  return g === 'b' || g === 'c' ? g : 'a'
}

export function GraphicsSwitch({ current }: { current: GraphicsKey }) {
  return (
    <ReviewSwitch
      param="graphics"
      label="Scenario graphics"
      current={current}
      options={[
        { key: 'a', label: 'A · Drawn panels' },
        { key: 'b', label: 'B · Real screens' },
        { key: 'c', label: 'C · Light editorial' },
      ]}
    />
  )
}

// ── B: real screens ─────────────────────────────────────────────────────────────

/** A plain browser window around a real screenshot of the product. */
function BrowserFrame({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div className="flex flex-col min-w-0 rounded-[14px] overflow-hidden border border-edge/15 bg-surface-alt shadow-[0_24px_48px_-28px_rgba(20,33,58,0.45)]">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-edge/10 bg-surface">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="w-2.5 h-2.5 rounded-full bg-ink/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-ink/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-ink/15" />
        </span>
        <span className="flex-1 min-w-0 mx-2 truncate rounded-md bg-surface-alt border border-edge/10 px-2.5 py-1 font-mono text-[11px] text-slate-mid">
          interviewdifferently.com{path}
        </span>
      </div>
      {children}
    </div>
  )
}

/** A video call: the interviewer full frame, you in the corner, live captions along the bottom. */
function VideoCall({ light = false }: { light?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden ${light ? 'rounded-[16px]' : ''} aspect-[16/10] bg-ink`}
    >
      <img
        src="/landing/interviewer.webp"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-[12px] text-white">
        <span className="w-2 h-2 rounded-full bg-[#ff5b60]" aria-hidden="true" />
        Recording 02:14
      </div>
      <img
        src="/landing/candidate.webp"
        alt=""
        className="absolute top-3 right-3 w-[22%] aspect-square object-cover rounded-[10px] ring-2 ring-white/80"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/45 to-transparent px-4 pt-10 pb-4">
        <p className="text-[12px] font-semibold text-white/80">Interviewer · Hiring manager</p>
        <p className="text-[15px] leading-snug text-white mt-0.5">
          Payments are failing and your manager is in a meeting. Walk me through your first five
          minutes.
        </p>
      </div>
    </div>
  )
}

const realScreens: ScenarioGraphics = {
  interview: (
    <BrowserFrame path="/interview/incident-response">
      <VideoCall />
    </BrowserFrame>
  ),
  incident: (
    <BrowserFrame path="/scenario/incident-response">
      <img
        src="/landing/real-incident.webp"
        alt=""
        className="block w-full flex-1 min-h-0 object-cover object-top"
        loading="lazy"
      />
    </BrowserFrame>
  ),
  sql: (
    <BrowserFrame path="/tools/sql">
      <img
        src="/landing/real-sql.webp"
        alt=""
        className="block w-full flex-1 min-h-0 object-cover object-top"
        loading="lazy"
      />
    </BrowserFrame>
  ),
}

// ── C: light editorial ──────────────────────────────────────────────────────────

const label = 'font-mono text-[11px] uppercase tracking-[0.14em] text-slate-mid'

function EditorialInterview() {
  return (
    <div className="grid gap-3">
      <VideoCall light />
      <div className="rounded-[14px] border border-edge/10 bg-surface p-4 grid gap-2 text-[14px] leading-snug">
        <p>
          <span className={`${label} mr-2`}>You</span>
          I&apos;d check whether the database spike is driving both failures before paging anyone.
        </p>
        <p>
          <span className={`${label} mr-2 text-primary`}>Follow-up</span>
          Who needs to hear from you in the next two minutes?
        </p>
      </div>
    </div>
  )
}

function EditorialIncident() {
  const points =
    '0,92 30,90 60,93 90,89 120,91 150,88 180,86 210,74 240,60 270,46 300,32 330,24 352,16'
  return (
    <div className="rounded-[14px] border border-edge/10 bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <p className={label}>Payment API error rate</p>
        <p className="font-display font-bold text-[22px] text-fg">14.2%</p>
      </div>
      <svg viewBox="0 0 360 110" className="w-full h-auto mt-3" aria-hidden="true">
        {[30, 60, 90].map((y) => (
          <line key={y} x1="0" x2="360" y1={y} y2={y} stroke="#14213a" strokeOpacity="0.08" />
        ))}
        <line x1="200" x2="200" y1="4" y2="104" stroke="#2563eb" strokeDasharray="3 4" />
        <text x="206" y="14" fontSize="10" fill="#2563eb" fontFamily="JetBrains Mono, monospace">
          incident start
        </text>
        <polyline
          points={points}
          fill="none"
          stroke="#14213a"
          strokeWidth="2.25"
          strokeLinejoin="round"
        />
        <circle cx="352" cy="16" r="4" fill="#2563eb" />
      </svg>
      <dl className="mt-4 divide-y divide-edge/10 text-[14px]">
        {[
          ['DB connections', '94%', 'bg-[#b45309]'],
          ['Auth latency', '+340 ms', 'bg-[#b91c1c]'],
          ['SLA breach in', '13 min', 'bg-[#b91c1c]'],
        ].map(([k, v, dot]) => (
          <div key={k} className="flex items-center justify-between py-2">
            <dt className="flex items-center gap-2 text-slate-light">
              <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
              {k}
            </dt>
            <dd className="font-mono text-fg">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function EditorialSql() {
  const kw = 'text-primary'
  return (
    <div className="rounded-[14px] border border-edge/10 bg-surface overflow-hidden">
      <div className="px-5 py-4">
        <p className="text-[14px] text-fg">
          <span className={`${label} mr-2`}>Priya</span>
          Which customers did the outage hit?
        </p>
        <pre className="mt-3 font-mono text-[13px] leading-[1.75] text-fg whitespace-pre-wrap">
          <span className={kw}>SELECT</span> customer_id, <span className={kw}>COUNT</span>(*){'\n'}
          <span className={kw}>FROM</span> payments{'\n'}
          <span className={kw}>WHERE</span> status = &apos;failed&apos;{'\n'}
          <span className={kw}>GROUP BY</span> customer_id
        </pre>
      </div>
      <table className="w-full font-mono text-[12.5px] border-t border-edge/10">
        <thead>
          <tr className="text-slate-mid text-left">
            <th className="font-normal px-5 py-2">customer_id</th>
            <th className="font-normal px-5 py-2 text-right">failed</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['C-10482', 7],
            ['C-20917', 5],
            ['C-31205', 4],
          ].map(([id, n]) => (
            <tr key={id} className="border-t border-edge/10">
              <td className="px-5 py-1.5 text-fg">{id}</td>
              <td className="px-5 py-1.5 text-right text-fg">{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-5 py-2.5 border-t border-edge/10 text-[12.5px] text-slate-light">
        1,284 customers · retries excluded
      </p>
    </div>
  )
}

const lightEditorial: ScenarioGraphics = {
  interview: <EditorialInterview />,
  incident: <EditorialIncident />,
  sql: <EditorialSql />,
}

const drawnPanels: ScenarioGraphics = {
  interview: <InterviewPanel />,
  incident: <IncidentPanel />,
  sql: <SqlPanel />,
}

export const GRAPHICS: Record<GraphicsKey, ScenarioGraphics> = {
  a: drawnPanels,
  b: realScreens,
  c: lightEditorial,
}
