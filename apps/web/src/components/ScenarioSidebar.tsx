import type { SidebarSection, SidebarItem, ContextDisplayStyle } from '@id/types'

interface Props {
  sections: SidebarSection[]
  contextStyle: ContextDisplayStyle
  accentColor?: string
}

const emphasisColor = {
  danger: 'text-red-400',
  warning: 'text-amber-400',
  success: 'text-emerald-400',
}

const accentLine: Record<ContextDisplayStyle, string> = {
  monitor: 'bg-amber-500',
  table: 'bg-blue-500',
  finding: 'bg-red-500',
  'tile-grid': 'bg-[#0f5b89]',
  'hero-list': 'bg-[#0f5b89]',
  'context-cards': 'bg-[#0f5b89]',
  'briefing-sections': 'bg-[#0f5b89]',
}

// ── Section renderers ─────────────────────────────────────────────────────────

function TextSection({ items }: { items: SidebarItem[] }) {
  return (
    <div className="space-y-2.5">
      {items.map((item, i) => (
        <div key={i} className="flex justify-between gap-3">
          {item.label && (
            <span className="text-[12px] text-white/40 flex-shrink-0 pt-0.5">{item.label}</span>
          )}
          <span
            className={`text-[13px] leading-snug ${
              item.emphasis ? emphasisColor[item.emphasis] : 'text-[#f5f3ee]/85'
            } ${item.label ? 'text-right' : ''}`}
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function ListSection({ items }: { items: SidebarItem[] }) {
  return (
    <div className="space-y-0">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex justify-between items-center py-2 border-b border-white/5 last:border-0"
        >
          <span className="text-[12px] text-white/45 pr-2">{item.label}</span>
          <span
            className={`text-[13px] font-semibold text-right ${
              item.emphasis ? emphasisColor[item.emphasis] : 'text-[#f5f3ee]/80'
            }`}
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function HighlightSection({ items }: { items: SidebarItem[] }) {
  return (
    <div className="bg-red-500/8 border border-red-500/25 rounded-lg px-3 py-3">
      <div className="space-y-0">
        {items.map((item, i) => (
          <div
            key={i}
            className="flex justify-between items-center py-1.5 border-b border-red-500/10 last:border-0"
          >
            {item.label && (
              <span className="text-[11px] text-white/40 pr-2">{item.label}</span>
            )}
            <span
              className={`text-[11px] font-semibold ${
                item.emphasis ? emphasisColor[item.emphasis] : 'text-[#f5f3ee]/70'
              } ${item.label ? 'text-right' : 'text-left leading-snug'}`}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SidebarSectionBlock({
  section,
}: {
  section: SidebarSection
}) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/40 mb-2">
        {section.title}
      </div>
      {section.style === 'list' && <ListSection items={section.items} />}
      {section.style === 'highlight' && <HighlightSection items={section.items} />}
      {(!section.style || section.style === 'text') && <TextSection items={section.items} />}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function ScenarioSidebar({ sections, contextStyle, accentColor }: Props) {
  return (
    <aside
      className="hidden lg:flex flex-col w-[260px] flex-shrink-0 bg-[#0d0d0d] border-r border-white/8"
      style={{ minHeight: 'calc(100vh - 57px)' }}
    >
      {/* Accent bar */}
      <div className={`h-[3px] w-full flex-shrink-0 ${accentLine[contextStyle]}`} />

      <div className="px-5 py-5 space-y-5 overflow-y-auto flex-1">
        <p
          className="text-[11px] font-bold uppercase tracking-[0.18em] mb-1"
          style={{ color: accentColor ?? '#b0bec5' }}
        >
          Your Context
        </p>
        {sections.map((section, i) => (
          <SidebarSectionBlock key={i} section={section} />
        ))}
      </div>
    </aside>
  )
}
