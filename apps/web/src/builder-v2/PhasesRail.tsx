// PhasesRail — left sidebar listing declared phases.
// Drag-to-reorder wired via HTML5 DnD (no dep needed).
// Click to scroll the corresponding phase heading into view.

import { useState, useRef } from 'react'
import type { ScenarioPhase } from '@id/types'

interface Props {
  phases: ScenarioPhase[]
  activePhaseId: string | null
  onSelect: (phaseId: string) => void
  onReorder: (from: number, to: number) => void
  onAdd: () => void
}

export function PhasesRail({ phases, activePhaseId, onSelect, onReorder, onAdd }: Props) {
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const itemsRef = useRef<(HTMLDivElement | null)[]>([])

  function handleDragStart(idx: number) { setDragging(idx) }
  function handleDragEnter(idx: number) { setDragOver(idx) }
  function handleDragEnd() {
    if (dragging !== null && dragOver !== null && dragging !== dragOver) {
      onReorder(dragging, dragOver)
    }
    setDragging(null)
    setDragOver(null)
  }

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] border-r border-white/10 w-[220px] flex-none">
      <div className="px-4 pt-5 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">Phases</p>
      </div>

      <div className="flex-1 overflow-auto px-2 pb-2 flex flex-col gap-1">
        {phases.map((phase, idx) => {
          const isActive = phase.id === activePhaseId
          const isDragging = dragging === idx
          const isDragOver = dragOver === idx && dragging !== idx

          return (
            <div
              key={phase.id}
              ref={el => { itemsRef.current[idx] = el }}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragEnter={() => handleDragEnter(idx)}
              onDragEnd={handleDragEnd}
              onDragOver={e => e.preventDefault()}
              onClick={() => onSelect(phase.id)}
              className={[
                'flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer select-none transition-all',
                isActive ? 'bg-emerald-400/10 border border-emerald-400/30' : 'border border-transparent hover:bg-white/[0.04]',
                isDragging ? 'opacity-40' : '',
                isDragOver ? 'border-t-2 border-t-emerald-400/60' : '',
              ].join(' ')}
            >
              {/* drag grip */}
              <span className="text-[11px] text-white/20 cursor-grab active:cursor-grabbing">⋮⋮</span>
              {/* status dot */}
              <span className={[
                'w-1.5 h-1.5 rounded-full flex-none',
                hasContent(phase) ? 'bg-emerald-400' : 'bg-white/20',
              ].join(' ')} />
              {/* label */}
              <span className={[
                'flex-1 text-[13px] font-semibold truncate',
                isActive ? 'text-white' : 'text-white/65',
              ].join(' ')}>
                {phase.label}
              </span>
              {/* block count */}
              <span className="text-[11px] text-white/25 font-medium tabular-nums">
                {(phase.nodeIds?.length ?? 0) + (phase.exhibitIds?.length ?? 0)}
              </span>
            </div>
          )
        })}

        {/* Add phase */}
        <button
          onClick={onAdd}
          className="flex items-center gap-2 px-2.5 py-2 mt-1 rounded-lg border border-dashed border-white/10 text-[12px] font-semibold text-white/30 hover:text-white/55 hover:border-white/20 transition-all"
        >
          <span>＋</span>
          <span>Add phase</span>
        </button>
      </div>

      <div className="px-4 py-4 border-t border-white/[0.06]">
        <p className="text-[11px] text-white/25 leading-relaxed">
          Drag <span className="text-white/40">⋮⋮</span> to reorder. Phase order = the order the candidate walks the case.
        </p>
      </div>
    </div>
  )
}

function hasContent(phase: ScenarioPhase): boolean {
  return (phase.nodeIds?.length ?? 0) > 0 || (phase.exhibitIds?.length ?? 0) > 0
}
