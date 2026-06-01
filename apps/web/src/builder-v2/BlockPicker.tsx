// BlockPicker — block insertion modal for the v2 document editor.
//
// Layout: group tabs → kind selector pills → full-width preview pane → insert button.
// One kind selected at a time; preview fills the modal so screenshots are readable.

import { useState, useEffect } from 'react'
import type { EntityKind } from './registry'
import { REGISTRY } from './registry'

// ── Inline mockup previews for node kinds (no screenshots available) ─────────

function NodePreview({ kind }: { kind: EntityKind }) {
  if (kind === 'decision') return <DecisionPreview />
  if (kind === 'transition') return <TransitionPreview />
  if (kind === 'feedback') return <EndingPreview />
  return null
}

function DecisionPreview() {
  return (
    <div className="w-full h-full flex items-center justify-center p-10 bg-[#0d0d0d]">
      <div className="w-full max-w-lg">
        <p className="text-[15px] font-medium text-white/80 mb-5 leading-snug">
          How would you structure the analysis?
        </p>
        <div className="flex flex-col gap-2">
          {[
            { id: 'A', text: 'Start with revenue drivers — top-down approach.', quality: 'Strong', color: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/30' },
            { id: 'B', text: 'Cost structure first, then revenue side.', quality: 'Proficient', color: 'text-teal-300 bg-teal-400/10 border-teal-400/30' },
            { id: 'C', text: 'Look at competitors to frame the issue.', quality: 'Developing', color: 'text-amber-300 bg-amber-400/10 border-amber-400/30' },
          ].map(o => (
            <div key={o.id} className="flex items-start gap-3 px-3 py-2.5 border border-white/[0.06] rounded-lg bg-white/[0.02]">
              <span className="w-[22px] h-[22px] rounded-[6px] bg-white/[0.06] border border-white/10 text-[11px] font-bold flex items-center justify-center flex-none mt-px">{o.id}</span>
              <span className="flex-1 text-[13px] text-white/80 leading-snug">{o.text}</span>
              <span className={`flex-none text-[11px] font-semibold border rounded-full px-2 py-0.5 ${o.color}`}>{o.quality}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TransitionPreview() {
  return (
    <div className="w-full h-full flex items-center justify-center p-10 bg-[#0d0d0d]">
      <div className="w-full max-w-lg border border-white/10 rounded-[14px] bg-[#111] p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[13px] text-white/30">↩</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Redirect / Transition</span>
        </div>
        <p className="text-[14px] text-white/65 leading-relaxed italic mb-4">
          "Interesting angle — but the client's primary concern is the cost structure. Let's focus there before tackling revenue."
        </p>
        <div className="flex items-center gap-1.5 text-[12px] text-white/30 font-medium">
          <span>Continues to</span>
          <span className="text-white/50 font-semibold">→ next decision</span>
        </div>
      </div>
    </div>
  )
}

function EndingPreview() {
  return (
    <div className="w-full h-full flex items-center justify-center p-10 bg-[#0d0d0d]">
      <div className="w-full max-w-lg flex flex-col gap-3">
        <div className="border border-emerald-400/20 rounded-[14px] bg-emerald-400/[0.04] p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/60 mb-2">🏁 Strong ending</div>
          <p className="text-[13px] text-white/70 leading-relaxed">
            Clear, structured recommendation with supporting financials. The candidate identified the core driver and sized the opportunity correctly.
          </p>
        </div>
        <div className="border border-amber-400/15 rounded-[14px] bg-amber-400/[0.03] p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400/50 mb-2">🏁 Developing ending</div>
          <p className="text-[12px] text-white/50 leading-relaxed">
            Recommendation lacked specificity. Framework was sound but conclusions too conservative.
          </p>
        </div>
      </div>
    </div>
  )
}

type GroupId = 'exhibit' | 'quant' | 'node'

const GROUP_TABS: { id: GroupId; label: string }[] = [
  { id: 'node', label: 'Decisions & Flow' },
  { id: 'exhibit', label: 'Exhibits' },
  { id: 'quant', label: 'Quant' },
]

interface Props {
  onPick: (kind: EntityKind) => void
  onClose: () => void
}

export function BlockPicker({ onPick, onClose }: Props) {
  const [activeGroup, setActiveGroup] = useState<GroupId>('node')
  const [selectedKind, setSelectedKind] = useState<EntityKind>('decision')

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // When group tab switches, auto-select first kind in that group
  useEffect(() => {
    const first = REGISTRY.find(d => d.group === activeGroup)
    if (first) setSelectedKind(first.kind)
  }, [activeGroup])

  const groupKinds = REGISTRY.filter(d => d.group === activeGroup)
  const selected = REGISTRY.find(d => d.kind === selectedKind) ?? groupKinds[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-[820px] max-h-[88vh] bg-[#111] border border-white/10 rounded-2xl overflow-hidden flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0 flex-none">
          <h2 className="text-[15px] font-bold text-white tracking-tight">Insert a block</h2>
          <button
            onClick={onClose}
            className="text-white/35 hover:text-white/70 text-[20px] leading-none w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            ×
          </button>
        </div>

        {/* ── Group tabs ─────────────────────────────────────────────────────── */}
        <div className="flex gap-1 px-6 pt-3 border-b border-white/[0.07] flex-none">
          {GROUP_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveGroup(tab.id)}
              className={[
                'px-3 py-2.5 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors',
                activeGroup === tab.id
                  ? 'border-emerald-400 text-emerald-300'
                  : 'border-transparent text-white/60 hover:text-white/85',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Kind selector pills ────────────────────────────────────────────── */}
        <div className="flex gap-2 px-6 py-3 overflow-x-auto flex-none border-b border-white/[0.06]">
          {groupKinds.map(desc => (
            <button
              key={desc.kind}
              onClick={() => setSelectedKind(desc.kind)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all flex-none',
                selectedKind === desc.kind
                  ? 'bg-emerald-400/15 border border-emerald-400/50 text-emerald-300'
                  : 'bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-white/75 hover:border-white/20',
              ].join(' ')}
            >
              <span className="text-[13px]">{desc.emoji}</span>
              {desc.label}
            </button>
          ))}
        </div>

        {/* ── Preview pane ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden bg-[#0c0c0c] relative min-h-0">
          {selected.screenshot ? (
            <img
              key={selected.kind}
              src={`/screenshots/${selected.screenshot}`}
              alt={selected.label}
              className="w-full h-full object-cover object-top brightness-105"
            />
          ) : (
            <NodePreview kind={selected.kind} />
          )}
        </div>

        {/* ── Footer: info + insert ──────────────────────────────────────────── */}
        <div className="flex items-center gap-4 px-6 py-4 border-t border-white/[0.07] bg-[#111] flex-none">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[16px]">{selected.emoji}</span>
              <span className="text-[14px] font-bold text-white">{selected.label}</span>
            </div>
            <p className="text-[12px] text-white/50 truncate">{selected.blurb}</p>
            <p className="text-[11px] text-white/28 italic mt-0.5 truncate">{selected.example}</p>
          </div>
          <button
            onClick={() => onPick(selected.kind)}
            className="flex-none px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[13px] font-bold text-black transition-colors"
          >
            ＋ Insert {selected.label}
          </button>
        </div>
      </div>
    </div>
  )
}
