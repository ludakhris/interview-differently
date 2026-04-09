import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Nav } from '@/components/Nav'
import { MobileWarning } from '@/components/builder/MobileWarning'
import {
  listScenarios,
  deleteScenario,
  duplicateScenario,
  importStaticScenario,
} from '@/services/builderService'
import { TRACK_LABELS } from '@/lib/builderTemplates'
import { downloadScenarioYaml, yamlToScenario } from '@/lib/yamlScenario'
import type { Scenario } from '@id/types'

// ── Row action menu ───────────────────────────────────────────────────────────

interface MenuAction {
  label: string
  onClick: () => void
  danger?: boolean
}

function RowMenu({ actions }: { actions: MenuAction[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-[13px] text-white/30 hover:text-white/60 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg w-8 h-8 flex items-center justify-center transition-all"
      >
        ···
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-xl z-20 overflow-hidden">
          {actions.map(action => (
            <button
              key={action.label}
              onClick={() => { action.onClick(); setOpen(false) }}
              className={`w-full text-left px-4 py-2.5 text-[12px] font-medium transition-colors hover:bg-white/5 ${
                action.danger ? 'text-red-400/70 hover:text-red-400' : 'text-white/50 hover:text-white/80'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

const TRACK_COLORS: Record<string, string> = {
  operations: '#e05a2b',
  business: '#2b7de0',
  risk: '#c0392b',
  'customer-success': '#2d9e5f',
  general: '#7b3fa0',
  custom: '#888888',
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

export function BuilderListPage() {
  const navigate = useNavigate()
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    setIsLoading(true)
    try {
      const result = await listScenarios()
      setScenarios(result)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  function handleYamlImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null)
    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const scenario = yamlToScenario(ev.target?.result as string)
        const existing = scenarios.find(s => s.scenarioId === scenario.scenarioId)
        if (existing) {
          setImportError(`A scenario with ID "${scenario.scenarioId}" already exists.`)
          return
        }
        await importStaticScenario({ ...scenario, builderMeta: undefined } as Scenario)
        await refresh()
        navigate(`/builder/${scenario.scenarioId}`)
      } catch {
        setImportError('Invalid YAML file. Please check the format and try again.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleDelete(id: string) {
    await deleteScenario(id)
    await refresh()
    setConfirmDelete(null)
  }

  async function handleDuplicate(id: string) {
    await duplicateScenario(id)
    await refresh()
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <MobileWarning />
      <Nav />
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
          <div>
            <p className="text-[12px] font-medium tracking-widest uppercase text-white/30 mb-1">
              Scenario Builder
            </p>
            <h2 className="font-display font-extrabold text-[32px] text-[#f5f3ee] tracking-tight">
              Your Scenarios
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".yaml,.yml"
              onChange={handleYamlImport}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-[13px] font-medium text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl px-4 py-2.5 transition-all"
            >
              Import YAML
            </button>
            <button
              onClick={() => navigate('/builder/new')}
              className="bg-[#1a6b3c] hover:bg-[#2d9e5f] text-white font-display font-semibold text-[13px] px-5 py-2.5 rounded-xl transition-colors"
            >
              + New Scenario
            </button>
          </div>
          {importError && (
            <p className="w-full text-[12px] text-red-400 mt-2">{importError}</p>
          )}
        </div>

        {/* Loading state */}
        {isLoading ? (
          <div className="bg-[#111111] border border-white/10 rounded-2xl p-16 text-center">
            <p className="text-[14px] text-white/30">Loading scenarios...</p>
          </div>
        ) : scenarios.length === 0 ? (
          <div className="bg-[#111111] border border-white/10 rounded-2xl p-16 text-center">
            <p className="text-[16px] font-semibold text-[#f5f3ee] mb-2">No scenarios yet.</p>
            <p className="text-[14px] text-white/30 mb-8">
              Create your first scenario to get started.
            </p>
            <button
              onClick={() => navigate('/builder/new')}
              className="bg-[#1a6b3c] hover:bg-[#2d9e5f] text-white font-semibold text-[13px] px-6 py-3 rounded-xl transition-colors"
            >
              Create First Scenario
            </button>
          </div>
        ) : scenarios.length > 0 ? (
          <div className="bg-[#111111] border border-white/10 rounded-2xl">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-white/30 px-6 py-4">
                    Title
                  </th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-white/30 px-4 py-4">
                    Track
                  </th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-white/30 px-4 py-4">
                    Status
                  </th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-white/30 px-4 py-4">
                    Last edited
                  </th>
                  <th className="px-4 py-4" />
                </tr>
              </thead>
              <tbody>
                {scenarios.map((scenario, i) => {
                  const trackColor = TRACK_COLORS[scenario.track] ?? '#888'
                  const status = scenario.builderMeta?.status ?? 'draft'
                  const lastEdited = scenario.builderMeta?.lastEditedAt ?? ''

                  return (
                    <tr
                      key={scenario.scenarioId}
                      className={`border-b border-white/5 hover:bg-white/3 transition-colors ${i === scenarios.length - 1 ? 'border-b-0' : ''}`}
                    >
                      <td className="px-6 py-4">
                        <div
                          className="flex items-center gap-3 cursor-pointer group"
                          onClick={() => navigate(`/builder/${scenario.scenarioId}`)}
                        >
                          <div
                            className="w-1 h-8 rounded-full flex-shrink-0"
                            style={{ background: trackColor }}
                          />
                          <div>
                            <p className="text-[14px] font-semibold text-[#f5f3ee] group-hover:text-white transition-colors">
                              {scenario.title || 'Untitled Scenario'}
                            </p>
                            <p className="text-[11px] text-white/30">
                              {scenario.nodes.length} node{scenario.nodes.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className="text-[11px] font-medium px-2 py-1 rounded-md"
                          style={{
                            color: trackColor,
                            background: `${trackColor}18`,
                          }}
                        >
                          {TRACK_LABELS[scenario.track] ?? scenario.track}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {status === 'published' ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#2d9e5f] bg-[#2d9e5f]/10 border border-[#2d9e5f]/20 px-2 py-1 rounded-md">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2d9e5f]" />
                            Published
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-1 rounded-md">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            Draft
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-[12px] text-white/30">
                          {lastEdited ? formatDate(lastEdited) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end">
                          {confirmDelete === scenario.scenarioId ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(scenario.scenarioId)}
                                className="text-[11px] text-red-400 hover:text-red-300 bg-red-400/10 border border-red-400/20 rounded-lg px-2 py-1.5 transition-all"
                              >
                                Confirm delete
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="text-[11px] text-white/30 hover:text-white/50 px-2 py-1.5"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <RowMenu actions={[
                              { label: 'Edit', onClick: () => navigate(`/builder/${scenario.scenarioId}`) },
                              { label: 'Duplicate', onClick: () => handleDuplicate(scenario.scenarioId) },
                              { label: 'Export YAML', onClick: () => downloadScenarioYaml(scenario) },
                              { label: 'Delete', onClick: () => setConfirmDelete(scenario.scenarioId), danger: true },
                            ]} />
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

      </div>
    </div>
  )
}
