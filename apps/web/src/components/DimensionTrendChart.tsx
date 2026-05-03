import { useMemo, useState } from 'react'

/**
 * Small dependency-free SVG line chart for per-dimension score trends over time.
 *
 * Used by the student detail page. One line per dimension, x-axis is time,
 * y-axis is score 0–100. Hovering a legend item dims the others to focus
 * attention on a single line. We deliberately don't use a charting library
 * — for a 4-line trend chart it's much more bundle weight than it's worth.
 */

export interface DimensionTrendChartProps {
  series: Record<string, Array<{ completedAt: string; score: number }>>
  height?: number
}

const PALETTE = ['#2d9e5f', '#d4830a', '#5b8def', '#b67edb', '#c0392b', '#16a085', '#e67e22', '#7f8c8d']

export function DimensionTrendChart({ series, height = 220 }: DimensionTrendChartProps) {
  const [focused, setFocused] = useState<string | null>(null)

  const dimensions = useMemo(() => Object.keys(series).sort(), [series])
  const colorByDim = useMemo(() => {
    const m = new Map<string, string>()
    dimensions.forEach((d, i) => m.set(d, PALETTE[i % PALETTE.length]))
    return m
  }, [dimensions])

  // Build a single sorted list of all points so x-axis bounds are stable.
  const allPoints = useMemo(() => {
    const pts: Array<{ dim: string; t: number; score: number }> = []
    for (const [dim, points] of Object.entries(series)) {
      for (const p of points) pts.push({ dim, t: new Date(p.completedAt).getTime(), score: p.score })
    }
    return pts.sort((a, b) => a.t - b.t)
  }, [series])

  if (allPoints.length === 0) {
    return <p className="text-[13px] text-slate-mid">No completions yet — chart will appear once scores exist.</p>
  }

  const minT = allPoints[0].t
  const maxT = allPoints[allPoints.length - 1].t
  // Avoid zero-width bounds (single completion).
  const xRange = maxT === minT ? 1 : maxT - minT

  // Layout
  const width = 600
  const padL = 36
  const padR = 16
  const padT = 12
  const padB = 28
  const chartW = width - padL - padR
  const chartH = height - padT - padB

  function x(t: number): number {
    return padL + ((t - minT) / xRange) * chartW
  }
  function y(score: number): number {
    return padT + (1 - score / 100) * chartH
  }

  const yTicks = [0, 25, 50, 75, 100]

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full"
        role="img"
        aria-label="Per-dimension score trend over time"
      >
        {/* Y gridlines */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={padL}
              x2={width - padR}
              y1={y(tick)}
              y2={y(tick)}
              stroke="#ffffff14"
              strokeWidth={1}
            />
            <text
              x={padL - 6}
              y={y(tick) + 3}
              textAnchor="end"
              fontSize="10"
              fill="#777"
            >
              {tick}
            </text>
          </g>
        ))}

        {/* X axis labels: first + last completion dates */}
        <text x={padL} y={height - 8} fontSize="10" fill="#777">
          {formatShort(minT)}
        </text>
        <text x={width - padR} y={height - 8} fontSize="10" fill="#777" textAnchor="end">
          {formatShort(maxT)}
        </text>

        {/* Lines */}
        {dimensions.map((dim) => {
          const points = series[dim]
            .map((p) => ({ t: new Date(p.completedAt).getTime(), score: p.score }))
            .sort((a, b) => a.t - b.t)
          const path = points
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${y(p.score).toFixed(1)}`)
            .join(' ')
          const color = colorByDim.get(dim) ?? '#888'
          const isOther = focused !== null && focused !== dim
          return (
            <g key={dim} opacity={isOther ? 0.15 : 1} style={{ transition: 'opacity 120ms' }}>
              <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
              {points.map((p, i) => (
                <circle
                  key={i}
                  cx={x(p.t)}
                  cy={y(p.score)}
                  r={3}
                  fill={color}
                />
              ))}
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {dimensions.map((dim) => (
          <button
            key={dim}
            onMouseEnter={() => setFocused(dim)}
            onMouseLeave={() => setFocused(null)}
            onFocus={() => setFocused(dim)}
            onBlur={() => setFocused(null)}
            className="flex items-center gap-1.5 text-[11px] text-slate-light hover:text-[#f5f3ee] transition-colors"
          >
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: colorByDim.get(dim) }}
            />
            {dim}
          </button>
        ))}
      </div>
    </div>
  )
}

function formatShort(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
