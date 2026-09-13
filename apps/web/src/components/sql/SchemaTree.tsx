import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { SchemaTable } from '@/services/datasetsService'

// Postgres data_type → short badge + colour. Anything unknown renders dim.
export function typeBadge(type: string): { label: string; cls: string } {
  if (/int/.test(type)) return { label: 'int', cls: 'text-sky-400 bg-sky-400/10' }
  if (/numeric|decimal|double|real|money/.test(type)) return { label: 'num', cls: 'text-emerald-400 bg-emerald-400/10' }
  if (/date|time/.test(type)) return { label: type.startsWith('time') ? 'ts' : 'date', cls: 'text-amber-400 bg-amber-400/10' }
  if (/bool/.test(type)) return { label: 'bool', cls: 'text-violet-400 bg-violet-400/10' }
  if (/text|char/.test(type)) return { label: 'text', cls: 'text-slate-light bg-white/5' }
  return { label: type.slice(0, 6), cls: 'text-white/40 bg-white/5' }
}

/** Collapsible table → column tree. Clicking a table or column name calls `onPick` with that bare name. */
export function SchemaTree({ tables, onPick }: { tables: SchemaTable[]; onPick: (name: string) => void }) {
  // First table open by default so the sidebar isn't a wall of columns.
  const [open, setOpen] = useState<Record<string, boolean>>(() => (tables[0] ? { [tables[0].table]: true } : {}))
  return (
    <ul className="space-y-0.5">
      {tables.map((t) => {
        const expanded = open[t.table] ?? false
        return (
          <li key={t.table}>
            <div className="flex items-center gap-1 group">
              <button
                onClick={() => setOpen((o) => ({ ...o, [t.table]: !expanded }))}
                className="flex items-center gap-1 flex-1 min-w-0 py-1 text-left text-[#f5f3ee] hover:text-green-light transition-colors"
              >
                {expanded ? (
                  <ChevronDown size={12} className="text-white/30 flex-shrink-0" />
                ) : (
                  <ChevronRight size={12} className="text-white/30 flex-shrink-0" />
                )}
                <span className="font-mono text-[12px] font-semibold truncate">{t.table}</span>
              </button>
              <button
                onClick={() => onPick(t.table)}
                title={`${t.rowCount} rows — click to insert table name`}
                className="font-mono text-[10px] text-white/30 group-hover:text-white/60 hover:!text-green-light px-1.5 py-0.5 rounded bg-white/5 transition-colors"
              >
                {t.rowCount}
              </button>
            </div>
            {expanded && (
              <ul className="ml-4 mb-2 border-l border-white/8 pl-2.5">
                {t.columns.map((c) => {
                  const b = typeBadge(c.type)
                  return (
                    <li key={c.name}>
                      <button
                        onClick={() => onPick(c.name)}
                        title={`${c.type} — click to insert`}
                        className="w-full flex items-center justify-between gap-2 py-[3px] group/col"
                      >
                        <span className="font-mono text-[11px] text-white/60 group-hover/col:text-[#f5f3ee] truncate transition-colors">
                          {c.name}
                        </span>
                        <span className={`font-mono text-[9px] px-1 py-px rounded ${b.cls}`}>{b.label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
