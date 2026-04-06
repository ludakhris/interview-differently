import type { Scenario } from '@id/types'

interface NodePaletteProps {
  scenario: Scenario
}

const NODE_TYPES = [
  { type: 'startNode', label: 'Start', color: '#2d9e5f', description: 'Entry point' },
  { type: 'decisionNode', label: 'Decision', color: '#1a5a8a', description: 'Question + 4 choices' },
  { type: 'transitionNode', label: 'Transition', color: '#d4830a', description: 'Bridge narrative' },
  { type: 'feedbackNode', label: 'Feedback', color: '#7b3fa0', description: 'End + scoring trigger' },
]

export function NodePalette({ scenario }: NodePaletteProps) {
  const hasStartNode = scenario.nodes.some(n => n.type === 'decision') // we use one special start node

  function handleDragStart(e: React.DragEvent, nodeType: string) {
    e.dataTransfer.setData('application/reactflow', nodeType)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      className="w-48 flex-shrink-0 border-r border-white/10 bg-[#0d0d0d] p-4 flex flex-col gap-2 overflow-y-auto"
      style={{ userSelect: 'none' }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">
        Add Node
      </p>
      {NODE_TYPES.map(({ type, label, color, description }) => {
        if (type === 'startNode' && hasStartNode) return null
        return (
          <div
            key={type}
            draggable
            onDragStart={e => handleDragStart(e, type)}
            className="flex items-center gap-3 bg-[#111111] border border-white/10 rounded-lg px-3 py-3 cursor-grab hover:border-white/20 hover:bg-white/5 transition-all active:cursor-grabbing"
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: color }}
            />
            <div>
              <div className="text-[12px] font-semibold text-[#f5f3ee]">{label}</div>
              <div className="text-[10px] text-white/30">{description}</div>
            </div>
          </div>
        )
      })}
      <div className="mt-4 pt-4 border-t border-white/10">
        <p className="text-[10px] text-white/20 leading-relaxed">
          Drag nodes onto the canvas to build your scenario flow.
        </p>
      </div>
    </div>
  )
}
