interface Props {
  isPlaying: boolean
  isMuted: boolean
  onToggleMute: () => void
  onReplay: () => void
}

export function NarrationPlayer({ isPlaying, isMuted, onToggleMute, onReplay }: Props) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#111111] border border-white/10">
      {/* Animated bars — visible only while playing */}
      <div className="flex items-end gap-[3px] h-5 w-8">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-[4px] rounded-full bg-green transition-all ${
              isPlaying && !isMuted ? 'animate-pulse' : 'opacity-20'
            }`}
            style={{
              height: isPlaying && !isMuted ? `${[12, 20, 16, 10][i]}px` : '4px',
              animationDelay: `${i * 120}ms`,
              animationDuration: '600ms',
            }}
          />
        ))}
      </div>

      <span className="text-[13px] text-slate-light flex-1">
        {isMuted ? 'Narration muted' : isPlaying ? 'Interviewer speaking…' : 'Narration complete'}
      </span>

      {/* Replay */}
      <button
        onClick={onReplay}
        title="Replay narration"
        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-light hover:text-white transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1.5 8a6.5 6.5 0 1 0 1.4-4" />
          <polyline points="1.5 2 1.5 5.5 5 5.5" />
        </svg>
      </button>

      {/* Mute toggle */}
      <button
        onClick={onToggleMute}
        title={isMuted ? 'Unmute narration' : 'Mute narration'}
        className={`p-1.5 rounded-lg hover:bg-white/10 transition-colors ${isMuted ? 'text-amber-400' : 'text-slate-light hover:text-white'}`}
      >
        {isMuted ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3L5 7H2v2h3l4 4V3z" />
            <line x1="12" y1="9" x2="15" y2="12" />
            <line x1="15" y1="9" x2="12" y2="12" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3L5 7H2v2h3l4 4V3z" />
            <path d="M12 6a3 3 0 0 1 0 4" />
          </svg>
        )}
      </button>
    </div>
  )
}
