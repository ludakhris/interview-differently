import { useState } from 'react'
import type { ScenarioNode, RubricDimension, Choice, ScoreQuality, ContextPanel } from '@id/types'

interface NodeEditorPanelProps {
  selectedNode: ScenarioNode | null
  rubricDimensions: RubricDimension[]
  allNodes: ScenarioNode[]
  onUpdate: (node: ScenarioNode) => void
  onDelete: (nodeId: string) => void
}

export function NodeEditorPanel({ selectedNode, rubricDimensions, allNodes, onUpdate, onDelete }: NodeEditorPanelProps) {
  if (!selectedNode) {
    return (
      <div className="w-80 flex-shrink-0 border-l border-white/10 bg-[#0d0d0d] flex items-center justify-center p-6">
        <p className="text-[13px] text-white/30 text-center">
          Select a node to edit
        </p>
      </div>
    )
  }

  return (
    <div className="w-80 flex-shrink-0 border-l border-white/10 bg-[#0d0d0d] overflow-y-auto">
      <div className="p-4 border-b border-white/10 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">
            Node Editor
          </p>
          <p className="text-[13px] font-semibold text-[#f5f3ee] mt-1 capitalize">
            {selectedNode.type} Node
          </p>
        </div>
        <button
          onClick={() => onDelete(selectedNode.nodeId)}
          className="text-[11px] text-red-400/50 hover:text-red-400 bg-white/5 hover:bg-red-400/10 border border-white/10 hover:border-red-400/20 rounded-lg px-2.5 py-1.5 transition-all flex-shrink-0 mt-0.5"
        >
          Delete
        </button>
      </div>

      {selectedNode.type === 'decision' && (
        <DecisionNodeEditor
          node={selectedNode}
          rubricDimensions={rubricDimensions}
          allNodes={allNodes}
          onUpdate={onUpdate}
        />
      )}
      {selectedNode.type === 'transition' && (
        <TransitionNodeEditor
          node={selectedNode}
          allNodes={allNodes}
          onUpdate={onUpdate}
        />
      )}
      {selectedNode.type === 'feedback' && (
        <div className="p-4">
          <p className="text-[13px] text-white/50">
            This node ends the scenario and triggers the scoring engine. No additional configuration needed.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Decision Node Editor ─────────────────────────────────────────────────────

const QUALITY_OPTIONS: { value: ScoreQuality | null; label: string; color: string }[] = [
  { value: 'strong', label: 'Strong', color: '#2d9e5f' },
  { value: 'proficient', label: 'Prof.', color: '#1a5a8a' },
  { value: 'developing', label: 'Dev.', color: '#d4830a' },
  { value: null, label: '—', color: 'rgba(255,255,255,0.2)' },
]

const CHOICE_IDS: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D']

function DecisionNodeEditor({
  node,
  rubricDimensions,
  onUpdate,
}: {
  node: ScenarioNode
  rubricDimensions: RubricDimension[]
  allNodes: ScenarioNode[]
  onUpdate: (node: ScenarioNode) => void
}) {
  const [expanded, setExpanded] = useState<string | null>('A')

  function updateNarrative(narrative: string) {
    onUpdate({ ...node, narrative })
  }

  function getChoice(id: 'A' | 'B' | 'C' | 'D'): Choice {
    return (
      node.choices?.find(c => c.id === id) ?? {
        id,
        text: '',
        nextNodeId: '',
        qualitySignals: [],
      }
    )
  }

  function updateChoice(id: 'A' | 'B' | 'C' | 'D', updates: Partial<Choice>) {
    const existing = getChoice(id)
    const updated = { ...existing, ...updates }
    const choices = CHOICE_IDS.map(cid => (cid === id ? updated : getChoice(cid)))
    onUpdate({ ...node, choices })
  }

  function setSignal(choiceId: 'A' | 'B' | 'C' | 'D', dimension: string, quality: ScoreQuality | null) {
    const choice = getChoice(choiceId)
    let signals = choice.qualitySignals.filter(s => s.dimension !== dimension)
    if (quality !== null) {
      signals = [...signals, { dimension, quality }]
    }
    updateChoice(choiceId, { qualitySignals: signals })
  }

  function getSignal(choiceId: 'A' | 'B' | 'C' | 'D', dimension: string): ScoreQuality | null {
    const choice = getChoice(choiceId)
    return choice.qualitySignals.find(s => s.dimension === dimension)?.quality ?? null
  }

  return (
    <div className="p-4 space-y-5">
      {/* Narrative */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">
          Narrative
        </label>
        <textarea
          value={node.narrative}
          onChange={e => updateNarrative(e.target.value.slice(0, 800))}
          placeholder="Describe the situation the candidate faces…"
          className="w-full bg-[#111111] border border-white/10 rounded-lg p-3 text-[13px] text-[#f5f3ee] placeholder:text-white/20 resize-none focus:outline-none focus:border-white/30 leading-relaxed"
          rows={5}
        />
        <p className="text-[10px] text-white/20 mt-1 text-right">{node.narrative.length}/800</p>
      </div>

      {/* Context Panels */}
      <ContextPanelsEditor node={node} onUpdate={onUpdate} />

      {/* Choices */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">
          Choices
        </label>
        <div className="space-y-2">
          {CHOICE_IDS.map(id => {
            const choice = getChoice(id)
            const isOpen = expanded === id
            return (
              <div key={id} className="border border-white/10 rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 px-3 py-2.5 bg-[#111111] hover:bg-white/5 transition-colors text-left"
                  onClick={() => setExpanded(isOpen ? null : id)}
                >
                  <span
                    className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                    style={{ background: 'rgba(26,90,138,0.3)', color: '#1a5a8a' }}
                  >
                    {id}
                  </span>
                  <span className="text-[12px] text-[#f5f3ee] flex-1 truncate">
                    {choice.text || <span className="text-white/20">Empty choice…</span>}
                  </span>
                  <span className="text-white/30 text-[10px]">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div className="px-3 pb-3 bg-[#0a0a0a] space-y-3">
                    <div className="pt-3">
                      <input
                        type="text"
                        value={choice.text}
                        onChange={e => updateChoice(id, { text: e.target.value.slice(0, 200) })}
                        placeholder={`Choice ${id} text…`}
                        className="w-full bg-[#111111] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-[#f5f3ee] placeholder:text-white/20 focus:outline-none focus:border-white/30"
                      />
                      <p className="text-[10px] text-white/20 mt-1 text-right">{choice.text.length}/200</p>
                    </div>

                    {rubricDimensions.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">
                          Quality Signals
                        </p>
                        <div className="space-y-2">
                          {rubricDimensions.map(dim => {
                            const current = getSignal(id, dim.name)
                            return (
                              <div key={dim.name}>
                                <p className="text-[10px] text-white/50 mb-1 truncate">{dim.name}</p>
                                <div className="flex gap-1">
                                  {QUALITY_OPTIONS.map(opt => (
                                    <button
                                      key={opt.label}
                                      onClick={() => setSignal(id, dim.name, opt.value)}
                                      className="flex-1 py-1 rounded text-[9px] font-bold transition-all"
                                      style={{
                                        background:
                                          current === opt.value
                                            ? opt.color
                                            : 'rgba(255,255,255,0.05)',
                                        color:
                                          current === opt.value ? '#fff' : opt.color,
                                        border: `1px solid ${current === opt.value ? opt.color : 'rgba(255,255,255,0.1)'}`,
                                      }}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Context Panels Editor ────────────────────────────────────────────────────

const PANEL_TYPES: { value: ContextPanel['type']; label: string; color: string }[] = [
  { value: 'alert',  label: 'alert',  color: '#c0392b' },
  { value: 'metric', label: 'metric', color: '#1a5a8a' },
  { value: 'info',   label: 'info',   color: 'rgba(255,255,255,0.4)' },
]

function ContextPanelsEditor({
  node,
  onUpdate,
}: {
  node: ScenarioNode
  onUpdate: (node: ScenarioNode) => void
}) {
  const [open, setOpen] = useState(false)
  const panels = node.contextPanels ?? []

  function addPanel() {
    onUpdate({ ...node, contextPanels: [...panels, { label: '', value: '', type: 'metric' }] })
    setOpen(true)
  }

  function updatePanel(i: number, updates: Partial<ContextPanel>) {
    onUpdate({ ...node, contextPanels: panels.map((p, idx) => (idx === i ? { ...p, ...updates } : p)) })
  }

  function removePanel(i: number) {
    onUpdate({ ...node, contextPanels: panels.filter((_, idx) => idx !== i) })
  }

  return (
    <div>
      <button
        className="w-full flex items-center justify-between mb-2"
        onClick={() => setOpen(v => !v)}
      >
        <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 cursor-pointer">
          Context Panels
          {panels.length > 0 && (
            <span className="ml-1.5 text-white/25">({panels.length})</span>
          )}
        </label>
        <span className="text-white/25 text-[10px]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="space-y-1.5">
          {panels.length === 0 && (
            <p className="text-[11px] text-white/20 py-2 text-center border border-dashed border-white/10 rounded-lg">
              No panels yet — metrics shown above the narrative.
            </p>
          )}
          {panels.map((panel, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <select
                value={panel.type}
                onChange={e => updatePanel(i, { type: e.target.value as ContextPanel['type'] })}
                className="w-[58px] flex-shrink-0 bg-[#111111] border border-white/10 rounded-md px-1.5 py-1.5 text-[10px] focus:outline-none focus:border-white/30"
                style={{ color: PANEL_TYPES.find(t => t.value === panel.type)?.color }}
              >
                {PANEL_TYPES.map(t => (
                  <option key={t.value} value={t.value} style={{ color: t.color }}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={panel.label}
                onChange={e => updatePanel(i, { label: e.target.value })}
                placeholder="Label"
                className="flex-1 bg-[#111111] border border-white/10 rounded-md px-2 py-1.5 text-[11px] text-[#f5f3ee] placeholder:text-white/20 focus:outline-none focus:border-white/30"
              />
              <input
                type="text"
                value={panel.value}
                onChange={e => updatePanel(i, { value: e.target.value })}
                placeholder="Value"
                className="w-[60px] flex-shrink-0 bg-[#111111] border border-white/10 rounded-md px-2 py-1.5 text-[11px] text-[#f5f3ee] placeholder:text-white/20 focus:outline-none focus:border-white/30"
              />
              <button
                onClick={() => removePanel(i)}
                className="text-[11px] text-red-400/40 hover:text-red-400 transition-colors px-1 flex-shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={addPanel}
            className="w-full text-[11px] text-white/30 hover:text-white/60 transition-colors py-1.5 border border-dashed border-white/10 rounded-lg hover:border-white/20"
          >
            + Add Panel
          </button>
        </div>
      )}
    </div>
  )
}

// ── Transition Node Editor ───────────────────────────────────────────────────

function TransitionNodeEditor({
  node,
  allNodes,
  onUpdate,
}: {
  node: ScenarioNode
  allNodes: ScenarioNode[]
  onUpdate: (node: ScenarioNode) => void
}) {
  const targetNodes = allNodes.filter(n => n.nodeId !== node.nodeId)

  return (
    <div className="p-4 space-y-5">
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">
          Narrative
        </label>
        <textarea
          value={node.narrative}
          onChange={e => onUpdate({ ...node, narrative: e.target.value.slice(0, 600) })}
          placeholder="Describe what happens as a result of the previous choice…"
          className="w-full bg-[#111111] border border-white/10 rounded-lg p-3 text-[13px] text-[#f5f3ee] placeholder:text-white/20 resize-none focus:outline-none focus:border-white/30 leading-relaxed"
          rows={5}
        />
        <p className="text-[10px] text-white/20 mt-1 text-right">{node.narrative.length}/600</p>
      </div>

      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">
          Next Node
        </label>
        <select
          value={node.nextNodeId ?? ''}
          onChange={e => onUpdate({ ...node, nextNodeId: e.target.value })}
          className="w-full bg-[#111111] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-[#f5f3ee] focus:outline-none focus:border-white/30"
        >
          <option value="">— Select next node —</option>
          {targetNodes.map(n => (
            <option key={n.nodeId} value={n.nodeId}>
              [{n.type.toUpperCase()}] {n.narrative ? n.narrative.slice(0, 40) + '…' : n.nodeId.slice(0, 8)}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
