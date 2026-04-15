import { useEffect, useRef, useState, useCallback } from 'react'
import { useDIdAvatar } from '@/hooks/useDIdAvatar'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// Gender-matched Microsoft Azure voices for a professional interviewer persona
const FEMALE_VOICES = ['en-GB-SoniaNeural', 'en-US-JennyNeural']
const MALE_VOICES = ['en-GB-RyanNeural', 'en-US-GuyNeural']

function pickVoice(gender: 'male' | 'female'): string {
  const pool = gender === 'female' ? FEMALE_VOICES : MALE_VOICES
  return pool[Math.floor(Math.random() * pool.length)]
}

interface CuratedPresenter {
  id: string
  name: string
  gender: 'male' | 'female'
  image_url: string
}

interface AvatarPlayerProps {
  /** Called once the WebRTC session is connected and ready to speak */
  onReady: (speak: (text: string) => Promise<void>) => void
  /** Called when the avatar finishes speaking a chunk */
  onDone?: () => void
  /** Called when D-ID connection fails — parent should fall back to voice narration */
  onError?: (message: string) => void
  className?: string
}

export function AvatarPlayer({ onReady, onDone, onError, className }: AvatarPlayerProps) {
  const { videoRef, speak, connect, isConnected, isPlaying, error } = useDIdAvatar()
  const [status, setStatus] = useState<'loading' | 'connecting' | 'ready' | 'error'>('loading')
  const [isPaused, setIsPaused] = useState(false)
  const selectedVoiceRef = useRef<string>('en-GB-RyanNeural')
  const onReadyRef = useRef(onReady)
  const onDoneRef = useRef(onDone)
  const onErrorRef = useRef(onError)
  const prevPlayingRef = useRef(false)
  const wasConnectedRef = useRef(false)

  onReadyRef.current = onReady
  onDoneRef.current = onDone
  onErrorRef.current = onError

  // Pick a random curated presenter and connect on mount
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const res = await fetch(`${API_URL}/api/did/presenters`)
        let sourceUrl = ''
        let gender: 'male' | 'female' = 'male'

        if (res.ok) {
          const presenters: CuratedPresenter[] = await res.json()
          if (presenters.length > 0) {
            const picked = presenters[Math.floor(Math.random() * presenters.length)]
            sourceUrl = picked.image_url
            gender = picked.gender
          }
        }

        if (!sourceUrl) throw new Error('No presenters available')

        selectedVoiceRef.current = pickVoice(gender)

        if (cancelled) return
        setStatus('connecting')
        await connect(sourceUrl)
        if (!cancelled) setStatus('ready')
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Avatar connection failed'
          setStatus('error')
          onErrorRef.current?.(msg)
        }
      }
    }

    void init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Wrap speak with the gender-matched voice, notify parent when ready
  const wrappedSpeak = useCallback(
    async (text: string) => {
      await speak(text, selectedVoiceRef.current)
    },
    [speak],
  )

  useEffect(() => {
    if (isConnected && status === 'ready') {
      wasConnectedRef.current = true
      onReadyRef.current(wrappedSpeak)
    }
    // Only treat as a drop if the connection was previously established
    if (!isConnected && status === 'ready' && wasConnectedRef.current) {
      setStatus('error')
      onErrorRef.current?.('Avatar stream disconnected unexpectedly')
    }
  }, [isConnected, status, wrappedSpeak])

  // Detect transition from playing → done
  useEffect(() => {
    if (prevPlayingRef.current && !isPlaying) {
      onDoneRef.current?.()
    }
    prevPlayingRef.current = isPlaying
  }, [isPlaying])

  const togglePause = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (isPaused) {
      void video.play()
      setIsPaused(false)
    } else {
      video.pause()
      setIsPaused(true)
    }
  }, [isPaused, videoRef])

  return (
    <div className={`relative rounded-2xl overflow-hidden bg-[#0d0d0d] ${className ?? ''}`}>
      {/* Video stream */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-contain"
      />

      {/* Status overlays */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0d0d0d]">
          <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
          <p className="text-[12px] text-slate-mid">Loading interviewer…</p>
        </div>
      )}

      {status === 'connecting' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0d0d0d]">
          <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-green/60 animate-spin" />
          <p className="text-[12px] text-slate-mid">Connecting…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0d0d0d] p-4">
          <p className="text-[12px] text-red-400 text-center">{error ?? 'Avatar unavailable'}</p>
          <p className="text-[11px] text-slate-mid text-center">Audio narration will continue</p>
        </div>
      )}

      {/* Control bar — shown once ready */}
      {status === 'ready' && (
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-2 bg-gradient-to-t from-black/70 to-transparent">
          {/* Speaking indicator */}
          <div className="flex items-center gap-1.5 h-5">
            {isPlaying && !isPaused && [0, 1, 2].map(i => (
              <span
                key={i}
                className="w-1 bg-green rounded-full animate-pulse"
                style={{ height: '12px', animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>

          {/* Pause / Resume button */}
          <button
            onClick={togglePause}
            className="flex items-center gap-1.5 text-[12px] text-white/70 hover:text-white transition-colors bg-black/40 rounded-full px-3 py-1"
          >
            {isPaused ? (
              <>
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
                Resume
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Pause
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
