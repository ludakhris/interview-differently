import { useState } from 'react'
import type { Scenario, ScenarioDisplay, ScenarioInterviewer, SidebarSection, SidebarItem } from '@id/types'
import { PersonaPicker } from './PersonaPicker'

interface BriefingEditorProps {
  scenario: Scenario
  onUpdate: (updates: Pick<Scenario, 'briefing' | 'estimatedMinutes' | 'display' | 'mode' | 'interviewer'>) => void
  onClose: () => void
}

const CONTEXT_STYLES: { value: ScenarioDisplay['contextStyle']; label: string; description: string }[] = [
  { value: 'monitor', label: 'Monitor', description: 'Operational dashboards and metric panels' },
  { value: 'table',   label: 'Table',   description: 'Tabular data and business case financials' },
  { value: 'finding', label: 'Finding', description: 'Security audit and compliance findings' },
]

const SECTION_STYLES: SidebarSection['style'][] = ['text', 'list', 'highlight']

export function BriefingEditor({ scenario, onUpdate, onClose }: BriefingEditorProps) {
  // ── Briefing fields ───────────────────────────────────────────────────────────
  const [situation, setSituation] = useState(scenario.briefing.situation)
  const [role, setRole] = useState(scenario.briefing.role)
  const [organisation, setOrganisation] = useState(scenario.briefing.organisation)
  const [reportsTo, setReportsTo] = useState(scenario.briefing.reportsTo)
  const [timeInRole, setTimeInRole] = useState(scenario.briefing.timeInRole)
  const [estimatedMinutes, setEstimatedMinutes] = useState(scenario.estimatedMinutes)
  const [mode, setMode] = useState<'text' | 'immersive'>(scenario.mode ?? 'text')
  const [interviewer, setInterviewer] = useState<ScenarioInterviewer | undefined>(scenario.interviewer)

  // ── Display config ────────────────────────────────────────────────────────────
  const initial = scenario.display
  const [displayEnabled, setDisplayEnabled] = useState(!!initial)
  const [contextStyle, setContextStyle] = useState<ScenarioDisplay['contextStyle']>(
    initial?.contextStyle ?? 'monitor'
  )

  const [alertEnabled, setAlertEnabled] = useState(!!initial?.alertBanner)
  const [alertIcon, setAlertIcon] = useState(initial?.alertBanner?.icon ?? '⚠')
  const [alertTitle, setAlertTitle] = useState(initial?.alertBanner?.title ?? '')
  const [alertBody, setAlertBody] = useState(initial?.alertBanner?.body ?? '')

  const [incidentEnabled, setIncidentEnabled] = useState(!!initial?.incidentMeta)
  const [incidentId, setIncidentId] = useState(initial?.incidentMeta?.id ?? '')
  const [incidentDiscoveredAt, setIncidentDiscoveredAt] = useState(initial?.incidentMeta?.discoveredAt ?? '')
  const [incidentSeverity, setIncidentSeverity] = useState(initial?.incidentMeta?.severity ?? '')
  const [incidentStatus, setIncidentStatus] = useState(initial?.incidentMeta?.status ?? '')
  const [incidentAssignedTo, setIncidentAssignedTo] = useState(initial?.incidentMeta?.assignedTo ?? '')
  const [incidentRegulatoryFlag, setIncidentRegulatoryFlag] = useState(initial?.incidentMeta?.regulatoryFlag ?? '')

  const [sections, setSections] = useState<SidebarSection[]>(initial?.sidebar ?? [])
  const [expandedSection, setExpandedSection] = useState<number | null>(null)

  // ── Save ──────────────────────────────────────────────────────────────────────

  function handleSave() {
    let display: ScenarioDisplay | undefined

    if (displayEnabled) {
      display = {
        contextStyle,
        sidebar: sections,
        ...(alertEnabled && alertTitle
          ? { alertBanner: { icon: alertIcon, title: alertTitle, body: alertBody } }
          : {}),
        ...(incidentEnabled && incidentId
          ? {
              incidentMeta: {
                id: incidentId,
                discoveredAt: incidentDiscoveredAt,
                severity: incidentSeverity,
                status: incidentStatus,
                ...(incidentAssignedTo ? { assignedTo: incidentAssignedTo } : {}),
                ...(incidentRegulatoryFlag ? { regulatoryFlag: incidentRegulatoryFlag } : {}),
              },
            }
          : {}),
      }
    }

    onUpdate({
      briefing: { situation, role, organisation, reportsTo, timeInRole },
      estimatedMinutes,
      display,
      mode,
      // Only persist interviewer when scenario is immersive — clearing it on text mode
      // prevents stale persona data from interfering if the author toggles back later.
      interviewer: mode === 'immersive' ? interviewer : undefined,
    })
    onClose()
  }

  // ── Sidebar helpers ───────────────────────────────────────────────────────────

  function addSection() {
    const next = sections.length
    setSections(prev => [...prev, { title: '', style: 'text', items: [] }])
    setExpandedSection(next)
  }

  function updateSection(i: number, updates: Partial<SidebarSection>) {
    setSections(prev => prev.map((s, idx) => (idx === i ? { ...s, ...updates } : s)))
  }

  function removeSection(i: number) {
    setSections(prev => prev.filter((_, idx) => idx !== i))
    setExpandedSection(null)
  }

  function addItem(sIdx: number) {
    updateSection(sIdx, { items: [...sections[sIdx].items, { label: '', value: '' }] })
  }

  function updateItem(sIdx: number, iIdx: number, updates: Partial<SidebarItem>) {
    const newItems = sections[sIdx].items.map((item, i) => (i === iIdx ? { ...item, ...updates } : item))
    updateSection(sIdx, { items: newItems })
  }

  function removeItem(sIdx: number, iIdx: number) {
    updateSection(sIdx, { items: sections[sIdx].items.filter((_, i) => i !== iIdx) })
  }

  // ── Shared styles ─────────────────────────────────────────────────────────────

  const inputCls =
    'bg-[#111111] border border-white/10 rounded-xl px-4 py-3 text-[13px] text-[#f5f3ee] placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors'

  const inputSmCls =
    'bg-[#111111] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-[#f5f3ee] placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors'

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 w-[460px] bg-[#0d0d0d] border-l border-white/10 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div>
            <h2 className="font-display font-bold text-[16px] text-[#f5f3ee]">Start Node</h2>
            <p className="text-[12px] text-white/30 mt-0.5">Briefing and display configuration</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/60 transition-colors text-[18px] leading-none"
          >
            ×
          </button>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ── Briefing ─────────────────────────────────────────────────────── */}

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-4">Briefing</p>

            <div className="space-y-5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-3">
                  Scenario Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { value: 'text',      label: 'Text',      description: 'Multiple-choice decisions; written feedback' },
                      { value: 'immersive', label: 'Immersive', description: 'AI interviewer asks questions; verbal responses' },
                    ] as const
                  ).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setMode(opt.value)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        mode === opt.value
                          ? 'border-[#2d9e5f]/50 bg-[#2d9e5f]/10'
                          : 'border-white/10 bg-[#111111] hover:border-white/20'
                      }`}
                    >
                      <p className={`text-[12px] font-semibold mb-1 ${mode === opt.value ? 'text-[#2d9e5f]' : 'text-[#f5f3ee]'}`}>
                        {opt.label}
                      </p>
                      <p className="text-[10px] text-white/30 leading-relaxed">{opt.description}</p>
                    </button>
                  ))}
                </div>
                {mode === 'immersive' && (
                  <p className="text-[11px] text-white/40 mt-2 leading-relaxed">
                    Each decision node also needs an audio script and a response prompt — edit those on the node itself.
                  </p>
                )}
              </div>

              {mode === 'immersive' && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-2">
                    Interviewer Persona
                  </label>
                  <p className="text-[11px] text-white/25 mb-3 leading-relaxed">
                    The presenter and voice are baked into every rendered clip. Changing them after publishing requires re-rendering all nodes.
                  </p>
                  <PersonaPicker value={interviewer} onChange={setInterviewer} />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-2">
                  The Situation
                </label>
                <p className="text-[11px] text-white/25 mb-2 leading-relaxed">
                  Set the scene. What's happening right now?
                </p>
                <textarea
                  value={situation}
                  onChange={e => setSituation(e.target.value)}
                  placeholder="e.g. It's 2:47 PM on a Tuesday. You're three months into your role when your pager fires…"
                  rows={4}
                  className={`${inputCls} w-full resize-none leading-relaxed`}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-3">
                  Your Role
                </label>
                <div className="space-y-3">
                  {(
                    [
                      { label: 'Position',      value: role,         setter: setRole,         placeholder: 'e.g. Junior Operations Analyst'          },
                      { label: 'Organisation',  value: organisation, setter: setOrganisation, placeholder: 'e.g. Fintech platform — 2.4M txns/day'    },
                      { label: 'Reports to',    value: reportsTo,    setter: setReportsTo,    placeholder: 'e.g. Senior Operations Manager'           },
                      { label: 'Time in role',  value: timeInRole,   setter: setTimeInRole,   placeholder: 'e.g. 3 months'                           },
                    ] as { label: string; value: string; setter: (v: string) => void; placeholder: string }[]
                  ).map(({ label, value, setter, placeholder }) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-[11px] font-medium text-white/30 w-24 flex-shrink-0">{label}</span>
                      <input
                        type="text"
                        value={value}
                        onChange={e => setter(e.target.value)}
                        placeholder={placeholder}
                        className={`${inputSmCls} flex-1`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-2">
                  Estimated Time
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={estimatedMinutes}
                    onChange={e => setEstimatedMinutes(Number(e.target.value))}
                    className={`${inputSmCls} w-20`}
                  />
                  <span className="text-[13px] text-white/30">minutes</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Divider ───────────────────────────────────────────────────────── */}
          <div className="border-t border-white/10" />

          {/* ── Display Config ────────────────────────────────────────────────── */}

          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/25">Display Config</p>
              <button
                onClick={() => setDisplayEnabled(v => !v)}
                className={`relative w-9 h-[18px] rounded-full transition-colors flex-shrink-0 ${displayEnabled ? 'bg-[#1a6b3c]' : 'bg-white/10'}`}
              >
                <span
                  className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${displayEnabled ? 'left-[19px]' : 'left-[2px]'}`}
                />
              </button>
            </div>

            {displayEnabled && (
              <div className="space-y-5">

                {/* Context Style */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-3">
                    Context Style
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {CONTEXT_STYLES.map(cs => (
                      <button
                        key={cs.value}
                        onClick={() => setContextStyle(cs.value)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          contextStyle === cs.value
                            ? 'border-[#2d9e5f]/50 bg-[#2d9e5f]/10'
                            : 'border-white/10 bg-[#111111] hover:border-white/20'
                        }`}
                      >
                        <p className={`text-[12px] font-semibold mb-1 ${contextStyle === cs.value ? 'text-[#2d9e5f]' : 'text-[#f5f3ee]'}`}>
                          {cs.label}
                        </p>
                        <p className="text-[10px] text-white/30 leading-relaxed">{cs.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Alert Banner */}
                <div className="border border-white/10 rounded-xl overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 bg-[#111111] hover:bg-white/5 transition-colors text-left"
                    onClick={() => setAlertEnabled(v => !v)}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${alertEnabled ? 'bg-[#2d9e5f]' : 'bg-white/20'}`} />
                      <span className="text-[12px] font-semibold text-[#f5f3ee]">Alert Banner</span>
                      <span className="text-[10px] text-white/30">Shown at top of step 1</span>
                    </div>
                    <span className="text-white/30 text-[10px]">{alertEnabled ? '▲' : '▼'}</span>
                  </button>
                  {alertEnabled && (
                    <div className="px-4 pb-4 pt-3 bg-[#0a0a0a] space-y-3">
                      <div className="flex gap-3">
                        <div className="w-16 flex-shrink-0">
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1.5">Icon</label>
                          <input
                            type="text"
                            value={alertIcon}
                            onChange={e => setAlertIcon(e.target.value)}
                            placeholder="⚠"
                            className={`${inputSmCls} w-full text-center`}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1.5">Title</label>
                          <input
                            type="text"
                            value={alertTitle}
                            onChange={e => setAlertTitle(e.target.value)}
                            placeholder="e.g. ACTIVE INCIDENT — P1"
                            className={`${inputSmCls} w-full`}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1.5">Body</label>
                        <textarea
                          value={alertBody}
                          onChange={e => setAlertBody(e.target.value)}
                          placeholder="Describe the alert context…"
                          rows={2}
                          className={`${inputSmCls} w-full resize-none leading-relaxed`}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Incident Meta */}
                <div className="border border-white/10 rounded-xl overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 bg-[#111111] hover:bg-white/5 transition-colors text-left"
                    onClick={() => setIncidentEnabled(v => !v)}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${incidentEnabled ? 'bg-[#2d9e5f]' : 'bg-white/20'}`} />
                      <span className="text-[12px] font-semibold text-[#f5f3ee]">Incident Metadata</span>
                      <span className="text-[10px] text-white/30">Ops sidebar incident details</span>
                    </div>
                    <span className="text-white/30 text-[10px]">{incidentEnabled ? '▲' : '▼'}</span>
                  </button>
                  {incidentEnabled && (
                    <div className="px-4 pb-4 pt-3 bg-[#0a0a0a] space-y-2.5">
                      {(
                        [
                          { label: 'Incident ID',   value: incidentId,             setter: setIncidentId,             placeholder: 'e.g. INC-2026-0341'     },
                          { label: 'Discovered At', value: incidentDiscoveredAt,   setter: setIncidentDiscoveredAt,   placeholder: 'e.g. 10:22 AM'           },
                          { label: 'Severity',      value: incidentSeverity,       setter: setIncidentSeverity,       placeholder: 'e.g. P1 / High'          },
                          { label: 'Status',        value: incidentStatus,         setter: setIncidentStatus,         placeholder: 'e.g. Open — Uncontained' },
                          { label: 'Assigned To',   value: incidentAssignedTo,     setter: setIncidentAssignedTo,     placeholder: 'Optional'                },
                          { label: 'Reg. Flag',     value: incidentRegulatoryFlag, setter: setIncidentRegulatoryFlag, placeholder: 'e.g. SOX / GLBA'         },
                        ] as { label: string; value: string; setter: (v: string) => void; placeholder: string }[]
                      ).map(({ label, value, setter, placeholder }) => (
                        <div key={label} className="flex items-center gap-3">
                          <span className="text-[10px] font-medium text-white/30 w-24 flex-shrink-0">{label}</span>
                          <input
                            type="text"
                            value={value}
                            onChange={e => setter(e.target.value)}
                            placeholder={placeholder}
                            className={`${inputSmCls} flex-1`}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sidebar Sections */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-white/40">
                      Sidebar Sections
                    </label>
                    <button
                      onClick={addSection}
                      className="text-[11px] font-medium text-[#2d9e5f] hover:text-[#4db87a] transition-colors"
                    >
                      + Add Section
                    </button>
                  </div>
                  {sections.length === 0 && (
                    <p className="text-[12px] text-white/25 py-4 text-center border border-dashed border-white/10 rounded-xl">
                      No sidebar sections yet.
                    </p>
                  )}
                  <div className="space-y-2">
                    {sections.map((section, sIdx) => (
                      <div key={sIdx} className="border border-white/10 rounded-xl overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-[#111111]">
                          <button
                            className="flex-1 flex items-center gap-2 text-left"
                            onClick={() => setExpandedSection(expandedSection === sIdx ? null : sIdx)}
                          >
                            <span className="text-white/30 text-[10px]">{expandedSection === sIdx ? '▲' : '▼'}</span>
                            <span className="text-[12px] font-semibold text-[#f5f3ee]">
                              {section.title || <span className="text-white/30">Untitled Section</span>}
                            </span>
                            <span className="text-[10px] text-white/25">
                              ({section.items.length} item{section.items.length !== 1 ? 's' : ''})
                            </span>
                          </button>
                          <button
                            onClick={() => removeSection(sIdx)}
                            className="text-[11px] text-red-400/40 hover:text-red-400 transition-colors px-1.5"
                          >
                            ✕
                          </button>
                        </div>
                        {expandedSection === sIdx && (
                          <div className="px-3 pb-3 pt-3 bg-[#0a0a0a] space-y-3">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={section.title}
                                onChange={e => updateSection(sIdx, { title: e.target.value })}
                                placeholder="Section title…"
                                className={`${inputSmCls} flex-1`}
                              />
                              <select
                                value={section.style ?? 'text'}
                                onChange={e => updateSection(sIdx, { style: e.target.value as SidebarSection['style'] })}
                                className="bg-[#111111] border border-white/10 rounded-lg px-2 py-2 text-[12px] text-[#f5f3ee] focus:outline-none focus:border-white/30"
                              >
                                {SECTION_STYLES.map(s => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1.5">
                              {section.items.map((item, iIdx) => (
                                <div key={iIdx} className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={item.label}
                                    onChange={e => updateItem(sIdx, iIdx, { label: e.target.value })}
                                    placeholder="Label"
                                    className="w-[85px] flex-shrink-0 bg-[#111111] border border-white/10 rounded-md px-2 py-1.5 text-[11px] text-[#f5f3ee] placeholder:text-white/20 focus:outline-none focus:border-white/30"
                                  />
                                  <input
                                    type="text"
                                    value={item.value}
                                    onChange={e => updateItem(sIdx, iIdx, { value: e.target.value })}
                                    placeholder="Value"
                                    className="flex-1 bg-[#111111] border border-white/10 rounded-md px-2 py-1.5 text-[11px] text-[#f5f3ee] placeholder:text-white/20 focus:outline-none focus:border-white/30"
                                  />
                                  <select
                                    value={item.emphasis ?? ''}
                                    onChange={e => updateItem(sIdx, iIdx, { emphasis: (e.target.value || undefined) as SidebarItem['emphasis'] })}
                                    className="w-20 flex-shrink-0 bg-[#111111] border border-white/10 rounded-md px-1.5 py-1.5 text-[10px] text-[#f5f3ee] focus:outline-none focus:border-white/30"
                                  >
                                    <option value="">—</option>
                                    <option value="danger">danger</option>
                                    <option value="warning">warning</option>
                                    <option value="success">success</option>
                                  </select>
                                  <button
                                    onClick={() => removeItem(sIdx, iIdx)}
                                    className="text-[10px] text-red-400/40 hover:text-red-400 transition-colors px-1 flex-shrink-0"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                            <button
                              onClick={() => addItem(sIdx)}
                              className="w-full text-[11px] text-white/30 hover:text-white/60 transition-colors py-1.5 border border-dashed border-white/10 rounded-lg hover:border-white/20"
                            >
                              + Add Item
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-white/10 text-[13px] text-white/50 hover:text-white/70 hover:border-white/20 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-lg bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[13px] font-semibold text-white transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </>
  )
}
