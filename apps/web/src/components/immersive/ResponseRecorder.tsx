import { useState, useRef, useEffect, useCallback } from 'react'

export type RecordingMode = 'audio' | 'video'

export interface RecordingResult {
  blob: Blob
  durationSeconds: number
  mode: RecordingMode
}

interface Props {
  onSubmit: (result: RecordingResult) => void
  onSkip: () => void
  disabled?: boolean
}

type RecorderState = 'idle' | 'recording' | 'preview' | 'submitting'

export function ResponseRecorder({ onSubmit, onSkip, disabled }: Props) {
  const [mode, setMode] = useState<RecordingMode>('audio')
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const blobRef = useRef<Blob | null>(null)
  const videoPreviewRef = useRef<HTMLVideoElement>(null)

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopStream()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const startRecording = useCallback(async () => {
    setError(null)
    chunksRef.current = []

    try {
      const constraints: MediaStreamConstraints =
        mode === 'video'
          ? { audio: true, video: { width: 640, height: 480, facingMode: 'user' } }
          : { audio: true }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      // Show live video preview while recording
      if (mode === 'video' && videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream
        videoPreviewRef.current.muted = true
        void videoPreviewRef.current.play()
      }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType })
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        blobRef.current = blob
        const url = URL.createObjectURL(blob)
        setPreviewUrl(url)
        setState('preview')
        stopStream()
      }

      mediaRecorderRef.current = recorder
      startTimeRef.current = Date.now()
      recorder.start(250) // collect data every 250ms
      setState('recording')

      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 500)
    } catch {
      setError('Could not access microphone. Please check browser permissions.')
    }
  }, [mode])

  const stopRecording = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    mediaRecorderRef.current?.stop()
  }, [])

  const handleSubmit = useCallback(() => {
    if (!blobRef.current) return
    setState('submitting')
    const duration = Math.floor((Date.now() - startTimeRef.current) / 1000)
    onSubmit({ blob: blobRef.current, durationSeconds: duration, mode })
  }, [mode, onSubmit])

  const handleRetake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    blobRef.current = null
    setElapsed(0)
    setState('idle')
  }, [previewUrl])

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0d0d0d] overflow-hidden">
      {/* Mode selector — only shown when idle */}
      {state === 'idle' && (
        <div className="flex border-b border-white/10">
          {(['audio', 'video'] as RecordingMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2.5 text-[13px] font-medium transition-colors ${
                mode === m
                  ? 'text-white bg-white/5'
                  : 'text-slate-light hover:text-white'
              }`}
            >
              {m === 'audio' ? 'Audio only' : 'Video + Audio'}
            </button>
          ))}
        </div>
      )}

      <div className="p-5 space-y-4">
        {/* Video preview area */}
        {(state === 'recording' && mode === 'video') && (
          <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
            <video ref={videoPreviewRef} className="w-full h-full object-cover" playsInline muted />
            <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/60 rounded-full px-2.5 py-1">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[12px] text-white font-mono">{formatTime(elapsed)}</span>
            </div>
          </div>
        )}

        {/* Audio recording indicator */}
        {state === 'recording' && mode === 'audio' && (
          <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-[#111111] border border-red-500/30">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[13px] text-white">Recording…</span>
            </div>
            <span className="font-mono text-[13px] text-slate-light">{formatTime(elapsed)}</span>
          </div>
        )}

        {/* Playback preview */}
        {state === 'preview' && previewUrl && (
          <div className="rounded-lg overflow-hidden bg-[#111111] border border-white/10">
            {mode === 'video' ? (
              <video src={previewUrl} controls className="w-full aspect-video" />
            ) : (
              <audio src={previewUrl} controls className="w-full" />
            )}
          </div>
        )}

        {error && (
          <p className="text-[13px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {state === 'idle' && (
            <>
              <button
                onClick={startRecording}
                disabled={disabled}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green hover:bg-green/90 text-white text-[13px] font-medium transition-colors disabled:opacity-40"
              >
                <span className="w-2 h-2 rounded-full bg-white" />
                Start recording
              </button>
              <button
                onClick={onSkip}
                disabled={disabled}
                className="px-4 py-2.5 rounded-lg border border-white/10 text-slate-light hover:text-white text-[13px] transition-colors disabled:opacity-40"
              >
                Skip
              </button>
            </>
          )}

          {state === 'recording' && (
            <button
              onClick={stopRecording}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[13px] font-medium transition-colors"
            >
              <span className="w-2 h-2 rounded-sm bg-white" />
              Stop recording
            </button>
          )}

          {state === 'preview' && (
            <>
              <button
                onClick={handleSubmit}
                className="flex-1 py-2.5 rounded-lg bg-green hover:bg-green/90 text-white text-[13px] font-medium transition-colors"
              >
                Submit response
              </button>
              <button
                onClick={handleRetake}
                className="px-4 py-2.5 rounded-lg border border-white/10 text-slate-light hover:text-white text-[13px] transition-colors"
              >
                Retake
              </button>
            </>
          )}

          {state === 'submitting' && (
            <div className="flex-1 py-2.5 rounded-lg bg-white/5 text-slate-light text-[13px] text-center">
              Uploading…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
