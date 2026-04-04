import type { DimensionScore } from '@id/types'

interface Props {
  score: DimensionScore
  delay?: number
}

const qualityColors: Record<string, string> = {
  strong: '#1a6b3c',
  proficient: '#d4830a',
  developing: '#c0392b',
}

const qualityBg: Record<string, string> = {
  strong: '#e8f5ee',
  proficient: '#fef3e0',
  developing: '#fdecea',
}

export function DimensionScoreBar({ score, delay = 0 }: Props) {
  const color = qualityColors[score.quality]
  const bg = qualityBg[score.quality]

  return (
    <div
      className="animate-slide-up p-5 rounded-xl border border-border bg-white"
      style={{ animationDelay: `${delay}ms`, opacity: 0, animationFillMode: 'forwards' }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="font-display font-semibold text-sm text-black">{score.dimension}</span>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full capitalize"
            style={{ color, background: bg }}
          >
            {score.quality}
          </span>
          <span className="font-display font-bold text-lg" style={{ color }}>
            {score.score}
          </span>
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-cream mb-4 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${score.score}%`, background: color }}
        />
      </div>

      <p className="text-xs text-slate-mid leading-relaxed">{score.feedback}</p>
    </div>
  )
}
