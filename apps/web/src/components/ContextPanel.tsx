import { useState, useEffect, useRef } from 'react'
import type { ContextPanel as ContextPanelType, ContextDisplayStyle, IncidentMeta } from '@id/types'

interface Props {
  panels: ContextPanelType[]
  contextStyle?: ContextDisplayStyle
  incidentMeta?: IncidentMeta
}

// ── Monitor style (ops) ────────────────────────────────────────────────────────

const monitorStatus = {
  alert: {
    tile: 'bg-red-500/10 border-red-500/30',
    dot: 'bg-red-500 animate-pulse',
    val: 'text-red-400',
    label: 'Critical',
  },
  metric: {
    tile: 'bg-amber-500/10 border-amber-500/30',
    dot: 'bg-amber-400',
    val: 'text-amber-400',
    label: 'Elevated',
  },
  info: {
    tile: 'bg-emerald-500/10 border-emerald-500/20',
    dot: 'bg-emerald-500',
    val: 'text-emerald-400',
    label: 'Normal',
  },
}

function MonitorGrid({ panels }: { panels: ContextPanelType[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {panels.map((panel, i) => {
        const s = monitorStatus[panel.type]
        return (
          <div key={i} className={`rounded-xl border px-3 py-3 ${s.tile}`}>
            <div className="flex items-center gap-1.5 mb-2">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
              <span className={`text-[9px] font-bold uppercase tracking-widest ${s.val} opacity-80`}>
                {s.label}
              </span>
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-white/40 mb-1">
              {panel.label}
            </div>
            <div className={`font-display font-black text-[20px] leading-tight ${s.val}`}>
              {panel.value}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Table style (biz) ─────────────────────────────────────────────────────────

const tableValColor = {
  alert: 'text-red-400',
  metric: 'text-amber-400',
  info: 'text-[#f5f3ee]',
}

function TableDisplay({ panels }: { panels: ContextPanelType[] }) {
  return (
    <div className="bg-[#111111] border border-white/10 rounded-xl overflow-hidden">
      {panels.map((panel, i) => (
        <div
          key={i}
          className="flex justify-between items-center px-4 py-3 border-b border-white/5 last:border-0"
        >
          <span className="text-[12px] text-white/50">{panel.label}</span>
          <span className={`text-[13px] font-semibold font-display ${tableValColor[panel.type]}`}>
            {panel.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Finding style (risk) ──────────────────────────────────────────────────────

const findingValColor = {
  alert: 'text-red-400',
  metric: 'text-amber-400',
  info: 'text-white/60',
}

function formatElapsed(secs: number): string {
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function FindingDisplay({
  panels,
  incidentMeta,
}: {
  panels: ContextPanelType[]
  incidentMeta?: IncidentMeta
}) {
  const mountRef = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - mountRef.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="bg-red-500/5 border border-red-500/30 rounded-xl overflow-hidden">

      {/* ── Incident record header ── */}
      {incidentMeta && (
        <div className="bg-red-500/8 border-b border-red-500/20 px-4 py-4">

          {/* ID + status badge */}
          <div className="flex items-center justify-between mb-3">
            <span className="font-display font-bold text-[14px] text-red-400 tracking-wide">
              {incidentMeta.id}
            </span>
            <div className="flex items-center gap-1.5 bg-red-500/15 border border-red-500/30 px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-red-400">
                {incidentMeta.status}
              </span>
            </div>
          </div>

          {/* Incident fields grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <div className="text-[9px] font-medium uppercase tracking-widest text-white/30 mb-0.5">
                Discovered
              </div>
              <div className="text-[12px] text-[#f5f3ee]/80">{incidentMeta.discoveredAt}</div>
            </div>

            <div>
              <div className="text-[9px] font-medium uppercase tracking-widest text-white/30 mb-0.5">
                Time Since Finding
              </div>
              <div className="text-[13px] font-mono font-bold text-amber-400 tabular-nums">
                ⏱ {formatElapsed(elapsed)}
              </div>
            </div>

            <div>
              <div className="text-[9px] font-medium uppercase tracking-widest text-white/30 mb-0.5">
                Severity
              </div>
              <div className="text-[12px] font-semibold text-red-400">{incidentMeta.severity}</div>
            </div>

            <div>
              <div className="text-[9px] font-medium uppercase tracking-widest text-white/30 mb-0.5">
                Assigned To
              </div>
              <div className="text-[12px] text-white/50 italic">{incidentMeta.assignedTo ?? '—'}</div>
            </div>
          </div>

          {/* Regulatory flag */}
          {incidentMeta.regulatoryFlag && (
            <div className="mt-3 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              <span className="text-amber-400 text-[12px]">⚠</span>
              <span className="text-[11px] text-amber-400/90">{incidentMeta.regulatoryFlag}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Finding details (context panels) ── */}
      <div className="flex">
        <div className="w-1 bg-red-500 flex-shrink-0" />
        <div className="flex-1 px-5 py-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-3">
            Finding Details
          </div>
          {panels.map((panel, i) => (
            <div
              key={i}
              className="flex justify-between items-center py-2 border-b border-red-500/10 last:border-0"
            >
              <span className="text-[12px] text-white/50">{panel.label}</span>
              <span className={`text-[12px] font-semibold ${findingValColor[panel.type]}`}>
                {panel.value}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function ContextPanel({ panels, contextStyle = 'monitor', incidentMeta }: Props) {
  if (contextStyle === 'table') return <TableDisplay panels={panels} />
  if (contextStyle === 'finding') return <FindingDisplay panels={panels} incidentMeta={incidentMeta} />
  return <MonitorGrid panels={panels} />
}
