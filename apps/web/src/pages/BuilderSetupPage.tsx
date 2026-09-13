import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Nav } from '@/components/Nav'
import { MobileWarning } from '@/components/builder/MobileWarning'
import { createScenario, createScenarioFromImport, duplicateScenario, listScenarios } from '@/services/builderService'
import { yamlToScenario } from '@/lib/yamlScenario'
import type { Scenario } from '@id/types'
import { useOwnerOptions } from '@/hooks/useOwnerOptions'
import { RUBRIC_TEMPLATES, TRACK_LABELS } from '@/lib/builderTemplates'
import { BUSINESS_CASE_SUBCATEGORIES, BUSINESS_CASE_SUBCATEGORY_LABELS } from '@id/types'

const TRACK_OPTIONS = [
  {
    value: 'business case',
    label: 'Business Cases',
    subtitle: 'Strategy consulting style',
    color: '#0f5b89',
    icon: '💼',
  },
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
    value: 'data-analytics',
    label: 'Data Analytics',
    subtitle: 'SQL against a dataset',
    color: '#0a9396',
    icon: '🗄️',
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
  const owners = useOwnerOptions()
  const [ownerId, setOwnerId] = useState<string | null | undefined>(undefined) // undefined = use first option
  const [subcategory, setSubcategory] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  // Start from: blank form, clone an existing scenario, or import a YAML / JSON file (#24 Phase E)
  const [startFrom, setStartFrom] = useState<'blank' | 'clone' | 'import'>('blank')
  const [sources, setSources] = useState<Scenario[]>([])
  const [cloneId, setCloneId] = useState('')
  const [importDoc, setImportDoc] = useState<{ name: string; scenario: Scenario } | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (startFrom === 'clone' && sources.length === 0) listScenarios().then(setSources).catch(() => setSources([]))
  }, [startFrom, sources.length])

  const selectedTrackOption = TRACK_OPTIONS.find(t => t.value === track)
  const previewDimensions = track ? (RUBRIC_TEMPLATES[track] ?? []) : []
  const showSubcategory = track === 'business case'

  async function handleCreate() {
    const owner = ownerId === undefined ? (owners[0]?.id ?? null) : ownerId
    if (startFrom === 'clone') {
      if (!cloneId) { setError('Pick a scenario to clone.'); return }
      setBusy(true)
      try {
        const copy = await duplicateScenario(cloneId, { title: title.trim() || undefined, institutionId: owner })
        if (!copy) throw new Error('Could not load the source scenario.')
        navigate(`/builder/${copy.scenarioId}`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Clone failed.')
      } finally {
        setBusy(false)
      }
      return
    }
    if (startFrom === 'import') {
      if (!importDoc) { setError('Choose a YAML or JSON file to import.'); return }
      setBusy(true)
      try {
        const created = await createScenarioFromImport(importDoc.scenario, { title: title.trim() || undefined, institutionId: owner })
        navigate(`/builder/${created.scenarioId}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Import failed.'
        setError(/409|already/i.test(msg) ? `A scenario with id "${importDoc.scenario.scenarioId}" already exists — change the id in the file.` : msg)
      } finally {
        setBusy(false)
      }
      return
    }
    if (!title.trim()) {
      setError('Please enter a scenario title.')
      return
    }
    if (!track) {
      setError('Please select a track.')
      return
    }
    if (showSubcategory && !subcategory) {
      setError('Please select a sub-track.')
      return
    }
    const scenario = await createScenario(title.trim(), track, showSubcategory ? subcategory : undefined, owner)
    navigate(`/builder/${scenario.scenarioId}`)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const text = String(ev.target?.result ?? '')
        const scenario = file.name.endsWith('.json') ? (JSON.parse(text) as Scenario) : yamlToScenario(text)
        if (!scenario?.scenarioId || !scenario.nodes) throw new Error('not a scenario')
        setImportDoc({ name: file.name, scenario })
        if (!title.trim()) setTitle(scenario.title)
      } catch {
        setImportDoc(null)
        setError(`Couldn't read ${file.name} — expected a scenario YAML or JSON export.`)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
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

        {/* Start from */}
        <div className="mb-8">
          <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-3">
            Start from
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: 'blank', label: 'Blank', hint: 'Pick a track, start writing' },
                { value: 'clone', label: 'Clone', hint: 'Copy an existing scenario' },
                { value: 'import', label: 'Import', hint: 'YAML or JSON file' },
              ] as const
            ).map(opt => (
              <button
                key={opt.value}
                onClick={() => { setStartFrom(opt.value); setError(null) }}
                className="text-left rounded-xl p-3 border transition-all"
                style={{
                  background: startFrom === opt.value ? '#2d9e5f15' : '#111111',
                  borderColor: startFrom === opt.value ? '#2d9e5f' : 'rgba(255,255,255,0.1)',
                }}
              >
                <div className="text-[13px] font-bold text-[#f5f3ee]">{opt.label}</div>
                <div className="text-[11px] text-white/30">{opt.hint}</div>
              </button>
            ))}
          </div>
        </div>

        {startFrom === 'clone' && (
          <div className="mb-8">
            <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-3">
              Scenario to clone
            </label>
            <select
              value={cloneId}
              onChange={e => { setCloneId(e.target.value); setError(null) }}
              className="w-full bg-[#111111] border border-white/10 rounded-xl px-4 py-3 text-[15px] text-[#f5f3ee] focus:outline-none focus:border-white/30 transition-colors"
            >
              <option value="">{sources.length ? '— pick one —' : 'Loading…'}</option>
              {sources.map(sc => (
                <option key={sc.scenarioId} value={sc.scenarioId}>
                  {sc.title} · {TRACK_LABELS[sc.track] ?? sc.track}{sc.institutionName ? ` · ${sc.institutionName}` : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-white/30 mt-2">Track, rubric, phases, exhibits and questions are copied. The copy starts as a draft.</p>
          </div>
        )}

        {startFrom === 'import' && (
          <div className="mb-8">
            <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-3">
              File
            </label>
            <input ref={fileRef} type="file" accept=".yaml,.yml,.json" className="hidden" onChange={handleFile} />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full text-left bg-[#111111] border border-dashed border-white/15 hover:border-white/30 rounded-xl px-4 py-3 text-[13px] text-white/60 transition-colors"
            >
              {importDoc ? `✓ ${importDoc.name} — ${importDoc.scenario.nodes.length} blocks, ${importDoc.scenario.phases?.length ?? 0} phases` : 'Choose a .yaml or .json scenario file…'}
            </button>
            <p className="text-[11px] text-white/30 mt-2">
              Write the YAML offline (AI-assisted works well — see <span className="font-mono">apps/web/src/lib/scenarios/</span> for the format). Imports start as drafts.
            </p>
          </div>
        )}

        {/* Title input */}
        <div className="mb-8">
          <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-3">
            Scenario Title{startFrom !== 'blank' && <span className="normal-case tracking-normal font-normal text-white/25"> — optional, keeps the source title if blank</span>}
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

        {/* Owner — only when there's a choice (#15) */}
        {owners.length > 1 && (
          <div className="mb-8">
            <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-3">
              Visible to
            </label>
            <select
              value={(ownerId === undefined ? owners[0]?.id : ownerId) ?? ''}
              onChange={(e) => setOwnerId(e.target.value || null)}
              className="w-full bg-[#111111] border border-white/10 rounded-xl px-4 py-3 text-[15px] text-[#f5f3ee] focus:outline-none focus:border-white/30 transition-colors"
            >
              {owners.map((o) => (
                <option key={o.id ?? 'public'} value={o.id ?? ''}>
                  {o.id === null ? 'Everyone (public)' : `${o.label} members only`}
                </option>
              ))}
            </select>
          </div>
        )}

        {startFrom === 'blank' && (<>
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
                    if (option.value !== 'business case') setSubcategory('')
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

        {/* Sub-track (business cases only today) */}
        {showSubcategory && (
          <div className="mb-8">
            <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-3">
              Sub-track
            </label>
            <div className="grid grid-cols-2 gap-2">
              {BUSINESS_CASE_SUBCATEGORIES.map((slug) => {
                const isSelected = subcategory === slug
                return (
                  <button
                    key={slug}
                    onClick={() => {
                      setSubcategory(slug)
                      setError(null)
                    }}
                    className="text-left rounded-lg px-3 py-2 border transition-all text-[12px]"
                    style={{
                      background: isSelected ? '#0f5b8915' : '#111111',
                      borderColor: isSelected ? '#0f5b89' : 'rgba(255,255,255,0.1)',
                      color: isSelected ? '#0f5b89' : '#f5f3ee',
                    }}
                  >
                    {BUSINESS_CASE_SUBCATEGORY_LABELS[slug]}
                  </button>
                )
              })}
            </div>
          </div>
        )}

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

        </>)}

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
            disabled={busy || (startFrom === 'blank' ? !title.trim() || !track : startFrom === 'clone' ? !cloneId : !importDoc)}
            className="flex-1 py-3 rounded-xl text-[13px] font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: (startFrom === 'blank' ? !title.trim() || !track : startFrom === 'clone' ? !cloneId : !importDoc) ? 'rgba(255,255,255,0.08)' : '#1a6b3c',
            }}
          >
            {busy ? 'Working…' : startFrom === 'clone' ? 'Clone Scenario →' : startFrom === 'import' ? 'Import as Draft →' : 'Create Scenario →'}
          </button>
        </div>
      </div>
    </div>
  )
}
