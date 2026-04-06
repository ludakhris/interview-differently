import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Nav } from '@/components/Nav'
import { MobileWarning } from '@/components/builder/MobileWarning'
import { createScenario } from '@/services/builderService'
import { RUBRIC_TEMPLATES, TRACK_LABELS } from '@/lib/builderTemplates'

const TRACK_OPTIONS = [
  {
    value: 'operations',
    label: 'Operations',
    subtitle: 'Incident Response',
    color: '#e05a2b',
    icon: '⚡',
  },
  {
    value: 'business',
    label: 'Business',
    subtitle: 'Strategy & Analysis',
    color: '#2b7de0',
    icon: '📊',
  },
  {
    value: 'risk',
    label: 'Risk',
    subtitle: 'Risk & Compliance',
    color: '#c0392b',
    icon: '⚖️',
  },
  {
    value: 'customer-success',
    label: 'Customer Success',
    subtitle: 'CS & Support',
    color: '#2d9e5f',
    icon: '🤝',
  },
  {
    value: 'general',
    label: 'General',
    subtitle: 'Judgment & Thinking',
    color: '#7b3fa0',
    icon: '🧭',
  },
  {
    value: 'custom',
    label: 'Custom',
    subtitle: 'Build from scratch',
    color: '#888888',
    icon: '✦',
  },
]

export function BuilderSetupPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [track, setTrack] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const selectedTrackOption = TRACK_OPTIONS.find(t => t.value === track)
  const previewDimensions = track ? (RUBRIC_TEMPLATES[track] ?? []) : []

  function handleCreate() {
    if (!title.trim()) {
      setError('Please enter a scenario title.')
      return
    }
    if (!track) {
      setError('Please select a track.')
      return
    }
    const scenario = createScenario(title.trim(), track)
    navigate(`/builder/${scenario.scenarioId}`)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <MobileWarning />
      <Nav />
      <div className="max-w-lg mx-auto px-6 py-16">
        <div className="mb-10">
          <p className="text-[12px] font-medium tracking-widest uppercase text-white/30 mb-1">
            New Scenario
          </p>
          <h2 className="font-display font-extrabold text-[28px] text-[#f5f3ee] tracking-tight">
            Set Up Your Scenario
          </h2>
        </div>

        {/* Title input */}
        <div className="mb-8">
          <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-3">
            Scenario Title
          </label>
          <input
            type="text"
            value={title}
            onChange={e => {
              setTitle(e.target.value)
              setError(null)
            }}
            placeholder="e.g. Payment System Outage"
            className="w-full bg-[#111111] border border-white/10 rounded-xl px-4 py-3 text-[15px] text-[#f5f3ee] placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors"
          />
        </div>

        {/* Track selector */}
        <div className="mb-8">
          <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-3">
            Track
          </label>
          <div className="grid grid-cols-2 gap-3">
            {TRACK_OPTIONS.map(option => {
              const isSelected = track === option.value
              return (
                <button
                  key={option.value}
                  onClick={() => {
                    setTrack(option.value)
                    setError(null)
                  }}
                  className="relative text-left rounded-xl p-4 border transition-all"
                  style={{
                    background: isSelected ? `${option.color}15` : '#111111',
                    borderColor: isSelected ? option.color : 'rgba(255,255,255,0.1)',
                    boxShadow: isSelected ? `0 0 0 1px ${option.color}` : 'none',
                  }}
                >
                  <div className="text-[18px] mb-2">{option.icon}</div>
                  <div
                    className="text-[13px] font-bold mb-0.5"
                    style={{ color: isSelected ? option.color : '#f5f3ee' }}
                  >
                    {option.label}
                  </div>
                  <div className="text-[11px] text-white/30">{option.subtitle}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Rubric preview */}
        {track && previewDimensions.length > 0 && (
          <div className="mb-8 bg-[#111111] border border-white/10 rounded-xl p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">
              Pre-filled Rubric — {TRACK_LABELS[track]}
            </p>
            <div className="space-y-2">
              {previewDimensions.map(dim => (
                <div key={dim.name} className="flex items-start gap-3">
                  <span
                    className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: selectedTrackOption?.color ?? '#888' }}
                  />
                  <div>
                    <p className="text-[12px] font-semibold text-[#f5f3ee]">{dim.name}</p>
                    <p className="text-[11px] text-white/30 leading-relaxed">{dim.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-white/20 mt-4">
              You can edit or add dimensions in the canvas rubric editor.
            </p>
          </div>
        )}

        {track === 'custom' && (
          <div className="mb-8 bg-[#111111] border border-white/10 rounded-xl p-5">
            <p className="text-[11px] text-white/30 leading-relaxed">
              A blank rubric will be created. Add your dimensions in the canvas rubric editor.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-center gap-2 text-amber-400 text-[13px]">
            <span>⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/builder')}
            className="py-3 px-6 rounded-xl border border-white/10 text-[13px] text-white/40 hover:text-white/60 hover:border-white/20 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || !track}
            className="flex-1 py-3 rounded-xl text-[13px] font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: !title.trim() || !track ? 'rgba(255,255,255,0.08)' : '#1a6b3c',
            }}
          >
            Create Scenario →
          </button>
        </div>
      </div>
    </div>
  )
}
