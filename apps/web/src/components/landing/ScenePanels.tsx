/**
 * The example simulation screens on the landing page: a live AI interview on video, an incident
 * error-rate chart and a live SQL question. The scenario content is illustrative. The two
 * portraits are Unsplash photos (Unsplash License, free for commercial use). Standalone only, so
 * the brand values are written directly.
 */
import type { ReactNode } from 'react'

const mono = 'font-mono uppercase tracking-[0.14em]'

const label = 'font-mono text-[11px] uppercase tracking-[0.14em] text-slate-mid'

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
function VideoCall() {
  return (
    <div className="relative overflow-hidden aspect-[16/10] bg-ink">
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

/** The live AI interview, shown as a video call in a browser window. */
export function InterviewPanel() {
  return (
    <BrowserFrame path="/interview/incident-response">
      <VideoCall />
    </BrowserFrame>
  )
}

/** The outage: payment API error rate climbing past the incident start, with the signals beside it. */
export function IncidentPanel() {
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

export function SqlPanel({ className = '' }: { className?: string }) {
  const kw = 'text-[#9fc2ff]'
  return (
    <div
      className={`rounded-[16px] bg-[#0f1a30] text-[#e8eaee] shadow-[0_30px_60px_-24px_rgba(20,33,58,0.6)] ${className}`}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#26365a]">
        <span className={`${mono} text-[11px] text-[#9aa6bd]`}>Data analytics</span>
        <span className={`${mono} text-[10px] text-[#e8eaee] bg-[#1b2742] px-2 py-1 rounded-md`}>
          Live SQL
        </span>
      </div>
      <div className="px-5 py-4">
        <p className="text-[14px] leading-snug mb-3">
          <b className="font-semibold text-white">AI interviewer:</b> Which customers did the outage
          hit?
        </p>
        <pre className="font-mono text-[13px] leading-[1.7] whitespace-pre-wrap">
          <span className={kw}>SELECT</span> customer_id, <span className={kw}>COUNT</span>(*){'\n'}
          <span className={kw}>FROM</span> payments{'\n'}
          <span className={kw}>WHERE</span> status ={' '}
          <span className="text-[#ffc56b]">'failed'</span>
          {'\n'}
          <span className={kw}>GROUP BY</span> customer_id
        </pre>
        <table className="w-full mt-3 font-mono text-[12px] text-[#c9d1df] border-t border-[#26365a]">
          <thead>
            <tr className="text-[#9aa6bd] text-left">
              <th className="font-normal py-1.5">customer_id</th>
              <th className="font-normal py-1.5 text-right">failed</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['C-10482', 7],
              ['C-20917', 5],
              ['C-31205', 4],
            ].map(([id, n]) => (
              <tr key={id} className="border-t border-[#1b2742]">
                <td className="py-1">{id}</td>
                <td className="py-1 text-right text-[#ffc56b]">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="font-mono text-[12px] text-[#8fe0b0] mt-2">
          ✓ 1,284 customers · retries excluded
        </p>
      </div>
    </div>
  )
}

/** A live AI interview: the interviewer on video asks, the learner answers out loud. */
