import { useEffect, useState } from 'react'
import type { ScenarioInterviewer } from '@id/types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// Voices known to render well via D-ID + Microsoft Azure TTS, grouped by gender.
// Mirrors the runtime-pick lists in AvatarPlayer; baked into the rendered MP4 here.
const VOICES_BY_GENDER: Record<'male' | 'female', { id: string; label: string }[]> = {
  female: [
    { id: 'en-GB-SoniaNeural',  label: 'Sonia (en-GB)' },
    { id: 'en-US-JennyNeural',  label: 'Jenny (en-US)' },
  ],
  male: [
    { id: 'en-GB-RyanNeural',   label: 'Ryan (en-GB)' },
    { id: 'en-US-GuyNeural',    label: 'Guy (en-US)' },
  ],
}

interface CuratedPresenter {
  id: string
  name: string
  gender: 'male' | 'female'
  image_url: string
}

interface PersonaPickerProps {
  value: ScenarioInterviewer | undefined
  onChange: (next: ScenarioInterviewer | undefined) => void
}

export function PersonaPicker({ value, onChange }: PersonaPickerProps) {
  const [presenters, setPresenters] = useState<CuratedPresenter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_URL}/api/did/presenters`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((list: CuratedPresenter[]) => {
        if (cancelled) return
        setPresenters(list)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load presenters')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const selectedPresenter = presenters.find(p => p.id === value?.presenterId)
  const voiceOptions = selectedPresenter ? VOICES_BY_GENDER[selectedPresenter.gender] : []

  function pickPresenter(p: CuratedPresenter) {
    // When switching presenter, snap voice to the first valid one for that gender.
    const defaultVoice = VOICES_BY_GENDER[p.gender][0].id
    onChange({ presenterId: p.id, voiceId: defaultVoice })
  }

  function pickVoice(voiceId: string) {
    if (!value?.presenterId) return
    onChange({ presenterId: value.presenterId, voiceId })
  }

  if (loading) {
    return (
      <p className="text-[11px] text-white/30 py-3">Loading presenters…</p>
    )
  }

  if (error) {
    return (
      <p className="text-[11px] text-red-400 py-3">
        Couldn't load presenters: {error}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {presenters.map(p => {
          const selected = p.id === value?.presenterId
          return (
            <button
              key={p.id}
              onClick={() => pickPresenter(p)}
              className={`p-1.5 rounded-xl border transition-all text-left ${
                selected
                  ? 'border-[#2d9e5f]/60 bg-[#2d9e5f]/10'
                  : 'border-white/10 bg-[#111111] hover:border-white/20'
              }`}
              title={`${p.name} (${p.gender})`}
            >
              <div className="aspect-square w-full rounded-lg overflow-hidden bg-black/50 mb-1.5">
                <img
                  src={p.image_url}
                  alt={p.name}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </div>
              <p className={`text-[10px] font-semibold truncate ${selected ? 'text-[#2d9e5f]' : 'text-[#f5f3ee]'}`}>
                {p.name}
              </p>
            </button>
          )
        })}
      </div>

      {selectedPresenter && (
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1.5">
            Voice
          </label>
          <select
            value={value?.voiceId ?? voiceOptions[0]?.id}
            onChange={e => pickVoice(e.target.value)}
            className="w-full bg-[#111111] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-[#f5f3ee] focus:outline-none focus:border-white/30"
          >
            {voiceOptions.map(v => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
        </div>
      )}

      {!selectedPresenter && (
        <p className="text-[11px] text-amber-400/80 leading-relaxed">
          Pick a presenter — the same persona is baked into every rendered clip for this scenario.
        </p>
      )}
    </div>
  )
}
