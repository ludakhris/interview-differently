import type { SandboxResult } from '@/lib/sql/sandboxDb'

const NUMERIC_RE = /^-?\d+(\.\d+)?$/

/** Mono data grid for query results: zebra rows, right-aligned numerics, sticky header. */
export function ResultsGrid({ result }: { result: SandboxResult }) {
  if (result.columns.length === 0) {
    return <p className="px-5 py-6 text-[13px] text-slate-mid font-mono">{result.command || 'OK'} — no rows returned.</p>
  }
  // Right-align a column when every non-null value in it looks numeric.
  const numeric = result.columns.map((_, ci) =>
    result.rows.every((r) => r[ci] == null || typeof r[ci] === 'number' || NUMERIC_RE.test(String(r[ci]))),
  )
  return (
    <table className="min-w-full text-[12px] font-mono border-collapse">
      <thead className="sticky top-0 z-10 bg-[#111111] shadow-[0_1px_0_rgba(255,255,255,0.08)]">
        <tr>
          <th className="px-3 py-2 text-right text-[10px] text-white/25 font-normal w-10">#</th>
          {result.columns.map((c, i) => (
            <th
              key={i}
              className={`px-3 py-2 text-[10px] uppercase tracking-widest text-slate-light font-bold whitespace-nowrap ${
                numeric[i] ? 'text-right' : 'text-left'
              }`}
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.map((row, ri) => (
          <tr key={ri} className="odd:bg-white/[0.02] hover:bg-[#2d9e5f]/10">
            <td className="px-3 py-1.5 text-right text-white/25">{ri + 1}</td>
            {row.map((v, ci) => (
              <td
                key={ci}
                className={`px-3 py-1.5 whitespace-nowrap ${numeric[ci] ? 'text-right text-[#f5f3ee]' : 'text-left text-[#f5f3ee]/85'}`}
              >
                {formatCell(v)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function formatCell(v: unknown): React.ReactNode {
  if (v === null || v === undefined) return <span className="text-white/25 italic">null</span>
  if (typeof v === 'boolean')
    return v ? <span className="text-emerald-400">true</span> : <span className="text-white/40">false</span>
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
