import { useState, useEffect, useCallback, useRef } from 'react'
import { applyAudioTranslations } from '@/lib/speechTranslations'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface DIdStreamResponse {
  id: string
  session_id: string
  offer: RTCSessionDescriptionInit
  ice_servers: RTCIceServer[]
}


export interface UseDIdAvatarReturn {
  videoRef: React.RefObject<HTMLVideoElement>
  speak: (text: string, voiceId?: string) => Promise<void>
  connect: (sourceUrl: string) => Promise<void>
  disconnect: () => Promise<void>
  isConnected: boolean
  isPlaying: boolean
  error: string | null
}

export function useDIdAvatar(): UseDIdAvatarReturn {
  const [isConnected, setIsConnected] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const streamIdRef = useRef<string | null>(null)
  const sessionIdRef = useRef<string | null>(null)

  const disconnect = useCallback(async () => {
    if (streamIdRef.current && sessionIdRef.current) {
      try {
        await fetch(`${API_URL}/api/did/streams/${streamIdRef.current}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current }),
        })
      } catch {
        // best effort
      }
    }
    pcRef.current?.close()
    pcRef.current = null
    streamIdRef.current = null
    sessionIdRef.current = null
    setIsConnected(false)
    setIsPlaying(false)
  }, [])

  useEffect(() => {
    return () => { void disconnect() }
  }, [disconnect])

  const connect = useCallback(async (sourceUrl: string) => {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/did/streams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceUrl }),
      })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(body || `Stream creation failed: ${res.status}`)
      }
      const stream: DIdStreamResponse = await res.json()

      streamIdRef.current = stream.id
      sessionIdRef.current = stream.session_id

      const pc = new RTCPeerConnection({ iceServers: stream.ice_servers })
      pcRef.current = pc

      pc.ontrack = (event) => {
        if (event.track.kind === 'video' && videoRef.current) {
          videoRef.current.srcObject = event.streams[0]
        }
      }

      pc.onicecandidate = async ({ candidate }) => {
        if (!candidate || !streamIdRef.current || !sessionIdRef.current) return
        const c = candidate.toJSON()
        await fetch(`${API_URL}/api/did/streams/${streamIdRef.current}/ice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidate: c.candidate,
            sdpMid: c.sdpMid ?? '0',
            sdpMLineIndex: c.sdpMLineIndex ?? 0,
            sessionId: sessionIdRef.current,
          }),
        }).catch(() => {/* best effort */})
      }

      // connect() waits for stream/ready before resolving — this is D-ID's signal that
      // the stream can accept talk requests. Without it (e.g. no credits), we time out
      // and fall back to voice narration.
      let streamReadyResolve: (() => void) | null = null
      const streamReadyPromise = new Promise<void>(resolve => { streamReadyResolve = resolve })

      pc.ondatachannel = (event) => {
        console.log('[D-ID] ondatachannel fired, channel:', event.channel.label, event.channel.readyState)
        event.channel.onopen = () => console.log('[D-ID] data channel open')
        event.channel.onmessage = (msg) => {
          const raw = msg.data as string
          // D-ID sends messages as "event_type:json_payload" (not plain JSON)
          const colonIdx = raw.indexOf(':')
          const type = colonIdx >= 0 ? raw.slice(0, colonIdx) : raw
          console.log('[D-ID message type]', type)

          if (type === 'stream/ready') {
            setIsConnected(true)
            streamReadyResolve?.()
          } else if (type === 'stream/started') {
            setIsPlaying(true)
          } else if (type === 'stream/done') {
            setIsPlaying(false)
          }
        }
      }

      pc.onconnectionstatechange = () => {
        console.log('[D-ID] connection state:', pc.connectionState)
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setIsConnected(false)
          setError('Connection to avatar lost')
        }
      }

      pc.oniceconnectionstatechange = () => {
        console.log('[D-ID] ICE state:', pc.iceConnectionState)
      }

      await pc.setRemoteDescription(stream.offer)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      await fetch(`${API_URL}/api/did/streams/${stream.id}/sdp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: pc.localDescription, sessionId: stream.session_id }),
      })

      // Wait up to 30 seconds for stream/ready; if it never arrives (e.g. no credits), throw
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Avatar timed out — check your D-ID credits')), 30000),
      )
      await Promise.race([streamReadyPromise, timeout])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect avatar'
      setError(msg)
      throw err
    }
  }, [])

  const speak = useCallback(async (text: string, voiceId = 'en-GB-RyanNeural') => {
    if (!streamIdRef.current || !sessionIdRef.current) return
    const translated = applyAudioTranslations(text)
    const res = await fetch(`${API_URL}/api/did/streams/${streamIdRef.current}/talk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: translated,
        voiceId,
        sessionId: sessionIdRef.current,
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(body || `Talk request failed: ${res.status}`)
    }
  }, [])

  return { videoRef, speak, connect, disconnect, isConnected, isPlaying, error }
}
