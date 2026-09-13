// SetupEditor — in-place editor for scenario-level setup (#24 Phase H).
// Briefing, format (text / immersive + persona), track, rubric dimensions,
// and the candidate's sidebar / display config. Replaces the legacy
// BriefingEditor + RubricEditor side drawers.

import { useState } from 'react'
import type {
  RubricDimension,
  Scenario,
  ScenarioDisplay,
  ScenarioInterviewer,
  SidebarSection,
} from '@id/types'
import { BUSINESS_CASE_SUBCATEGORIES, BUSINESS_CASE_SUBCATEGORY_LABELS } from '@id/types'
import { TRACK_LABELS } from '@/lib/builderTemplates'
import { PersonaPicker } from '@/components/builder/PersonaPicker'
import type { ScenarioMeta } from '@/hooks/useBuilderDoc'
import { EditShell, Field, TextInput, Textarea, NumberInput, SelectInput, SectionLabel, AddButton, RemoveButton } from './shared'

interface Props {
  scenario: Scenario
  onDone: (updates: ScenarioMeta) => void
}

const CONTEXT_STYLES: { value: NonNullable<ScenarioDisplay['contextStyle']>; label: string }[] = [
  { value: 'monitor', label: 'Monitor — dashboards & metric panels' },
  { value: 'table', label: 'Table — tabular data & financials' },
  { value: 'finding', label: 'Finding — audit & compliance findings' },
]
const SECTION_STYLES = ['text', 'list', 'highlight'] as const
const MAX_DIMENSIONS = 6

