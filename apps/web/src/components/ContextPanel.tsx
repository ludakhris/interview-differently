import type { ContextPanel as ContextPanelType } from '@id/types'

interface Props {
  panels: ContextPanelType[]
}

const typeStyles = {
  alert: 'bg-red-500/10 border-red-500/30 text-red-400',
  metric: 'bg-white/5 border-white/10 text-[#f5f3ee]',
  info: 'bg-green/10 border-green/30 text-green-light',
}

export function ContextPanel({ panels }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {panels.map((panel, i) => (
        <div
          key={i}
          className={`rounded-lg border px-3 py-2.5 ${typeStyles[panel.type]}`}
        >
          <div className="text-[10px] font-medium uppercase tracking-wider opacity-60 mb-0.5">
            {panel.label}
          </div>
          <div className="font-display font-bold text-[15px] leading-tight">{panel.value}</div>
        </div>
      ))}
    </div>
  )
}
