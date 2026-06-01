// DocBlock — read-only inline render of a single entity (exhibit or node)
// in the v2 document editor.
//
// Phase A: shows the production renderer wrapped in an editable chrome
// (eyebrow kind label, drag handle, ⋮ menu placeholder).
// Phase C: the chrome becomes interactive (click to edit in place).

import type { Exhibit, ScenarioNode, ScenarioBriefing, SidebarSection } from '@id/types'
import { ExhibitRenderer } from '@/components/exhibits/ExhibitRenderer'
import { descriptorFor } from './registry'

// ── Quality signal badge colour ───────────────────────────────────────────────

const QUALITY_COLORS: Record<string, string> = {
  strong: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/30',
  proficient: 'text-teal-300 bg-teal-400/10 border-teal-400/30',
  developing: 'text-amber-300 bg-amber-400/10 border-amber-400/30',
}

// ── Exhibit block ─────────────────────────────────────────────────────────────

export function ExhibitBlock({ exhibit }: { exhibit: Exhibit }) {
  const desc = descriptorFor(exhibit.kind)
  return (
    <BlockShell
      emoji={desc.emoji}
      kindLabel={desc.label}
      actionSlot={
        <span className="text-[11px] font-semibold text-white/35 border border-white/10 rounded-full px-2.5 py-0.5">
          ↻ show again later
        </span>
      }
    >
      <ExhibitRenderer exhibit={exhibit} />
    </BlockShell>
  )
}

// ── Node blocks ───────────────────────────────────────────────────────────────

export function NodeBlock({ node, allNodes }: { node: ScenarioNode; allNodes: ScenarioNode[] }) {
  switch (node.type) {
    case 'decision':
      return <DecisionBlock node={node} allNodes={allNodes} />
    case 'transition':
      return <TransitionBlock node={node} />
    case 'feedback':
      return <FeedbackBlock node={node} />
    case 'quant':
      return <QuantBlock node={node} />
    default:
      return null
  }
}

function DecisionBlock({ node, allNodes }: { node: ScenarioNode; allNodes: ScenarioNode[] }) {
  const nodeMap = Object.fromEntries(allNodes.map(n => [n.nodeId, n]))

  return (
    <BlockShell emoji="🔀" kindLabel="Decision">
      {/* Key Data (contextPanels) */}
      {(node.contextPanels ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-white/[0.06]">
          {(node.contextPanels ?? []).map((panel, i) => (
            <div
              key={i}
              className={[
                'flex flex-col px-3 py-2 rounded-lg border',
                panel.hero
                  ? 'border-emerald-400/30 bg-emerald-400/[0.07] min-w-[120px]'
                  : 'border-white/[0.08] bg-white/[0.03]',
              ].join(' ')}
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">{panel.label}</span>
              <span className={['font-bold tabular-nums', panel.hero ? 'text-[20px] text-emerald-300' : 'text-[15px] text-white/80'].join(' ')}>
                {panel.value}{panel.unit ? <span className="text-[11px] font-normal ml-0.5 text-white/40">{panel.unit}</span> : null}
              </span>
              {panel.caption && <span className="text-[10px] text-white/30 mt-0.5 leading-tight">{panel.caption}</span>}
            </div>
          ))}
        </div>
      )}
      {/* Narrative */}
      <p className="text-[14px] text-white/85 leading-relaxed mb-3 font-medium">
        {node.narrative || <span className="italic text-white/30">No question text yet</span>}
      </p>

      {/* Options */}
      <div className="flex flex-col gap-1.5">
        {(node.choices ?? []).map(choice => {
          const targetNode = choice.nextNodeId ? nodeMap[choice.nextNodeId] : null
          const signal = choice.qualitySignals?.[0]
          const quality = signal?.quality ?? 'developing'
          const colorClass = QUALITY_COLORS[quality] ?? QUALITY_COLORS.developing

          // Determine target label
          let targetLabel = '→ unset'
          if (choice.nextNodeId) {
            if (targetNode) {
              targetLabel = `→ ${targetNode.narrative?.slice(0, 30) ?? targetNode.type}…`
            } else {
              targetLabel = '↩ redirect'
            }
          }

          return (
            <div
              key={choice.id}
              className="flex items-start gap-2.5 px-3 py-2.5 border border-white/[0.06] rounded-lg bg-white/[0.02]"
            >
              {/* Badge */}
              <span className="flex-none mt-[1px] w-[22px] h-[22px] rounded-[6px] flex items-center justify-center text-[11px] font-bold bg-white/[0.06] border border-white/10">
                {choice.id}
              </span>
              {/* Text */}
              <span className="flex-1 text-[13px] leading-[1.5] text-white/85">
                {choice.text || <span className="italic text-white/30">No option text</span>}
              </span>
              {/* Signal */}
              {signal && (
                <span className={`flex-none text-[11px] font-semibold border rounded-full px-2 py-0.5 capitalize ${colorClass}`}>
                  {quality}
                </span>
              )}
              {/* Target */}
              <span className="flex-none text-[11px] text-white/30 font-medium whitespace-nowrap">
                {targetLabel}
              </span>
            </div>
          )
        })}
        {(!node.choices || node.choices.length === 0) && (
          <p className="text-[12px] italic text-white/30 px-1">No options yet</p>
        )}
      </div>
    </BlockShell>
  )
}

