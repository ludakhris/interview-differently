import { useState, useEffect } from 'react'
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
import { scenarios as staticScenarios } from '@/lib/scenarios'
import type { Scenario } from '@id/types'

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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  function refresh() {
    setScenarios(listScenarios())
  }

  useEffect(() => {
    refresh()
  }, [])

  // Static scenarios not yet imported into the builder
  const importedIds = new Set(scenarios.map(s => s.scenarioId))
  const unimportedStatics = staticScenarios.filter(s => !importedIds.has(s.scenarioId))

  function handleImportAndEdit(scenario: Scenario) {
    importStaticScenario(scenario)
    navigate(`/builder/${scenario.scenarioId}`)
  }

  function handleDelete(id: string) {
    deleteScenario(id)
    refresh()
    setConfirmDelete(null)
  }

  function handleDuplicate(id: string) {
    duplicateScenario(id)
    refresh()
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
          <button
            onClick={() => navigate('/builder/new')}
            className="bg-[#1a6b3c] hover:bg-[#2d9e5f] text-white font-display font-semibold text-[13px] px-5 py-2.5 rounded-xl transition-colors"
          >
            + New Scenario
          </button>
        </div>

        {/* Table */}
        {scenarios.length === 0 && unimportedStatics.length === 0 ? (
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
          <div className="bg-[#111111] border border-white/10 rounded-2xl overflow-hidden">
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
                  const isImportedStatic = staticScenarios.some(s => s.scenarioId === scenario.scenarioId)

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
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => navigate(`/builder/${scenario.scenarioId}`)}
                            className="text-[11px] text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 transition-all"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDuplicate(scenario.scenarioId)}
                            className="text-[11px] text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 transition-all"
                          >
                            Duplicate
                          </button>
                          {(status === 'draft' || isImportedStatic) && (
                            <>
                              {confirmDelete === scenario.scenarioId ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleDelete(scenario.scenarioId)}
                                    className="text-[11px] text-red-400 hover:text-red-300 bg-red-400/10 border border-red-400/20 rounded-lg px-2 py-1.5 transition-all"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete(null)}
                                    className="text-[11px] text-white/30 hover:text-white/50 px-2 py-1.5"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDelete(scenario.scenarioId)}
                                  className="text-[11px] text-red-400/50 hover:text-red-400 bg-white/5 hover:bg-red-400/10 border border-white/10 hover:border-red-400/20 rounded-lg px-3 py-1.5 transition-all"
                                >
                                  Delete
                                </button>
                              )}
                            </>
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

        {/* Built-in scenarios */}
        {unimportedStatics.length > 0 && (
          <div className="mt-10">
            <div className="mb-5">
              <p className="text-[12px] font-medium tracking-widest uppercase text-white/30 mb-1">
                Built-in Scenarios
              </p>
              <p className="text-[13px] text-white/30">
                Pre-built scenarios included with the platform. Import one to view and edit it in the canvas — changes save to your account, not the original.
              </p>
            </div>
            <div className="bg-[#111111] border border-white/10 rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-white/30 px-6 py-4">Title</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-white/30 px-4 py-4">Track</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-white/30 px-4 py-4">Status</th>
                    <th className="px-4 py-4" />
                  </tr>
                </thead>
                <tbody>
                  {unimportedStatics.map((scenario, i) => {
                    const trackColor = TRACK_COLORS[scenario.track] ?? '#888'
                    return (
                      <tr
                        key={scenario.scenarioId}
                        className={`border-b border-white/5 ${i === unimportedStatics.length - 1 ? 'border-b-0' : ''}`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-1 h-8 rounded-full flex-shrink-0 opacity-50"
                              style={{ background: trackColor }}
                            />
                            <div>
                              <p className="text-[14px] font-semibold text-[#f5f3ee]/70">
                                {scenario.title}
                              </p>
                              <p className="text-[11px] text-white/25">
                                {scenario.nodes.length} node{scenario.nodes.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className="text-[11px] font-medium px-2 py-1 rounded-md opacity-60"
                            style={{ color: trackColor, background: `${trackColor}18` }}
                          >
                            {TRACK_LABELS[scenario.track] ?? scenario.track}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#2d9e5f] bg-[#2d9e5f]/10 border border-[#2d9e5f]/20 px-2 py-1 rounded-md">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2d9e5f]" />
                            Built-in
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => handleImportAndEdit(scenario)}
                              className="text-[11px] text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 transition-all"
                            >
                              Import &amp; Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
