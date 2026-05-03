import { useEffect, useRef, useState, useCallback } from 'react'

interface PrerenderedAvatarPlayerProps {
  /** Public URL of the MP4 to play for the current node. */
  mediaUrl: string
  /** Whether playback should currently be active. The player auto-plays on mount and on URL change. */
  isPlaying: boolean
  /** Called when the clip finishes (used to advance the simulation state). */
  onDone?: () => void
  className?: string
}

export function PrerenderedAvatarPlayer({ mediaUrl, isPlaying, onDone, className }: PrerenderedAvatarPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  // Auto-play whenever the clip URL changes; reset pause state for the new clip.
  useEffect(() => {
    setIsPaused(false)
    setError(null)
    const video = videoRef.current
    if (!video) return
    video.currentTime = 0
    video.play().catch(err => setError(err instanceof Error ? err.message : 'Playback blocked'))
  }, [mediaUrl])

  // External pause control (e.g. parent transitions away from "narrating").
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!isPlaying && !video.paused) video.pause()
  }, [isPlaying])

  const togglePause = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play()
      setIsPaused(false)
    } else {
      video.pause()
      setIsPaused(true)
    }
  }, [])

  return (
    <div className={`relative rounded-2xl overflow-hidden bg-[#0d0d0d] ${className ?? ''}`}>
      <video
        ref={videoRef}
        src={mediaUrl}
        autoPlay
        playsInline
        onEnded={() => onDoneRef.current?.()}
        onError={() => setError('Failed to load avatar clip')}
        className="w-full h-full object-contain"
      />

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0d0d0d] p-4">
          <p className="text-[12px] text-red-400 text-center">{error}</p>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-end px-4 py-2 bg-gradient-to-t from-black/70 to-transparent">
        <button
          onClick={togglePause}
          className="flex items-center gap-1.5 text-[12px] text-white/70 hover:text-white transition-colors bg-black/40 rounded-full px-3 py-1"
        >
          {isPaused ? 'Resume' : 'Pause'}
        </button>
      </div>
    </div>
  )
}
