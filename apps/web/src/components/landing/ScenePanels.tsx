/**
 * The example simulation screens on the landing page (a live AI interview, an incident console and
 * a live SQL question), rebuilt as HTML from the brand kit so they stay sharp and readable. The
 * scenario content is illustrative. The two portraits are Unsplash photos (Unsplash License, free
 * for commercial use). Standalone only, so the brand values are written directly.
 */

const mono = 'font-mono uppercase tracking-[0.14em]'

export function IncidentPanel({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex flex-col rounded-[16px] bg-[#14213a] text-[#e8eaee] shadow-[0_30px_60px_-24px_rgba(20,33,58,0.55)] ${className}`}
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
            <polygon
              points="0,80 0,68 18,66 36,69 54,65 72,67 90,64 108,63 126,56 144,45 162,36 180,24 198,19 214,12 214,80"
              fill="#9fc2ff"
              fillOpacity="0.14"
            />
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
      <ul className="flex-1 mx-3.5 mb-3.5 rounded-[12px] bg-[#1b2742] px-3.5 py-2 font-mono text-[12px] divide-y divide-[#26365a]">
        {[
          ['14:44', 'payments-api', '5xx rate above 10%', 'text-[#ff8d90]'],
          ['14:43', 'auth', 'p95 latency +340ms', 'text-[#ff8d90]'],
          ['14:41', 'postgres', 'connection pool at 94%', 'text-[#ffc56b]'],
        ].map(([t, svc, msg, tone]) => (
          <li key={t} className="flex gap-3 py-1.5">
            <span className="text-[#9aa6bd]">{t}</span>
            <span className={tone}>{svc}</span>
            <span className="text-[#c9d1df] truncate">{msg}</span>
          </li>
        ))}
      </ul>
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
export function InterviewPanel({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex flex-col rounded-[16px] bg-[#0f1a30] text-[#e8eaee] shadow-[0_30px_60px_-24px_rgba(20,33,58,0.6)] ${className}`}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#26365a]">
        <span className={`${mono} text-[11px] text-[#9aa6bd]`}>Live AI interview</span>
        <span className={`${mono} text-[11px] text-[#ff8d90] flex items-center gap-1.5`}>
          <span className="w-2 h-2 rounded-full bg-[#ff5b60]" />
          Rec 02:14
        </span>
      </div>
      <div className="grid grid-cols-[1.6fr_1fr] gap-3 p-3.5">
        <div className="relative rounded-[12px] bg-gradient-to-b from-[#26365a] to-[#1b2742] aspect-[4/3] overflow-hidden">
          <img
            src="/landing/interviewer.webp"
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute left-3 bottom-3 right-3 flex items-end justify-between">
            <span className="text-[12px] font-semibold bg-[#0f1a30]/80 px-2 py-1 rounded-md">
              Interviewer
            </span>
            <span className="flex items-end gap-[3px] h-5" aria-hidden="true">
              {[8, 14, 20, 12, 17, 9, 15].map((h, i) => (
                <span key={i} className="w-[3px] rounded-full bg-[#8fe0b0]" style={{ height: h }} />
              ))}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="relative flex-1 rounded-[12px] bg-[#1b2742] overflow-hidden min-h-[70px]">
            <img
              src="/landing/candidate.webp"
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            <span className="absolute left-2 bottom-2 text-[11px] font-semibold bg-[#0f1a30]/80 px-1.5 py-0.5 rounded">
              You
            </span>
          </div>
          <div className="hidden sm:block rounded-[12px] bg-[#1b2742] p-3">
            <p className={`${mono} text-[10px] text-[#9aa6bd]`}>Follow-up</p>
            <p className="text-[12px] leading-snug mt-1">Why page the database team first?</p>
          </div>
        </div>
      </div>
      <p className="mx-3.5 mb-3.5 rounded-[12px] bg-[#1b2742] px-3.5 py-2.5 text-[13px] leading-snug">
        <b className="font-semibold text-white">Interviewer:</b> Payments are failing and your
        manager is in a meeting. Walk me through your first five minutes.
      </p>
    </div>
  )
}