function TransitionBlock({ node }: { node: ScenarioNode }) {
  return (
    <BlockShell emoji="↩" kindLabel="Redirect / Transition">
      <p className="text-[14px] text-white/70 leading-relaxed italic">
        {node.narrative || <span className="text-white/30">No bridge narrative yet</span>}
      </p>
      {node.nextNodeId && (
        <div className="mt-2 text-[11px] text-white/35 font-medium">
          Continues to: <span className="text-white/55 font-semibold">{node.nextNodeId}</span>
        </div>
      )}
    </BlockShell>
  )
}

function FeedbackBlock({ node }: { node: ScenarioNode }) {
  return (
    <BlockShell emoji="🏁" kindLabel="Ending">
      <p className="text-[14px] text-white/70 leading-relaxed">
        {node.narrative || <span className="italic text-white/30">No feedback narrative yet</span>}
      </p>
    </BlockShell>
  )
}

function QuantBlock({ node }: { node: ScenarioNode }) {
  const spec = node.quant
  if (!spec) return null
  const isStructured = spec.variant === 'structured-quant'

  return (
    <BlockShell
      emoji="🔢"
      kindLabel={isStructured ? 'Structured Quant' : 'Numeric Range'}
    >
      {/* Prompt */}
      <p className="text-[14px] text-white/85 leading-relaxed mb-3">
        {spec.prompt || node.narrative || <span className="italic text-white/30">No prompt yet</span>}
      </p>

      {/* Formula display */}
      {spec.formula?.display && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-[#1a5a8a]/10 border border-[#1a5a8a]/30">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#1a5a8a]/80 mb-1">Formula</p>
          <p className="text-[13px] text-sky-300 font-mono">{spec.formula.display}</p>
        </div>
      )}

      {/* Fields */}
      {isStructured ? (
        <div className="flex flex-col gap-1.5">
          {spec.fields.map(f => (
            <BandRow key={f.id} label={f.label} unit={f.unit} ideal={f.modelAnswer} />
          ))}
        </div>
      ) : (
        <BandRow label={spec.field.label} unit={spec.field.unit} ideal={spec.field.modelAnswer} />
      )}

      {/* Hint indicator */}
      {spec.hint && (
        <div className="mt-3 pl-3 border-l-2 border-amber-400/50 text-amber-300/80 text-[11.5px] leading-relaxed">
          Hint available — reveals formula, caps at <span className="font-semibold">Proficient</span>
        </div>
      )}
    </BlockShell>
  )
}

function BandRow({ label, unit, ideal }: { label: string; unit?: string; ideal?: number }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06]">
      <span className="flex-1 text-[13px] text-white/75">{label}</span>
      {ideal !== undefined && (
        <span className="text-[12px] font-semibold text-emerald-300">
          {ideal}{unit ? ` ${unit}` : ''} ideal
        </span>
      )}
      {/* Mini band visualization */}
      <div className="w-24 h-1.5 rounded-full bg-white/[0.07] relative">
        <span className="absolute left-[30%] right-[25%] inset-y-0 rounded-full bg-emerald-400/25" />
        <span className="absolute left-[43%] right-[40%] -top-px -bottom-px rounded-full bg-emerald-400" />
      </div>
    </div>
  )
}

// ── Briefing block ────────────────────────────────────────────────────────────

export function BriefingBlock({ briefing }: { briefing: ScenarioBriefing }) {
  return (
    <BlockShell emoji="📋" kindLabel="Briefing">
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-3">
        {[
          { label: 'Role', value: briefing.role },
          { label: 'Organisation', value: briefing.organisation },
          { label: 'Reports to', value: briefing.reportsTo },
          { label: 'Time in role', value: briefing.timeInRole },
        ].map(({ label, value }) => value ? (
          <div key={label}>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">{label}</span>
            <p className="text-[13px] text-white/75 mt-0.5">{value}</p>
          </div>
        ) : null)}
      </div>
      {briefing.situation && (
        <p className="text-[13px] text-white/65 leading-relaxed border-t border-white/[0.06] pt-3 mt-1">
          {briefing.situation.slice(0, 220)}{briefing.situation.length > 220 ? '…' : ''}
        </p>
      )}
    </BlockShell>
  )
}

// ── Sidebar block ─────────────────────────────────────────────────────────────

export function SidebarBlock({ sidebar }: { sidebar: SidebarSection[] }) {
  return (
    <BlockShell emoji="🪪" kindLabel="Your Role & Key Facts">
      <div className="flex flex-wrap gap-6">
        {sidebar.map((section, si) => (
          <div key={si} className="min-w-[160px]">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-2">{section.title}</p>
            <div className="flex flex-col gap-1.5">
              {section.items.map((item, ii) => (
                <div key={ii} className="flex items-baseline justify-between gap-4">
                  <span className="text-[12px] text-white/40">{item.label}</span>
                  <span className="text-[12px] font-semibold text-white/80 text-right">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </BlockShell>
  )
}

// ── Block shell ───────────────────────────────────────────────────────────────

function BlockShell({
  emoji,
  kindLabel,
  actionSlot,
  children,
}: {
  emoji: string
  kindLabel: string
  actionSlot?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="group border border-white/10 rounded-[14px] bg-[#111] p-4 hover:border-white/20 transition-colors">
      {/* Header row */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[14px]">{emoji}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
          {kindLabel}
        </span>
        <div className="flex-1" />
        {actionSlot}
        {/* ⋮ menu — Phase C will wire this to the inline editor */}
        <button className="opacity-0 group-hover:opacity-100 transition-opacity text-[15px] text-white/35 hover:text-white/70 px-1">
          ⋮
        </button>
      </div>
      {children}
    </div>
  )
}
