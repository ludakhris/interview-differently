import { useState } from 'react'
import type { RubricDimension } from '@id/types'

interface RubricEditorProps {
  dimensions: RubricDimension[]
  onUpdate: (dimensions: RubricDimension[]) => void
  onClose: () => void
}

export function RubricEditor({ dimensions, onUpdate, onClose }: RubricEditorProps) {
  const [local, setLocal] = useState<RubricDimension[]>(dimensions)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  function handleChange(index: number, field: keyof RubricDimension, value: string) {
    const updated = local.map((d, i) => (i === index ? { ...d, [field]: value } : d))
    setLocal(updated)
  }

  function handleAdd() {
    if (local.length >= 6) return
    setLocal([...local, { name: '', description: '' }])
  }

  function handleRemove(index: number) {
    setLocal(local.filter((_, i) => i !== index))
  }

  function handleSave() {
    onUpdate(local.filter(d => d.name.trim()))
    onClose()
  }

  function handleDragStart(index: number) {
    setDragIndex(index)
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    setDragOverIndex(index)
  }

  function handleDrop(index: number) {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }
    const updated = [...local]
    const [moved] = updated.splice(dragIndex, 1)
    updated.splice(index, 0, moved)
    setLocal(updated)
    setDragIndex(null)
    setDragOverIndex(null)
  }

  function handleDragEnd() {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="fixed right-0 top-0 bottom-0 w-[420px] bg-[#0d0d0d] border-l border-white/10 z-50 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="font-display font-bold text-[16px] text-[#f5f3ee]">Rubric Editor</h2>
            <p className="text-[12px] text-white/30 mt-0.5">Define the dimensions used to score responses</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/60 transition-colors text-[18px] leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {local.map((dim, i) => (
            <div
              key={i}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={e => handleDragOver(e, i)}
              onDrop={() => handleDrop(i)}
              onDragEnd={handleDragEnd}
              className="border border-white/10 rounded-xl overflow-hidden transition-all"
              style={{
                opacity: dragIndex === i ? 0.5 : 1,
                borderColor: dragOverIndex === i ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
              }}
            >
              <div className="flex items-center gap-2 px-3 py-2 bg-[#111111]">
                <span
                  className="text-white/20 cursor-grab select-none text-[14px] hover:text-white/40"
                  title="Drag to reorder"
                >
                  ⠿
                </span>
                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                  Dimension {i + 1}
                </span>
                <button
                  onClick={() => handleRemove(i)}
                  className="ml-auto text-white/20 hover:text-red-400 transition-colors text-[12px]"
                >
                  Remove
                </button>
              </div>
              <div className="px-3 pb-3 bg-[#0a0a0a] space-y-2 pt-2">
                <input
                  type="text"
                  value={dim.name}
                  onChange={e => handleChange(i, 'name', e.target.value)}
                  placeholder="Dimension name (e.g. Critical Thinking)"
                  className="w-full bg-[#111111] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-[#f5f3ee] placeholder:text-white/20 focus:outline-none focus:border-white/30"
                />
                <input
                  type="text"
                  value={dim.description}
                  onChange={e => handleChange(i, 'description', e.target.value)}
                  placeholder="Scoring description (e.g. Does the candidate…)"
                  className="w-full bg-[#111111] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-[#f5f3ee] placeholder:text-white/20 focus:outline-none focus:border-white/30"
                />
              </div>
            </div>
          ))}

          {local.length < 6 && (
            <button
              onClick={handleAdd}
              className="w-full py-3 border border-dashed border-white/15 rounded-xl text-[12px] text-white/30 hover:border-white/30 hover:text-white/50 transition-all"
            >
              + Add dimension {local.length}/6
            </button>
          )}
          {local.length >= 6 && (
            <p className="text-[11px] text-white/20 text-center py-2">Maximum 6 dimensions reached</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex gap-3">
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
            Save Rubric
          </button>
        </div>
      </div>
    </>
  )
}
