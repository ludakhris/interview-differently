import type { ChartConfig } from '@id/types'

const palette = {
  red: {
    line: '#ef4444',
    gradientStart: 'rgba(239,68,68,0.22)',
    gradientEnd: 'rgba(239,68,68,0)',
    dot: '#ef4444',
    value: '#f87171',
    annotation: 'rgba(239,68,68,0.6)',
  },
  amber: {
    line: '#f59e0b',
    gradientStart: 'rgba(245,158,11,0.22)',
    gradientEnd: 'rgba(245,158,11,0)',
    dot: '#f59e0b',
    value: '#fbbf24',
    annotation: 'rgba(245,158,11,0.6)',
  },
  green: {
    line: '#10b981',
    gradientStart: 'rgba(16,185,129,0.22)',
    gradientEnd: 'rgba(16,185,129,0)',
    dot: '#10b981',
    value: '#34d399',
    annotation: 'rgba(16,185,129,0.6)',
  },
}

interface Props {
  config: ChartConfig
}

export function MetricChart({ config }: Props) {
  const c = palette[config.color]
  const gradId = `chart-grad-${config.color}`

  // ── Layout constants ──────────────────────────────────────────────────────
  const VW = 520
  const VH = 110
  const PAD = { l: 38, r: 14, t: 22, b: 24 }
  const CW = VW - PAD.l - PAD.r   // chart width
  const CH = VH - PAD.t - PAD.b   // chart height

  // ── Scale ─────────────────────────────────────────────────────────────────
  const values = config.series.map((d) => d.v)
  const rawMax = Math.max(...values, config.baseline ?? 0)
  const maxVal = rawMax * 1.3   // 30% headroom so spike doesn't kiss the top
  const minVal = 0

  const cx = (i: number) =>
    PAD.l + (i / Math.max(values.length - 1, 1)) * CW
  const cy = (v: number) =>
    PAD.t + CH - ((v - minVal) / (maxVal - minVal)) * CH

  // ── Path strings ──────────────────────────────────────────────────────────
  const linePath = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${cx(i).toFixed(1)},${cy(v).toFixed(1)}`)
    .join(' ')

  const areaPath = [
    `M ${cx(0).toFixed(1)},${(PAD.t + CH).toFixed(1)}`,
    ...values.map((v, i) => `L ${cx(i).toFixed(1)},${cy(v).toFixed(1)}`),
    `L ${cx(values.length - 1).toFixed(1)},${(PAD.t + CH).toFixed(1)}`,
    'Z',
  ].join(' ')

  // ── Y-axis ticks (4 evenly spaced) ────────────────────────────────────────
  const yTicks = [0, 1, 2, 3].map((n) => parseFloat(((maxVal * n) / 3).toFixed(1)))

  // ── X-axis: show roughly 5 labels ─────────────────────────────────────────
  const xStep = Math.max(1, Math.floor(values.length / 5))
  const xLabels = config.series
    .map((d, i) => ({ d, i }))
    .filter(({ i }) => i % xStep === 0 || i === values.length - 1)

  const lastVal = values[values.length - 1]
  const lastX = cx(values.length - 1)
  const lastY = cy(lastVal)

  return (
    <div className="bg-[#0d0d0d] border border-white/10 rounded-xl overflow-hidden mb-3">

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">
          {config.title}
        </span>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="font-mono font-bold text-[13px]" style={{ color: c.value }}>
            {lastVal}{config.unit}
          </span>
          <span className="text-[10px] text-white/30">now</span>
        </div>
      </div>

      {/* SVG chart */}
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="w-full block"
        style={{ height: 100 }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id={gradId}
            x1="0" y1={PAD.t}
            x2="0" y2={PAD.t + CH}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor={c.gradientStart} />
            <stop offset="100%" stopColor={c.gradientEnd} />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines + y-axis labels */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.l} y1={cy(tick)}
              x2={VW - PAD.r} y2={cy(tick)}
              stroke="rgba(255,255,255,0.055)"
              strokeWidth="1"
            />
            <text
              x={PAD.l - 5} y={cy(tick) + 3.5}
              fill="rgba(255,255,255,0.28)"
              fontSize="7.5"
              textAnchor="end"
              fontFamily="ui-monospace, monospace"
            >
              {tick}{config.unit}
            </text>
          </g>
        ))}

        {/* Baseline reference line */}
        {config.baseline !== undefined && (
          <line
            x1={PAD.l} y1={cy(config.baseline)}
            x2={VW - PAD.r} y2={cy(config.baseline)}
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        )}

        {/* Area fill */}
        <path d={areaPath} fill={`url(#${gradId})`} />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={c.line}
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Annotation: vertical marker + label */}
        {config.annotation && (
          <g>
            <line
              x1={cx(config.annotation.tIndex)}
              y1={PAD.t}
              x2={cx(config.annotation.tIndex)}
              y2={PAD.t + CH}
              stroke={c.annotation}
              strokeWidth="1"
              strokeDasharray="2 3"
            />
            <text
              x={cx(config.annotation.tIndex) + 4}
              y={PAD.t + 9}
              fill={c.annotation}
              fontSize="7.5"
              fontFamily="ui-sans-serif, sans-serif"
            >
              {config.annotation.label}
            </text>
          </g>
        )}

        {/* X-axis time labels */}
        {xLabels.map(({ d, i }) => (
          <text
            key={i}
            x={cx(i)}
            y={VH - 5}
            fill="rgba(255,255,255,0.25)"
            fontSize="7.5"
            textAnchor="middle"
            fontFamily="ui-monospace, monospace"
          >
            {d.t}
          </text>
        ))}

        {/* Current value dot */}
        <circle cx={lastX} cy={lastY} r="3.5" fill={c.dot} />
        <circle cx={lastX} cy={lastY} r="6" fill={c.dot} opacity="0.18" />
      </svg>

    </div>
  )
}