export function SetupEditor({ scenario, onDone }: Props) {
  const [briefing, setBriefing] = useState(scenario.briefing)
  const [estimatedMinutes, setEstimatedMinutes] = useState(scenario.estimatedMinutes)
  const [mode, setMode] = useState<'text' | 'immersive'>(scenario.mode ?? 'text')
  const [interviewer, setInterviewer] = useState<ScenarioInterviewer | undefined>(scenario.interviewer)
  const [track, setTrack] = useState<string>(scenario.track)
  const [subcategory, setSubcategory] = useState<string>(scenario.subcategory ?? '')
  const [dimensions, setDimensions] = useState<RubricDimension[]>(scenario.rubric?.dimensions ?? [])

  const display = scenario.display
  const [sidebar, setSidebar] = useState<SidebarSection[]>(display?.sidebar ?? [])
  const [contextStyle, setContextStyle] = useState<ScenarioDisplay['contextStyle']>(display?.contextStyle ?? 'monitor')
  const [showAdvanced, setShowAdvanced] = useState(!!(display?.alertBanner || display?.incidentMeta))
  const [alert, setAlert] = useState(display?.alertBanner ?? { icon: '⚠', title: '', body: '' })
  const [incident, setIncident] = useState(
    display?.incidentMeta ?? { id: '', discoveredAt: '', severity: '', status: '', assignedTo: '', regulatoryFlag: '' },
  )

  const isBusinessCase = track === 'business case'

  function finish() {
    const hasDisplay = sidebar.length > 0 || alert.title.trim() || incident.id.trim()
    const nextDisplay: ScenarioDisplay | undefined = hasDisplay
      ? {
          contextStyle,
          sidebar: sidebar
            .map(s => ({ ...s, title: s.title.trim(), items: s.items.filter(i => i.label.trim() || i.value.trim()) }))
            .filter(s => s.title || s.items.length > 0),
          ...(alert.title.trim() ? { alertBanner: { icon: alert.icon, title: alert.title.trim(), body: alert.body } } : {}),
          ...(incident.id.trim()
            ? {
                incidentMeta: {
                  id: incident.id.trim(),
                  discoveredAt: incident.discoveredAt,
                  severity: incident.severity,
                  status: incident.status,
                  ...(incident.assignedTo ? { assignedTo: incident.assignedTo } : {}),
                  ...(incident.regulatoryFlag ? { regulatoryFlag: incident.regulatoryFlag } : {}),
                },
              }
            : {}),
        }
      : undefined
    onDone({
      briefing,
      estimatedMinutes: Number.isFinite(estimatedMinutes) && estimatedMinutes > 0 ? estimatedMinutes : scenario.estimatedMinutes,
      mode,
      // Only keep a persona while immersive so a later toggle back doesn't resurrect stale data.
      interviewer: mode === 'immersive' ? interviewer : undefined,
      track: track as Scenario['track'],
      subcategory: isBusinessCase && subcategory ? subcategory : undefined,
      rubric: { dimensions: dimensions.filter(d => d.name.trim()).map(d => ({ ...d, name: d.name.trim() })) },
      display: nextDisplay,
    })
  }

  // ── Sidebar helpers ─────────────────────────────────────────────────────────
  const updateSection = (i: number, u: Partial<SidebarSection>) =>
    setSidebar(prev => prev.map((s, idx) => (idx === i ? { ...s, ...u } : s)))
  const updateItem = (si: number, ii: number, u: Partial<{ label: string; value: string }>) =>
    updateSection(si, { items: sidebar[si].items.map((it, i) => (i === ii ? { ...it, ...u } : it)) })

  return (
    <EditShell emoji="📋" kindLabel="Scenario Setup" onDone={finish}>
      <SectionLabel label="Briefing — what the candidate reads first" />
      <Field label="Situation">
        <Textarea rows={4} value={briefing.situation} onChange={e => setBriefing({ ...briefing, situation: e.target.value })} placeholder="What's going on, and why the candidate is being pulled in." />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role"><TextInput value={briefing.role} onChange={e => setBriefing({ ...briefing, role: e.target.value })} placeholder="e.g. Junior Data Analyst" /></Field>
        <Field label="Organisation"><TextInput value={briefing.organisation} onChange={e => setBriefing({ ...briefing, organisation: e.target.value })} placeholder="e.g. Northwind Retail" /></Field>
        <Field label="Reports to"><TextInput value={briefing.reportsTo} onChange={e => setBriefing({ ...briefing, reportsTo: e.target.value })} placeholder="e.g. Marcus, Analytics Lead" /></Field>
        <Field label="Time in role"><TextInput value={briefing.timeInRole} onChange={e => setBriefing({ ...briefing, timeInRole: e.target.value })} placeholder="e.g. 3 months" /></Field>
      </div>

      <SectionLabel label="Format" />
      <div className="grid grid-cols-[1fr_140px] gap-3">
        <Field label="Mode">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: 'text', label: 'Text', hint: 'Multiple-choice decisions; written feedback' },
                { value: 'immersive', label: 'Immersive', hint: 'AI interviewer asks; candidate answers aloud' },
              ] as const
            ).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  mode === opt.value ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/10 bg-[#0a0a0a] hover:border-white/20'
                }`}
              >
                <p className="text-[13px] font-semibold text-white/85">{opt.label}</p>
                <p className="text-[11px] text-white/35 mt-0.5 leading-snug">{opt.hint}</p>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Minutes">
          <NumberInput min={1} value={estimatedMinutes} onChange={e => setEstimatedMinutes(Number(e.target.value))} />
        </Field>
      </div>
      {mode === 'immersive' && (
        <Field label="Interviewer persona — locked once nodes are rendered">
          <PersonaPicker value={interviewer} onChange={setInterviewer} />
        </Field>
      )}

      <SectionLabel label="Track" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Track">
          <SelectInput
            value={track}
            onChange={e => setTrack(e.target.value)}
            options={Object.entries(TRACK_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        {isBusinessCase && (
          <Field label="Case type">
            <SelectInput
              value={subcategory}
              onChange={e => setSubcategory(e.target.value)}
              options={[
                { value: '', label: '— pick one —' },
                ...BUSINESS_CASE_SUBCATEGORIES.map(v => ({ value: v, label: BUSINESS_CASE_SUBCATEGORY_LABELS[v] })),
              ]}
            />
          </Field>
        )}
      </div>

      <SectionLabel label={`Rubric dimensions — what the candidate is scored on (max ${MAX_DIMENSIONS})`} />
      <div className="flex flex-col gap-2">
        {dimensions.map((d, i) => (
          <div key={i} className="grid grid-cols-[180px_1fr_auto] gap-2 items-start">
            <TextInput value={d.name} onChange={e => setDimensions(prev => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" />
            <TextInput value={d.description} onChange={e => setDimensions(prev => prev.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} placeholder="What a strong answer shows" />
            <div className="pt-2"><RemoveButton onClick={() => setDimensions(prev => prev.filter((_, j) => j !== i))} /></div>
          </div>
        ))}
        {dimensions.length < MAX_DIMENSIONS && (
          <AddButton label="Add dimension" onClick={() => setDimensions(prev => [...prev, { name: '', description: '' }])} />
        )}
        <p className="text-[11px] text-white/30">Renaming a dimension doesn't rename it on phases or options — re-tick those chips after a rename.</p>
      </div>

      <SectionLabel label="Key facts sidebar — shown beside the case" />
      <div className="flex flex-col gap-3">
        {sidebar.map((section, si) => (
          <div key={si} className="border border-white/10 rounded-lg p-3 bg-[#0a0a0a]/60 flex flex-col gap-2">
            <div className="grid grid-cols-[1fr_130px_auto] gap-2 items-center">
              <TextInput value={section.title} onChange={e => updateSection(si, { title: e.target.value })} placeholder="Section title, e.g. Key facts" />
              <SelectInput value={section.style ?? 'text'} onChange={e => updateSection(si, { style: e.target.value as SidebarSection['style'] })} options={SECTION_STYLES.map(v => ({ value: v, label: v }))} />
              <RemoveButton onClick={() => setSidebar(prev => prev.filter((_, j) => j !== si))} title="Remove section" />
            </div>
            {section.items.map((item, ii) => (
              <div key={ii} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center pl-3">
                <TextInput value={item.label} onChange={e => updateItem(si, ii, { label: e.target.value })} placeholder="Label" />
                <TextInput value={item.value} onChange={e => updateItem(si, ii, { value: e.target.value })} placeholder="Value" />
                <RemoveButton onClick={() => updateSection(si, { items: section.items.filter((_, j) => j !== ii) })} />
              </div>
            ))}
            <div className="pl-3">
              <AddButton label="Add fact" onClick={() => updateSection(si, { items: [...section.items, { label: '', value: '' }] })} />
            </div>
          </div>
        ))}
        <AddButton label="Add section" onClick={() => setSidebar(prev => [...prev, { title: '', style: 'text', items: [] }])} />
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced(v => !v)}
        className="text-[11px] font-semibold text-white/40 hover:text-white/70 text-left transition-colors"
      >
        {showAdvanced ? '▾' : '▸'} Advanced display — context style, alert banner, incident header (ops / risk tracks)
      </button>
      {showAdvanced && (
        <div className="flex flex-col gap-3 pl-3 border-l border-white/10">
          <Field label="Context panel style">
            <SelectInput value={contextStyle ?? 'monitor'} onChange={e => setContextStyle(e.target.value as ScenarioDisplay['contextStyle'])} options={CONTEXT_STYLES} />
          </Field>
          <Field label="Alert banner (leave title blank for none)">
            <div className="grid grid-cols-[56px_1fr] gap-2">
              <TextInput value={alert.icon} onChange={e => setAlert({ ...alert, icon: e.target.value })} placeholder="⚠" />
              <TextInput value={alert.title} onChange={e => setAlert({ ...alert, title: e.target.value })} placeholder="Title" />
            </div>
            <Textarea rows={2} value={alert.body} onChange={e => setAlert({ ...alert, body: e.target.value })} placeholder="Body" />
          </Field>
          <Field label="Incident header (leave id blank for none)">
            <div className="grid grid-cols-3 gap-2">
              <TextInput value={incident.id} onChange={e => setIncident({ ...incident, id: e.target.value })} placeholder="INC-1042" />
              <TextInput value={incident.discoveredAt} onChange={e => setIncident({ ...incident, discoveredAt: e.target.value })} placeholder="Discovered at" />
              <TextInput value={incident.severity} onChange={e => setIncident({ ...incident, severity: e.target.value })} placeholder="Severity" />
              <TextInput value={incident.status} onChange={e => setIncident({ ...incident, status: e.target.value })} placeholder="Status" />
              <TextInput value={incident.assignedTo ?? ''} onChange={e => setIncident({ ...incident, assignedTo: e.target.value })} placeholder="Assigned to (optional)" />
              <TextInput value={incident.regulatoryFlag ?? ''} onChange={e => setIncident({ ...incident, regulatoryFlag: e.target.value })} placeholder="Regulatory flag (optional)" />
            </div>
          </Field>
        </div>
      )}
    </EditShell>
  )
}
