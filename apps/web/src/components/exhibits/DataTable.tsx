// data-table exhibit. Rows × columns, optional sortable headers + per-cell
// tone for highlighting. Sort state lives in the component (purely visual —
// not persisted to the session, since rerunning a case starts fresh).

import { useMemo, useState } from 'react'
import type {
  DataTableExhibit,
  DataTableRow,
  DataTableCell,
  DataTableColumn,
} from '@id/types'
import { ExhibitShell } from './ExhibitShell'
import { toneText } from './tokens'

interface Props {
  exhibit: DataTableExhibit
}

type SortDir = 'asc' | 'desc'
type SortState = { key: string; dir: SortDir } | null

export function DataTable({ exhibit }: Props) {
  const [sort, setSort] = useState<SortState>(null)

  const rows = useMemo(() => {
    if (!sort) return exhibit.rows
    const col = exhibit.columns.find(c => c.key === sort.key)
    if (!col) return exhibit.rows
    const sorted = [...exhibit.rows].sort((a, b) => {
      const av = numericValue(a[sort.key])
      const bv = numericValue(b[sort.key])
      const cmp =
        av === null && bv === null
          ? String(rawValue(a[sort.key])).localeCompare(String(rawValue(b[sort.key])))
          : (av ?? 0) - (bv ?? 0)
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [exhibit.rows, exhibit.columns, sort])

  return (
    <ExhibitShell
      title={exhibit.title}
      caption={exhibit.caption}
      footnote={exhibit.footnote}
      badge="Table"
      bodyClassName="overflow-x-auto"
    >
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            {exhibit.columns.map(col => (
              <th
                key={col.key}
                className={`px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white/45 ${alignClass(col)} ${col.sortable ? 'cursor-pointer hover:text-white/80 select-none' : ''}`}
                onClick={() => col.sortable && toggleSort(col.key, sort, setSort)}
                aria-sort={sortAriaLabel(col.key, sort)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable && <SortIndicator state={sort} columnKey={col.key} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/2">
              {exhibit.columns.map(col => {
                const cell = row[col.key]
                const display = formatValue(cell, col)
                const cellTone = isCell(cell) ? cell.tone : undefined
                const emphasis = isCell(cell) ? cell.emphasis : false
                return (
                  <td
                    key={col.key}
                    className={`px-3 py-2 ${alignClass(col)} ${emphasis ? 'font-semibold' : ''} ${cellTone ? toneText[cellTone] : 'text-white/85'}`}
                  >
                    {display}
                  </td>
                )
              })}
            </tr>
          ))}
          {exhibit.totalRow && (
            <tr className="bg-white/5 border-t-2 border-white/15">
              {exhibit.columns.map(col => {
                const cell = exhibit.totalRow![col.key]
                const display = formatValue(cell, col)
                const cellTone = isCell(cell) ? cell.tone : undefined
                return (
                  <td
                    key={col.key}
                    className={`px-3 py-2 font-bold ${alignClass(col)} ${cellTone ? toneText[cellTone] : 'text-[#f5f3ee]'}`}
                  >
                    {display}
                  </td>
                )
              })}
            </tr>
          )}
        </tbody>
      </table>
    </ExhibitShell>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────

function isCell(c: unknown): c is DataTableCell {
  return typeof c === 'object' && c !== null && 'value' in c
}

function rawValue(c: DataTableRow[string]): string | number {
  return isCell(c) ? c.value : c
}

function numericValue(c: DataTableRow[string]): number | null {
  const v = rawValue(c)
  if (typeof v === 'number') return v
  const stripped = String(v).replace(/[,%$\s]/g, '')
  const n = Number(stripped)
  return Number.isFinite(n) ? n : null
}

function formatValue(c: DataTableRow[string], col: DataTableColumn): string {
  const v = rawValue(c)
  if (col.format === 'currency' && typeof v === 'number') {
    return `$${v.toLocaleString()}`
  }
  if (col.format === 'percent' && typeof v === 'number') {
    return `${v}%`
  }
  if (col.format === 'number' && typeof v === 'number') {
    return v.toLocaleString()
  }
  return String(v)
}

function alignClass(col: DataTableColumn): string {
  if (col.align === 'left') return 'text-left'
  if (col.align === 'center') return 'text-center'
  if (col.align === 'right') return 'text-right'
  // default: numeric formats right-align, text left-align
  if (col.format && col.format !== 'text') return 'text-right'
  return 'text-left'
}

function toggleSort(
  key: string,
  current: SortState,
  setSort: (s: SortState) => void,
) {
  if (!current || current.key !== key) {
    setSort({ key, dir: 'desc' })
    return
  }
  if (current.dir === 'desc') setSort({ key, dir: 'asc' })
  else setSort(null)
}

function SortIndicator({ state, columnKey }: { state: SortState; columnKey: string }) {
  if (!state || state.key !== columnKey) {
    return <span className="text-white/25">↕</span>
  }
  return <span className="text-white/80">{state.dir === 'desc' ? '↓' : '↑'}</span>
}

function sortAriaLabel(columnKey: string, state: SortState): 'ascending' | 'descending' | 'none' {
  if (!state || state.key !== columnKey) return 'none'
  return state.dir === 'asc' ? 'ascending' : 'descending'
}
