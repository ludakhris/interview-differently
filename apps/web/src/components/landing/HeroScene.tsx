/**
 * The landing hero scene: three simulation panels floating on paper (an incident console, a live
 * SQL question from the AI interviewer and a competency profile), rebuilt as HTML from the brand
 * kit so it stays sharp and readable. The scenario content is illustrative. Decorative for screen
 * readers apart from one summary label. Standalone only, so the brand values are written directly.
 */

const mono = 'font-mono uppercase tracking-[0.14em]'

export function IncidentPanel({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-[16px] bg-[#14213a] text-[#e8eaee] shadow-[0_30px_60px_-24px_rgba(20,33,58,0.55)] ${className}`}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#26365a]">
        <span className={`${mono} text-[11px] text-[#9aa6bd]`}>Incident response · On-call</span>
        <span className={`${mono} text-[11px] text-[#ff8d90] bg-[#e5484d]/20 px-2 py-1 rounded-md`}>
          SLA 12:41
        </span>
      </div>
      <div className="grid grid-cols-[1.7fr_1fr] gap-3 p-3.5">
        <div className="rounded-[12px] bg-[#1b2742] p-3.5">
          <p className={`${mono} text-[10px] text-[#9aa6bd] mb-2`}>Payment API errors</p>
          <svg viewBox="0 0 220 80" className="w-full h-auto" aria-hidden="true">
            {[20, 40, 60].map((y) => (
              <line key={y} x1="0" x2="220" y1={y} y2={y} stroke="#26365a" strokeWidth="1" />
            ))}
            <polyline
              points="0,68 18,66 36,69 54,65 72,67 90,64 108,63 126,56 144,45 162,36 180,24 198,19 214,12"
              fill="none"
              stroke="#9fc2ff"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <circle cx="214" cy="12" r="3.5" fill="#ff8d90" />
          </svg>
        </div>
        <div className="flex flex-col gap-3">
          <div className="rounded-[12px] bg-[#1b2742] p-3.5">
            <p className={`${mono} text-[10px] text-[#9aa6bd]`}>DB connections</p>
            <p className="font-display font-extrabold text-[26px] leading-tight text-[#ffc56b]">
              94%
            </p>
          </div>
          <div className="rounded-[12px] bg-[#1b2742] p-3.5">
            <p className={`${mono} text-[10px] text-[#9aa6bd]`}>Auth</p>
            <p className="font-display font-extrabold text-[22px] leading-tight text-[#ff8d90]">
              Degraded
            </p>
          </div>
        </div>
      </div>
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
        <p className="font-mono text-[12px] text-[#8fe0b0] mt-2">
          ✓ 1,284 customers · retries excluded
        </p>
      </div>
    </div>
  )
}

export function CompetencyCard({ className = '' }: { className?: string }) {
  const rows = [
    ['Prioritization', 88],
    ['Stakeholder comms', 72],
    ['Data judgment', 58],
  ] as const
  return (
    <div
      className={`rounded-[16px] bg-[#9fc2ff] text-[#14213a] p-5 shadow-[0_30px_60px_-24px_rgba(20,33,58,0.45)] ${className}`}
    >
      <p className={`${mono} text-[11px] text-[#14213a]/75 mb-3`}>Competency profile</p>
      <div className="flex flex-col gap-2.5">
        {rows.map(([label, pct]) => (
          <div key={label} className="flex items-center justify-between gap-4">
            <span className="font-semibold text-[14px]">{label}</span>
            <span className="w-[42%] h-2 rounded-full bg-[#14213a]/15 overflow-hidden">
              <span
                className="block h-full rounded-full bg-[#14213a]"
                style={{ width: `${pct}%` }}
              />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The three panels overlapped, as in the brand hero. */
export function HeroScene({ className = '' }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Example simulation screens: an incident response console, a live SQL question from the AI interviewer and a competency profile."
      className={`relative ${className}`}
    >
      <IncidentPanel className="relative w-full sm:w-[88%] ml-auto" />
      <SqlPanel className="relative w-full sm:w-[64%] mt-4 sm:-mt-[12%] sm:-rotate-[1.5deg] z-10" />
      <CompetencyCard className="relative w-full sm:w-[48%] ml-auto mt-4 sm:-mt-[12%] sm:rotate-[1deg] z-20" />
    </div>
  )
}
