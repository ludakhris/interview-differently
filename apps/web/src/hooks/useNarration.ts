import { useState, useEffect, useCallback, useRef } from 'react'
import { applyAudioTranslations } from '@/lib/speechTranslations'

export interface UseNarrationReturn {
  play: (text: string) => void
  stop: () => void
  isPlaying: boolean
  isMuted: boolean
  toggleMute: () => void
}

// Preferred voices in priority order — first match wins.
// These are the highest-quality voices available in Chrome/Safari/Edge.
const PREFERRED_VOICES = [
  'Google UK English Male',
  'Google UK English Female',
  'Microsoft Ryan Online (Natural) - English (United Kingdom)',
  'Microsoft Sonia Online (Natural) - English (United Kingdom)',
  'Microsoft Guy Online (Natural) - English (United States)',
  'Microsoft Jenny Online (Natural) - English (United States)',
  'Google US English',
  'Karen', // macOS
  'Daniel', // macOS UK
  'Moira', // macOS Irish
]

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  for (const name of PREFERRED_VOICES) {
    const match = voices.find(v => v.name === name)
    if (match) return match
  }
  // Fallback: first English voice that isn't the default robotic one
  return voices.find(v => v.lang.startsWith('en') && !v.name.toLowerCase().includes('zira')) ?? voices[0] ?? null
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
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])

  // Voices load asynchronously — populate ref when ready
  useEffect(() => {
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices() }
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])

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
        setIsPlaying(false)
        return
      }

      window.speechSynthesis?.cancel()

      const utterance = new SpeechSynthesisUtterance(applyAudioTranslations(text))

      const voice = pickVoice(voicesRef.current)
      if (voice) utterance.voice = voice

      utterance.rate = 1.0
      utterance.pitch = 1.0
      utterance.volume = 1.0

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
