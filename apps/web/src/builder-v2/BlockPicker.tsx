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
    <div className="w-full h-full flex items-center justify-center p-10 bg-surface-deep">
      <div className="w-full max-w-lg">
        <p className="text-[15px] font-medium text-ink/80 mb-5 leading-snug">
          How would you structure the analysis?
        </p>
        <div className="flex flex-col gap-2">
          {[
            {
              id: 'A',
              text: 'Start with revenue drivers — top-down approach.',
              quality: 'Strong',
              color: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/30',
            },
            {
              id: 'B',
              text: 'Cost structure first, then revenue side.',
              quality: 'Proficient',
              color: 'text-teal-300 bg-teal-400/10 border-teal-400/30',
            },
            {
              id: 'C',
              text: 'Look at competitors to frame the issue.',
              quality: 'Developing',
              color: 'text-amber-300 bg-amber-400/10 border-amber-400/30',
            },
          ].map((o) => (
            <div
              key={o.id}
              className="flex items-start gap-3 px-3 py-2.5 border border-edge/6 rounded-lg bg-ink/2"
            >
              <span className="w-[22px] h-[22px] rounded-[6px] bg-ink/6 border border-edge/10 text-[11px] font-bold flex items-center justify-center flex-none mt-px">
                {o.id}
              </span>
              <span className="flex-1 text-[13px] text-ink/80 leading-snug">{o.text}</span>
              <span
                className={`flex-none text-[11px] font-semibold border rounded-full px-2 py-0.5 ${o.color}`}
              >
                {o.quality}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TransitionPreview() {
  return (
    <div className="w-full h-full flex items-center justify-center p-10 bg-surface-deep">
      <div className="w-full max-w-lg border border-edge/10 rounded-[14px] bg-surface-alt p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[13px] text-slate-mid">↩</span>
          <span className="text-[10px] font-mono font-medium uppercase tracking-[0.14em] text-slate-mid">
            Redirect / Transition
          </span>
        </div>
        <p className="text-[14px] text-slate-light leading-relaxed italic mb-4">
          "Interesting angle — but the client's primary concern is the cost structure. Let's focus
          there before tackling revenue."
        </p>
        <div className="flex items-center gap-1.5 text-[12px] text-slate-mid font-medium">
          <span>Continues to</span>
          <span className="text-slate-mid font-semibold">→ next decision</span>
        </div>
      </div>
    </div>
  )
}

function EndingPreview() {
  return (
    <div className="w-full h-full flex items-center justify-center p-10 bg-surface-deep">
      <div className="w-full max-w-lg flex flex-col gap-3">
        <div className="border border-emerald-400/20 rounded-[14px] bg-emerald-400/4 p-5">
          <div className="text-[10px] font-mono font-medium uppercase tracking-[0.14em] text-emerald-400/60 mb-2">
            🏁 Strong ending
          </div>
          <p className="text-[13px] text-slate-light leading-relaxed">
            Clear, structured recommendation with supporting financials. The candidate identified
            the core driver and sized the opportunity correctly.
          </p>
        </div>
        <div className="border border-amber-400/15 rounded-[14px] bg-amber-400/3 p-4">
          <div className="text-[10px] font-mono font-medium uppercase tracking-[0.14em] text-amber-400/50 mb-2">
            🏁 Developing ending
          </div>
          <p className="text-[12px] text-slate-mid leading-relaxed">
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
  { id: 'quant', label: 'Graded Questions' },
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
    const first = REGISTRY.find((d) => d.group === activeGroup)
    if (first) setSelectedKind(first.kind)
  }, [activeGroup])

  const groupKinds = REGISTRY.filter((d) => d.group === activeGroup)
  const selected = REGISTRY.find((d) => d.kind === selectedKind) ?? groupKinds[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-ink/70 backdrop-blur-xs"
        role="presentation"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-[820px] max-h-[88vh] bg-surface-alt border border-edge/10 rounded-2xl overflow-hidden flex flex-col shadow-2xl"
        role="dialog"
        aria-label="Insert a block"
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0 flex-none">
          <h2 className="text-[15px] font-bold text-ink tracking-tight">Insert a block</h2>
          <button
            onClick={onClose}
            className="text-slate-mid hover:text-slate-light text-[20px] leading-none w-7 h-7 flex items-center justify-center rounded-lg hover:bg-ink/6 transition-colors"
          >
            ×
          </button>
        </div>

        {/* ── Group tabs ─────────────────────────────────────────────────────── */}
        <div className="flex gap-1 px-6 pt-3 border-b border-edge/[0.07] flex-none">
          {GROUP_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveGroup(tab.id)}
              className={[
                'px-3 py-2.5 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors',
                activeGroup === tab.id
                  ? 'border-emerald-400 text-emerald-300'
                  : 'border-transparent text-slate-light hover:text-ink/85',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Kind selector pills ────────────────────────────────────────────── */}
        <div className="flex gap-2 px-6 py-3 overflow-x-auto flex-none border-b border-edge/6">
          {groupKinds.map((desc) => (
            <button
              key={desc.kind}
              onClick={() => setSelectedKind(desc.kind)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all flex-none',
                selectedKind === desc.kind
                  ? 'bg-emerald-400/15 border border-emerald-400/50 text-emerald-300'
                  : 'bg-ink/4 border border-edge/8 text-slate-mid hover:text-ink/75 hover:border-edge/20',
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
        <div className="flex items-center gap-4 px-6 py-4 border-t border-edge/[0.07] bg-surface-alt flex-none">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[16px]">{selected.emoji}</span>
              <span className="text-[14px] font-bold text-ink">{selected.label}</span>
            </div>
            <p className="text-[12px] text-slate-mid truncate">{selected.blurb}</p>
            <p className="text-[11px] text-slate-mid italic mt-0.5 truncate">{selected.example}</p>
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
