interface Props {
  score: number
  size?: number
  strokeWidth?: number
  label?: string
}

export function ScoreRing({ score, size = 120, strokeWidth = 10, label }: Props) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  const color =
    score >= 80
      ? 'rgb(var(--ld-emerald-400, 4 120 87))'
      : score >= 60
        ? 'rgb(var(--ld-amber-400, 146 64 14))'
        : 'rgb(var(--ld-red-400, 185 28 28))'

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgb(var(--ld-ink, 20 33 58) / 0.1)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="score-ring-fill"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display font-extrabold text-2xl leading-none" style={{ color }}>
            {score}
          </span>
          <span className="text-[10px] text-slate-mid font-medium mt-0.5">/ 100</span>
        </div>
      </div>
      {label && (
        <span className="text-[12px] font-medium text-slate-mid text-center leading-tight max-w-[100px]">
          {label}
        </span>
      )}
    </div>
  )
}
