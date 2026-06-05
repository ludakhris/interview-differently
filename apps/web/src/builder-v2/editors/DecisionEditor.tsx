// DecisionEditor — inline editor for decision nodes.
// Covers: narrative, Key Data (contextPanels), choices (text + quality + target).

import { useState } from 'react'
import type { ScenarioNode, Choice, ContextPanel, QualitySignal } from '@id/types'
import {
  EditShell, Field, TextInput, Textarea, SelectInput, SectionLabel, AddButton, RemoveButton,
} from './shared'

const CHOICE_IDS = ['A', 'B', 'C', 'D'] as const

const QUALITY_OPTIONS = [
  { value: 'strong', label: 'Strong' },
  { value: 'proficient', label: 'Proficient' },
  { value: 'developing', label: 'Developing' },
]

const QUALITY_COLORS: Record<string, string> = {
  strong: 'text-emerald-300',
  proficient: 'text-teal-300',
  developing: 'text-amber-300',
}

interface Props {
  node: ScenarioNode
  allNodes: ScenarioNode[]
  onDone: (updated: ScenarioNode) => void
}

export function DecisionEditor({ node, allNodes, onDone }: Props) {
  const [narrative, setNarrative] = useState(node.narrative ?? '')
  const [panels, setPanels] = useState<ContextPanel[]>(node.contextPanels ?? [])
  const [choices, setChoices] = useState<Choice[]>(node.choices ?? [])

  // ── Choices ────────────────────────────────────────────────────────────────

  function updateChoice(idx: number, patch: Partial<Choice>) {
    setChoices(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c))
  }

  function updateChoiceSignal(idx: number, quality: string) {
    setChoices(prev => prev.map((c, i) => {
      if (i !== idx) return c
      const sig: QualitySignal = { dimension: c.qualitySignals?.[0]?.dimension ?? 'Structure', quality: quality as QualitySignal['quality'] }
      return { ...c, qualitySignals: [sig] }
    }))
  }

  function updateChoiceSignalDimension(idx: number, dimension: string) {
    setChoices(prev => prev.map((c, i) => {
      if (i !== idx) return c
      const sig: QualitySignal = { dimension, quality: c.qualitySignals?.[0]?.quality ?? 'developing' }
      return { ...c, qualitySignals: [sig] }
    }))
  }

  function addChoice() {
    const usedIds = new Set(choices.map(c => c.id))
    const nextId = CHOICE_IDS.find(id => !usedIds.has(id))
    if (!nextId) return
    setChoices(prev => [...prev, {
      id: nextId,
      text: '',
      nextNodeId: '',
      qualitySignals: [{ dimension: 'Structure', quality: 'developing' }],
    }])
  }

  function removeChoice(idx: number) {
    setChoices(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Context Panels (Key Data) ──────────────────────────────────────────────

  function addPanel() {
    setPanels(prev => [...prev, { label: '', value: '', type: 'metric' }])
  }

  function updatePanel(idx: number, patch: Partial<ContextPanel>) {
    setPanels(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p))
  }

  function removePanel(idx: number) {
    setPanels(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Target options ─────────────────────────────────────────────────────────

  const targetOptions = [
    { value: '', label: '— unset —' },
    ...allNodes
      .filter(n => n.nodeId !== node.nodeId)
      .map(n => ({
        value: n.nodeId,
        label: `${n.nodeId} — ${n.narrative?.slice(0, 35) ?? n.type}${(n.narrative?.length ?? 0) > 35 ? '…' : ''}`,
      })),
  ]

  // ── Save ───────────────────────────────────────────────────────────────────

  function handleDone() {
    onDone({ ...node, narrative, contextPanels: panels.length ? panels : undefined, choices })
  }

  return (
    <EditShell emoji="🔀" kindLabel="Decision" onDone={handleDone}>
      {/* Narrative */}
      <Field label="Question / narrative">
        <Textarea
          value={narrative}
          onChange={e => setNarrative(e.target.value)}
          rows={3}
          placeholder="The question or scenario the candidate is responding to."
        />
      </Field>

      {/* Key Data panels */}
      <div className="flex flex-col gap-2">
        <SectionLabel label="Key Data tiles (optional)" />
        {panels.map((panel, i) => (
          <div key={i} className="flex flex-col gap-2 p-3 border border-white/[0.06] rounded-xl bg-white/[0.01]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Tile {i + 1}</span>
              <RemoveButton onClick={() => removePanel(i)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <TextInput
                value={panel.label}
                onChange={e => updatePanel(i, { label: e.target.value })}
                placeholder="Label  e.g. Revenue"
              />
              <TextInput
                value={panel.value}
                onChange={e => updatePanel(i, { value: e.target.value })}
                placeholder="Value  e.g. $24M"
              />
              <TextInput
                value={panel.unit ?? ''}
                onChange={e => updatePanel(i, { unit: e.target.value || undefined })}
                placeholder="Unit (optional)  e.g. %"
              />
              <TextInput
                value={panel.caption ?? ''}
                onChange={e => updatePanel(i, { caption: e.target.value || undefined })}
                placeholder="Caption (optional)"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={panel.hero ?? false}
                onChange={e => updatePanel(i, { hero: e.target.checked || undefined })}
                className="accent-emerald-400"
              />
              <span className="text-[11px] text-white/40">Hero tile — displays large</span>
            </label>
          </div>
        ))}
        <AddButton onClick={addPanel} label="Add Key Data tile" />
      </div>

      {/* Choices */}
      <div className="flex flex-col gap-2">
        <SectionLabel label="Options" />
        {choices.map((choice, i) => {
          const quality = choice.qualitySignals?.[0]?.quality ?? 'developing'
          const dimension = choice.qualitySignals?.[0]?.dimension ?? 'Structure'
          return (
            <div key={choice.id} className="flex flex-col gap-2 p-3 border border-white/[0.06] rounded-xl bg-white/[0.01]">
              {/* Row 1: badge + text */}
              <div className="flex items-start gap-2">
                <span className="w-[22px] h-[22px] rounded-[6px] bg-white/[0.06] border border-white/10 text-[11px] font-bold flex items-center justify-center flex-none mt-1.5">
                  {choice.id}
                </span>
                <Textarea
                  value={choice.text}
                  onChange={e => updateChoice(i, { text: e.target.value })}
                  rows={2}
                  placeholder="Option text shown to the candidate"
                />
                <RemoveButton onClick={() => removeChoice(i)} />
              </div>
              {/* Row 2: quality + dimension + target */}
              <div className="flex gap-2 pl-7">
                <div className="w-32 flex-none">
                  <SelectInput
                    value={quality}
                    onChange={e => updateChoiceSignal(i, e.target.value)}
                    options={QUALITY_OPTIONS}
                  />
                </div>
                <TextInput
                  value={dimension}
                  onChange={e => updateChoiceSignalDimension(i, e.target.value)}
                  placeholder="Rubric dimension"
                  className={`flex-1 ${QUALITY_COLORS[quality] ?? ''}`}
                />
                <div className="flex-1">
                  <SelectInput
                    value={choice.nextNodeId ?? ''}
                    onChange={e => updateChoice(i, { nextNodeId: e.target.value })}
                    options={targetOptions}
                  />
                </div>
              </div>
            </div>
          )
        })}
        {choices.length < 4 && (
          <AddButton onClick={addChoice} label="Add option" />
        )}
      </div>
    </EditShell>
  )
}
