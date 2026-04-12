import { useState, useEffect, useCallback, useRef } from 'react'

export interface UseNarrationReturn {
  play: (text: string) => void
  stop: () => void
  isPlaying: boolean
  isMuted: boolean
  toggleMute: () => void
}

/**
 * Wraps the Web Speech API SpeechSynthesis interface.
 * Upgrade path: swap the play() implementation to use fetched audio (e.g.
 * ElevenLabs) without changing the hook's public API.
 */
export function useNarration(): UseNarrationReturn {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const mutedRef = useRef(false)

  // Keep ref in sync so the cancel callback sees current value
  useEffect(() => {
    mutedRef.current = isMuted
  }, [isMuted])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        window.speechSynthesis?.cancel()
      }
    }
  }, [])

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel()
    setIsPlaying(false)
  }, [])

  const play = useCallback(
    (text: string) => {
      if (mutedRef.current) {
        // Skip narration when muted but still signal "done" immediately
        setIsPlaying(false)
        return
      }

      window.speechSynthesis?.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.95
      utterance.pitch = 1.0

      utterance.onstart = () => setIsPlaying(true)
      utterance.onend = () => setIsPlaying(false)
      utterance.onerror = () => setIsPlaying(false)

      utteranceRef.current = utterance
      setIsPlaying(true)
      window.speechSynthesis.speak(utterance)
    },
    [],
  )

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      if (!prev) {
        // Muting — stop any current narration
        window.speechSynthesis?.cancel()
        setIsPlaying(false)
      }
      return !prev
    })
  }, [])

  return { play, stop, isPlaying, isMuted, toggleMute }
}
