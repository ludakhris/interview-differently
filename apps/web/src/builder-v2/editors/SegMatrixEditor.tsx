// SegMatrixEditor — inline editor for segmentation-matrix exhibits.

import { useState } from 'react'
import type { SegmentationMatrixExhibit, SegmentationMatrixItem } from '@id/types'
import {
  EditShell, Field, TextInput, SectionLabel, AddButton, RemoveButton,
} from './shared'

type QuadrantKey = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
const QUADRANTS: { key: QuadrantKey; label: string; position: string }[] = [
  { key: 'topLeft', label: 'Top-left', position: 'top-left' },
  { key: 'topRight', label: 'Top-right ★', position: 'top-right' },
  { key: 'bottomLeft', label: 'Bottom-left', position: 'bottom-left' },
  { key: 'bottomRight', label: 'Bottom-right', position: 'bottom-right' },
]

interface Props {
  exhibit: SegmentationMatrixExhibit
  onDone: (updated: SegmentationMatrixExhibit) => void
}

export function SegMatrixEditor({ exhibit, onDone }: Props) {
  const [title, setTitle] = useState(exhibit.title ?? '')
  const [xAxis, setXAxis] = useState({ ...exhibit.xAxis })
  const [yAxis, setYAxis] = useState({ ...exhibit.yAxis })
  const [quadrants, setQuadrants] = useState({ ...exhibit.quadrants })
  const [quadrantLabels, setQuadrantLabels] = useState({ ...(exhibit.quadrantLabels ?? {}) })

  function updateQuadrant(key: QuadrantKey, items: SegmentationMatrixItem[]) {
    setQuadrants(prev => ({ ...prev, [key]: items }))
  }

  function addItem(key: QuadrantKey) {
    updateQuadrant(key, [...(quadrants[key] ?? []), { label: '' }])
  }

  function updateItem(key: QuadrantKey, idx: number, patch: Partial<SegmentationMatrixItem>) {
    const items = [...(quadrants[key] ?? [])]
    items[idx] = { ...items[idx], ...patch }
    updateQuadrant(key, items)
  }

  function removeItem(key: QuadrantKey, idx: number) {
    updateQuadrant(key, (quadrants[key] ?? []).filter((_, i) => i !== idx))
  }

  return (
    <EditShell
      emoji="▦"
      kindLabel="Segmentation Matrix"
      onDone={() => onDone({ ...exhibit, title, xAxis, yAxis, quadrants, quadrantLabels })}
    >
      <Field label="Title">
        <TextInput value={title} onChange={e => setTitle(e.target.value)} placeholder="Matrix title" />
      </Field>

      {/* Axes */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <SectionLabel label="X-axis (horizontal)" />
          <TextInput value={xAxis.label} onChange={e => setXAxis(p => ({ ...p, label: e.target.value }))} placeholder="Axis label" />
          <div className="flex gap-2">
            <TextInput value={xAxis.lowLabel} onChange={e => setXAxis(p => ({ ...p, lowLabel: e.target.value }))} placeholder="Low label" />
            <TextInput value={xAxis.highLabel} onChange={e => setXAxis(p => ({ ...p, highLabel: e.target.value }))} placeholder="High label" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <SectionLabel label="Y-axis (vertical)" />
          <TextInput value={yAxis.label} onChange={e => setYAxis(p => ({ ...p, label: e.target.value }))} placeholder="Axis label" />
          <div className="flex gap-2">
            <TextInput value={yAxis.lowLabel} onChange={e => setYAxis(p => ({ ...p, lowLabel: e.target.value }))} placeholder="Low label" />
            <TextInput value={yAxis.highLabel} onChange={e => setYAxis(p => ({ ...p, highLabel: e.target.value }))} placeholder="High label" />
          </div>
        </div>
      </div>

      {/* Quadrants in 2×2 layout */}
      <div>
        <SectionLabel label="Quadrant items" />
        <div className="grid grid-cols-2 gap-3 mt-2">
          {QUADRANTS.map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-1.5 p-3 border border-white/[0.06] rounded-xl bg-white/[0.01]">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">{label}</span>
                <div className="flex-1" />
                <TextInput
                  value={quadrantLabels[key] ?? ''}
                  onChange={e => setQuadrantLabels(p => ({ ...p, [key]: e.target.value || undefined }))}
                  placeholder="Header (optional)"
                />
              </div>
              {(quadrants[key] ?? []).map((item, idx) => (
                <div key={idx} className="flex flex-col gap-1 mb-1.5">
                  <div className="flex gap-2 items-center">
                    <TextInput
                      value={item.label}
                      onChange={e => updateItem(key, idx, { label: e.target.value })}
                      placeholder="Label  e.g. Northern Highlands"
                    />
                    <RemoveButton onClick={() => removeItem(key, idx)} />
                  </div>
                  <TextInput
                    value={item.caption ?? ''}
                    onChange={e => updateItem(key, idx, { caption: e.target.value || undefined })}
                    placeholder="Caption  e.g. High need, sparse network"
                  />
                </div>
              ))}
              <AddButton onClick={() => addItem(key)} label="Add item" />
            </div>
          ))}
        </div>
      </div>
    </EditShell>
  )
}
