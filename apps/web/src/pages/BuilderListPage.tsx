import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { useRole } from '@/hooks/useRole'
import { MobileWarning } from '@/components/builder/MobileWarning'
import {
  listScenarios,
  getScenario,
  deleteScenario,
  duplicateScenario,
  importStaticScenario,
} from '@/services/builderService'
import { TRACK_LABELS } from '@/lib/builderTemplates'
import { downloadScenarioYaml, downloadScenarioJson, yamlToScenario } from '@/lib/yamlScenario'
import {
  bulkRenderAllMedia,
  type BulkRenderProgress,
  type BulkRenderSummary,
} from '@/services/scenarioMediaService'
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
  'data-analytics': '#0a9396',
  general: '#7b3fa0',
  custom: '#888888',
}

const TRACK_ORDER: string[] = ['business case', 'data-analytics', 'operations', 'business', 'risk', 'customer-success', 'general', 'custom']

// Filter / collapse prefs — per-browser conveniences, safe to lose.
const PREF_KEY = 'builder-list-prefs'
function readPref(k: string): string {
  try { return (JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as Record<string, string>)[k] ?? '' } catch { return '' }
}
function writePref(k: string, v: string) {
  try { const all = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}'); all[k] = v; localStorage.setItem(PREF_KEY, JSON.stringify(all)) } catch { /* ignore */ }
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
  const { getToken } = useAuth()
  const { isAdmin } = useRole()
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Bulk re-render state — null when idle, in-flight progress, or final summary.
  const [renderProgress, setRenderProgress] = useState<BulkRenderProgress | null>(null)
  const [renderSummary, setRenderSummary] = useState<BulkRenderSummary | null>(null)
  const [isRendering, setIsRendering] = useState(false)

  async function handleBulkRender() {
    // The list holds stripped summaries (no nodes) — pull the full payload
    // for each published immersive scenario before counting / rendering.
    const token = (await getToken()) ?? undefined
    const full = (
      await Promise.all(
        scenarios
          .filter((s) => s.mode === 'immersive' && s.builderMeta?.status === 'published')
          .map((s) => getScenario(s.scenarioId, token)),
      )
    ).filter((s): s is Scenario => s !== null)
    const totalNodes = full
      .reduce(
        (sum, s) =>
          sum +
          (s.nodes ?? []).filter(
            (n) =>
              n.type === 'decision' &&
              ((n.audioScript ?? '').trim() || (n.narrative ?? '').trim()),
          ).length,
        0,
      )
    if (totalNodes === 0) {
      alert('No published immersive scenarios with renderable nodes.')
      return
    }
    if (
      !confirm(
        `Re-render media for ${totalNodes} node${totalNodes === 1 ? '' : 's'}? ` +
          `Each render takes 30-180 seconds via D-ID. Already-current nodes are skipped automatically.`,
      )
    ) {
      return
    }

    setIsRendering(true)
    setRenderSummary(null)
    setRenderProgress(null)
    try {
      const summary = await bulkRenderAllMedia(full as unknown as Parameters<typeof bulkRenderAllMedia>[0], {
        onBeforeRender: (p) => setRenderProgress(p),
      })
      setRenderSummary(summary)
      setRenderProgress(null)
    } finally {
      setIsRendering(false)
    }
  }

  async function refresh() {
    setIsLoading(true)
    try {
      const result = await listScenarios()
      // Institution-admins can only edit their own institutions' scenarios
      // (#15) — public ones are read-only to them, so keep them off the list.
      setScenarios(isAdmin ? result : result.filter((s) => s.institutionId))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  // ── Search / filters / track groups (#29) ─────────────────────────────────
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published'>(() => (readPref('status') as 'all' | 'draft' | 'published') || 'all')
  const [ownerFilter, setOwnerFilter] = useState<string>(() => readPref('owner') || '')
  const [collapsedTracks, setCollapsedTracks] = useState<Set<string>>(() => new Set((readPref('collapsed') || '').split(',').filter(Boolean)))
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { writePref('status', statusFilter) }, [statusFilter])
  useEffect(() => { writePref('owner', ownerFilter) }, [ownerFilter])
  useEffect(() => { writePref('collapsed', [...collapsedTracks].join(',')) }, [collapsedTracks])
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const ownerOptions = (() => {
    const m = new Map<string, string>()
    scenarios.forEach(s => m.set(s.institutionId ?? 'public', s.institutionName ?? 'Public'))
    return [...m.entries()].map(([id, label]) => ({ id, label }))
  })()

  const q = query.trim().toLowerCase()
  const filtered = scenarios.filter(s => {
    if (statusFilter !== 'all' && (s.builderMeta?.status ?? 'draft') !== statusFilter) return false
    if (ownerFilter && (s.institutionId ?? 'public') !== ownerFilter) return false
    if (!q) return true
    const hay = [s.title, s.scenarioId, s.track, TRACK_LABELS[s.track], s.subcategory, s.institutionName, s.briefing?.role, s.briefing?.organisation]
      .filter(Boolean).join(' ').toLowerCase()
    return q.split(/\s+/).every(term => hay.includes(term))
  })

  const trackGroups = (() => {
    const map = new Map<string, Scenario[]>()
    filtered.forEach(s => { if (!map.has(s.track)) map.set(s.track, []); map.get(s.track)!.push(s) })
    map.forEach(items => items.sort((a, b) => (b.builderMeta?.lastEditedAt ?? '').localeCompare(a.builderMeta?.lastEditedAt ?? '')))
    return [...map.entries()]
      .sort(([a], [b]) => {
        const ia = TRACK_ORDER.indexOf(a), ib = TRACK_ORDER.indexOf(b)
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
      })
      .map(([track, items]) => ({ track, items }))
  })()

  function toggleTrack(track: string) {
    setCollapsedTracks(prev => { const n = new Set(prev); if (n.has(track)) n.delete(track); else n.add(track); return n })
  }

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

  // Rows are stripped summaries — fetch the full document before exporting.
  async function handleExport(id: string, format: 'yaml' | 'json') {
    const full = await getScenario(id)
    if (!full) { alert('Could not load the scenario to export.'); return }
    if (format === 'yaml') downloadScenarioYaml(full)
    else downloadScenarioJson(full)
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
            {isAdmin && (
            <button
              onClick={handleBulkRender}
              disabled={isRendering}
              title="Re-render every published immersive scenario node via D-ID. Idempotent — already-current nodes skip in <1s."
              className="text-[13px] font-medium text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl px-4 py-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRendering ? 'Re-rendering…' : 'Re-render all media'}
            </button>
            )}
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

          {/* Bulk-render banner — live progress while running, summary when done. */}
          {(renderProgress || renderSummary) && (
            <div className="w-full bg-[#111111] border border-white/10 rounded-xl px-4 py-3 mt-2">
              {renderProgress && (
                <div>
                  <p className="text-[12px] font-semibold text-[#f5f3ee]">
                    Rendering {renderProgress.index + 1} of {renderProgress.total} —{' '}
                    <span className="text-slate-mid">{renderProgress.scenarioTitle}</span>{' '}
                    <span className="text-white/30 font-mono">/{renderProgress.nodeId}</span>
                  </p>
                  <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green transition-all duration-300"
                      style={{ width: `${(renderProgress.index / renderProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              {renderSummary && !renderProgress && (
                <div>
                  <p className="text-[12px] text-[#f5f3ee]">
                    <span className="font-semibold text-green-light">✓ Done.</span>{' '}
                    Rendered <strong>{renderSummary.rendered}</strong>, already current{' '}
                    <strong>{renderSummary.alreadyCurrent}</strong>
                    {renderSummary.skippedNoPersona > 0 && (
                      <>, skipped <strong>{renderSummary.skippedNoPersona}</strong> (no persona)</>
                    )}
                    {renderSummary.failed > 0 && (
                      <>, <span className="text-red-400">failed <strong>{renderSummary.failed}</strong></span></>
                    )}
                    .{' '}
                    <button
                      onClick={() => setRenderSummary(null)}
                      className="ml-2 text-slate-mid hover:text-[#f5f3ee] transition-colors"
                    >
                      Dismiss
                    </button>
                  </p>
                  {renderSummary.failures.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {renderSummary.failures.map((f) => (
                        <li key={`${f.scenarioId}/${f.nodeId}`} className="text-[11px] text-red-400/80">
                          <span className="font-mono">{f.scenarioId}/{f.nodeId}</span>: {f.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search + filters */}
        <div className="sticky top-0 z-10 -mx-2 px-2 py-3 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/[0.06] mb-4 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search scenarios…  ( / )"
              className="w-full bg-[#111111] border border-white/10 rounded-lg pl-3 pr-8 py-2 text-[13px] text-[#f5f3ee] placeholder:text-white/25 focus:outline-none focus:border-white/30 transition-colors"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 text-[14px]" title="Clear">×</button>
            )}
          </div>
          <div className="flex items-center rounded-lg border border-white/10 overflow-hidden text-[12px] font-medium">
            {(['all', 'draft', 'published'] as const).map(v => (
              <button
                key={v}
                onClick={() => setStatusFilter(v)}
                className={`px-3 py-2 transition-colors ${statusFilter === v ? 'bg-white/10 text-[#f5f3ee]' : 'text-white/40 hover:text-white/70'}`}
              >
                {v === 'all' ? 'All' : v === 'draft' ? 'Drafts' : 'Published'}
              </button>
            ))}
          </div>
          {isAdmin && ownerOptions.length > 1 && (
            <select
              value={ownerFilter}
              onChange={e => setOwnerFilter(e.target.value)}
              className="bg-[#111111] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white/70 focus:outline-none focus:border-white/30"
            >
              <option value="">All owners</option>
              {ownerOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          )}
          <span className="text-[11px] text-white/30 ml-auto">
            {filtered.length === scenarios.length ? `${scenarios.length} scenarios` : `${filtered.length} of ${scenarios.length}`}
          </span>
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
        ) : filtered.length === 0 ? (
          <div className="bg-[#111111] border border-white/10 rounded-2xl p-10 text-center">
            <p className="text-[13px] text-white/40">Nothing matches — <button onClick={() => { setQuery(''); setStatusFilter('all'); setOwnerFilter('') }} className="text-emerald-400 hover:underline">clear filters</button>.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {trackGroups.map(group => {
              const color = TRACK_COLORS[group.track] ?? '#888'
              const collapsed = collapsedTracks.has(group.track) && !query
              return (
                <div key={group.track} className="bg-[#111111] border border-white/10 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => toggleTrack(group.track)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
                  >
                    <span className="text-[10px] text-white/30 w-3">{collapsed ? '▸' : '▾'}</span>
                    <span className="w-2 h-2 rounded-full flex-none" style={{ background: color }} />
                    <span className="text-[13px] font-bold text-[#f5f3ee]">{TRACK_LABELS[group.track] ?? group.track}</span>
                    <span className="text-[11px] text-white/30">{group.items.length}</span>
                    <span className="ml-auto text-[10px] text-white/25">
                      {group.items.filter(s => s.builderMeta?.status === 'published').length} published
                    </span>
                  </button>
                  {!collapsed && (
                    <ul className="border-t border-white/[0.06]">
                      {group.items.map(scenario => {
                        const status = scenario.builderMeta?.status ?? 'draft'
                        const lastEdited = scenario.builderMeta?.lastEditedAt ?? ''
                        return (
                          <li
                            key={scenario.scenarioId}
                            className="flex items-center gap-3 px-4 py-2 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.03] transition-colors"
                          >
                            <button
                              onClick={() => navigate(`/builder/${scenario.scenarioId}`)}
                              className="flex-1 min-w-0 flex items-center gap-3 text-left group"
                            >
                              <span className="text-[13px] font-semibold text-[#f5f3ee] group-hover:text-white truncate">
                                {scenario.title || 'Untitled Scenario'}
                              </span>
                              {scenario.subcategory && (
                                <span className="text-[10px] text-white/30 flex-none hidden md:inline">{scenario.subcategory}</span>
                              )}
                              {scenario.mode === 'immersive' && (
                                <span className="text-[10px] font-semibold text-white/40 flex-none" title="Immersive (AI interviewer)">🎙</span>
                              )}
                            </button>
                            <span
                              className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded flex-none ${
                                scenario.institutionName ? 'bg-green/20 text-green-light' : 'bg-white/[0.06] text-white/35'
                              }`}
                              title={scenario.institutionName ? `Private to ${scenario.institutionName}` : 'Visible to every user'}
                            >
                              {scenario.institutionName ?? 'Public'}
                            </span>
                            <span className="text-[11px] text-white/30 flex-none w-14 text-right hidden sm:inline">{scenario.estimatedMinutes} min</span>
                            <span
                              className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md flex-none w-[84px] justify-center ${
                                status === 'published'
                                  ? 'text-[#2d9e5f] bg-[#2d9e5f]/10 border border-[#2d9e5f]/20'
                                  : 'text-amber-400 bg-amber-400/10 border border-amber-400/20'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${status === 'published' ? 'bg-[#2d9e5f]' : 'bg-amber-400'}`} />
                              {status === 'published' ? 'Published' : 'Draft'}
                            </span>
                            <span className="text-[11px] text-white/30 flex-none w-[84px] text-right hidden md:inline">
                              {lastEdited ? formatDate(lastEdited) : '—'}
                            </span>
                            <div className="flex-none flex items-center">
                              {confirmDelete === scenario.scenarioId ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleDelete(scenario.scenarioId)}
                                    className="text-[11px] text-red-400 hover:text-red-300 bg-red-400/10 border border-red-400/20 rounded-lg px-2 py-1 transition-all"
                                  >
                                    Confirm delete
                                  </button>
                                  <button onClick={() => setConfirmDelete(null)} className="text-[11px] text-white/30 hover:text-white/50 px-2 py-1">
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <RowMenu actions={[
                                  { label: 'Edit', onClick: () => navigate(`/builder/${scenario.scenarioId}`) },
                                  { label: 'Duplicate', onClick: () => handleDuplicate(scenario.scenarioId) },
                                  { label: 'Export YAML', onClick: () => handleExport(scenario.scenarioId, 'yaml') },
                                  { label: 'Export JSON', onClick: () => handleExport(scenario.scenarioId, 'json') },
                                  { label: 'Delete', onClick: () => setConfirmDelete(scenario.scenarioId), danger: true },
                                ]} />
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
