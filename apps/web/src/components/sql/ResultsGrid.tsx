import type { SandboxResult } from '@/lib/sql/sandboxDb'

const NUMERIC_RE = /^-?\d+(\.\d+)?$/

/**
 * Mono data grid for query results: zebra rows, right-aligned numerics, sticky header.
 * `limit` shows that many rows from the full result; without it, the capped `rows`.
 * `marks` (one per shown row, from a server check) adds a ✓/✗ column and tints each row right or wrong.
 */
export function ResultsGrid({
  result,
  limit,
  marks,
}: {
  result: SandboxResult
  limit?: number
  marks?: boolean[]
}) {
  if (result.columns.length === 0) {
    return (
      <p className="px-5 py-6 text-[13px] text-slate-mid font-mono">
        {result.command || 'OK'} — no rows returned.
      </p>
    )
  }
  const rows = limit === undefined ? result.rows : result.allRows.slice(0, limit)
  // Right-align a column when every non-null value in it looks numeric.
  const numeric = result.columns.map((_, ci) =>
    rows.every((r) => r[ci] == null || typeof r[ci] === 'number' || NUMERIC_RE.test(String(r[ci])))
  )
  return (
    <table className="min-w-full text-[12px] font-mono border-collapse">
      <thead className="sticky top-0 z-10 bg-surface-alt shadow-[0_1px_0_rgb(var(--ld-edge,255_255_255)/0.08)]">
        <tr>
          {marks && (
            <th className="px-2 py-2 w-6">
              <span className="sr-only">Matches</span>
            </th>
          )}
          <th className="px-3 py-2 text-right text-[10px] text-ink/25 font-normal w-10">#</th>
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
        {rows.map((row, ri) => (
          <tr
            key={ri}
            className={
              marks
                ? marks[ri]
                  ? 'bg-emerald-400/10'
                  : 'bg-red-400/6'
                : 'odd:bg-ink/2 hover:bg-green-light/10'
            }
          >
            {marks && (
              <td
                className={`px-2 py-1.5 text-center font-bold ${marks[ri] ? 'text-emerald-400' : 'text-red-400'}`}
              >
                <span aria-hidden="true">{marks[ri] ? '✓' : '✗'}</span>
                <span className="sr-only">{marks[ri] ? 'right row' : 'wrong row'}</span>
              </td>
            )}
            <td className="px-3 py-1.5 text-right text-ink/25">{ri + 1}</td>
            {row.map((v, ci) => (
              <td
                key={ci}
                className={`px-3 py-1.5 whitespace-nowrap ${numeric[ci] ? 'text-right text-fg' : 'text-left text-fg/85'}`}
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
  if (v === null || v === undefined) return <span className="text-ink/25 italic">null</span>
  if (typeof v === 'boolean')
    return v ? (
      <span className="text-emerald-400">true</span>
    ) : (
      <span className="text-ink/40">false</span>
    )
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
