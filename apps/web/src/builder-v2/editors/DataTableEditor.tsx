// DataTableEditor — inline editor for data-table exhibits.
// Columns: add/remove, label/format. Rows: add/remove, per-cell inputs. Optional total row.

import { useState } from 'react'
import type { DataTableExhibit, DataTableColumn, DataTableRow } from '@id/types'
import {
  EditShell, Field, TextInput, SelectInput, SectionLabel, AddButton, RemoveButton, inputCls,
} from './shared'

const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'center', label: 'Center' },
]

const FORMAT_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'percent', label: 'Percent' },
]

interface Props {
  exhibit: DataTableExhibit
  onDone: (updated: DataTableExhibit) => void
}

export function DataTableEditor({ exhibit, onDone }: Props) {
  const [title, setTitle] = useState(exhibit.title ?? '')
  const [caption, setCaption] = useState(exhibit.caption ?? '')
  const [columns, setColumns] = useState<DataTableColumn[]>(exhibit.columns ?? [])
  const [rows, setRows] = useState<DataTableRow[]>(exhibit.rows ?? [])
  const [totalRow, setTotalRow] = useState<DataTableRow | undefined>(exhibit.totalRow)
  const [showTotal, setShowTotal] = useState(!!exhibit.totalRow)

  function addColumn() {
    const key = `col${Date.now()}`
    setColumns(prev => [...prev, { key, label: '', align: 'right', format: 'number' }])
  }

  function updateColumn(idx: number, patch: Partial<DataTableColumn>) {
    setColumns(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c))
  }

  function removeColumn(idx: number) {
    const key = columns[idx]?.key
    setColumns(prev => prev.filter((_, i) => i !== idx))
    if (key) {
      setRows(prev => prev.map(r => { const nr = { ...r }; delete nr[key]; return nr }))
      setTotalRow(prev => { if (!prev) return prev; const nr = { ...prev }; delete nr[key]; return nr })
    }
  }

  function addRow() {
    const row: DataTableRow = {}
    columns.forEach(c => { row[c.key] = '' })
    setRows(prev => [...prev, row])
  }

  function updateCell(rowIdx: number, key: string, value: string) {
    setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, [key]: value } : r))
  }

  function updateTotalCell(key: string, value: string) {
    setTotalRow(prev => ({ ...(prev ?? {}), [key]: value }))
  }

  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx))
  }

  function handleDone() {
    onDone({
      ...exhibit,
      title,
      caption: caption || undefined,
      columns,
      rows,
      totalRow: showTotal ? (totalRow ?? {}) : undefined,
    })
  }

  return (
    <EditShell emoji="📊" kindLabel="Data Table" onDone={handleDone}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Title"><TextInput value={title} onChange={e => setTitle(e.target.value)} placeholder="Table title" /></Field>
        <Field label="Caption"><TextInput value={caption} onChange={e => setCaption(e.target.value)} placeholder="e.g. Source: client data" /></Field>
      </div>

      {/* Columns */}
      <div className="flex flex-col gap-2">
        <SectionLabel label="Columns" />
        {columns.length > 0 && (
          <div className="flex gap-2 items-center mb-0.5">
            <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-white/25">Header label</span>
            <span className="w-28 flex-none text-[10px] font-semibold uppercase tracking-wider text-white/25">Align</span>
            <span className="w-28 flex-none text-[10px] font-semibold uppercase tracking-wider text-white/25">Format</span>
            <span className="w-6 flex-none" />
          </div>
        )}
        {columns.map((col, i) => (
          <div key={col.key} className="flex gap-2 items-center">
            <TextInput
              value={col.label}
              onChange={e => updateColumn(i, { label: e.target.value })}
              placeholder="Column label"
            />
            <div className="w-28 flex-none">
              <SelectInput
                value={col.align ?? 'right'}
                onChange={e => updateColumn(i, { align: e.target.value as DataTableColumn['align'] })}
                options={ALIGN_OPTIONS}
              />
            </div>
            <div className="w-28 flex-none">
              <SelectInput
                value={col.format ?? 'number'}
                onChange={e => updateColumn(i, { format: e.target.value as DataTableColumn['format'] })}
                options={FORMAT_OPTIONS}
              />
            </div>
            <RemoveButton onClick={() => removeColumn(i)} />
          </div>
        ))}
        <AddButton onClick={addColumn} label="Add column" />
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-2">
        <SectionLabel label="Rows" />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {columns.map(col => (
                  <th key={col.key} className="text-left text-white/30 font-semibold pb-1.5 pr-2 uppercase text-[10px] tracking-wider">
                    {col.label || col.key}
                  </th>
                ))}
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {columns.map(col => (
                    <td key={col.key} className="pr-2 pb-1.5">
                      <input
                        value={String(row[col.key] ?? '')}
                        onChange={e => updateCell(ri, col.key, e.target.value)}
                        className={`${inputCls} py-1.5 px-2 text-[12px]`}
                        placeholder="—"
                      />
                    </td>
                  ))}
                  <td><RemoveButton onClick={() => removeRow(ri)} /></td>
                </tr>
              ))}
            </tbody>
            {showTotal && (
              <tfoot>
                <tr>
                  {columns.map((col, ci) => (
                    <td key={col.key} className="pr-2 pt-1.5">
                      <input
                        value={String(totalRow?.[col.key] ?? '')}
                        onChange={e => updateTotalCell(col.key, e.target.value)}
                        className={`${inputCls} py-1.5 px-2 text-[12px] font-semibold border-emerald-400/30`}
                        placeholder={ci === 0 ? 'Total' : col.label || '—'}
                      />
                    </td>
                  ))}
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <AddButton onClick={addRow} label="Add row" />
      </div>

      {/* Total row toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={showTotal}
          onChange={e => setShowTotal(e.target.checked)}
          className="accent-emerald-400"
        />
        <span className="text-[12px] text-white/60 font-medium">Show total row</span>
      </label>
    </EditShell>
  )
}
