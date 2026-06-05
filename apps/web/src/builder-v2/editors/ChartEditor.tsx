// ChartEditor — inline editor for chart exhibits.

import { useState } from 'react'
import type { ChartExhibit, ChartConfig, ChartDataPoint } from '@id/types'
import {
  EditShell, Field, TextInput, NumberInput, SelectInput, SectionLabel, AddButton, RemoveButton, inputCls,
} from './shared'

const COLOR_OPTIONS = [
  { value: 'green', label: 'Green' },
  { value: 'amber', label: 'Amber' },
  { value: 'red', label: 'Red' },
]

interface Props {
  exhibit: ChartExhibit
  onDone: (updated: ChartExhibit) => void
}

export function ChartEditor({ exhibit, onDone }: Props) {
  const [title, setTitle] = useState(exhibit.title ?? '')
  const [caption, setCaption] = useState(exhibit.caption ?? '')
  const [chart, setChart] = useState<ChartConfig>({ ...exhibit.chart })

  function patchChart(patch: Partial<ChartConfig>) {
    setChart(prev => ({ ...prev, ...patch }))
  }

  function updateSeries(idx: number, point: ChartDataPoint) {
    setChart(prev => ({
      ...prev,
      series: prev.series.map((p, i) => i === idx ? point : p),
    }))
  }

  function addPoint() {
    setChart(prev => ({ ...prev, series: [...prev.series, { t: '', v: 0 }] }))
  }

  function removePoint(idx: number) {
    setChart(prev => ({ ...prev, series: prev.series.filter((_, i) => i !== idx) }))
  }

  function handleDone() {
    onDone({ ...exhibit, title, caption: caption || undefined, chart })
  }

  return (
    <EditShell emoji="📈" kindLabel="Chart" onDone={handleDone}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Title"><TextInput value={title} onChange={e => setTitle(e.target.value)} placeholder="Chart title" /></Field>
        <Field label="Caption"><TextInput value={caption} onChange={e => setCaption(e.target.value)} placeholder="e.g. Year-on-year" /></Field>
      </div>

      {/* Chart settings */}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Chart label">
          <TextInput value={chart.title} onChange={e => patchChart({ title: e.target.value })} placeholder="e.g. Growth" />
        </Field>
        <Field label="Unit">
          <TextInput value={chart.unit} onChange={e => patchChart({ unit: e.target.value })} placeholder="e.g. %" />
        </Field>
        <Field label="Color">
          <SelectInput
            value={chart.color}
            onChange={e => patchChart({ color: e.target.value as ChartConfig['color'] })}
            options={COLOR_OPTIONS}
          />
        </Field>
        <Field label="Baseline (optional)">
          <NumberInput
            value={chart.baseline ?? ''}
            onChange={e => patchChart({ baseline: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="e.g. 0"
          />
        </Field>
      </div>

      {/* Series data */}
      <div className="flex flex-col gap-2">
        <SectionLabel label="Data series" />
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
          <span className="text-[10px] font-semibold text-white/25 uppercase tracking-wider">Label (t)</span>
          <span className="text-[10px] font-semibold text-white/25 uppercase tracking-wider">Value (v)</span>
          <span />
          {chart.series.map((pt, i) => (
            <>
              <input
                key={`t-${i}`}
                value={pt.t}
                onChange={e => updateSeries(i, { ...pt, t: e.target.value })}
                className={`${inputCls} py-1.5`}
                placeholder="e.g. Y1"
              />
              <input
                key={`v-${i}`}
                type="number"
                value={pt.v}
                onChange={e => updateSeries(i, { ...pt, v: Number(e.target.value) })}
                className={`${inputCls} py-1.5 [appearance:textfield]`}
                placeholder="0"
              />
              <RemoveButton key={`r-${i}`} onClick={() => removePoint(i)} />
            </>
          ))}
        </div>
        <AddButton onClick={addPoint} label="Add data point" />
      </div>

      {/* Annotation */}
      <div className="flex flex-col gap-2">
        <SectionLabel label="Annotation (optional)" />
        <div className="flex gap-3">
          <Field label="Series index">
            <NumberInput
              value={chart.annotation?.tIndex ?? ''}
              onChange={e => {
                const v = e.target.value
                patchChart({ annotation: v ? { tIndex: Number(v), label: chart.annotation?.label ?? '' } : undefined })
              }}
              placeholder="e.g. 3"
            />
          </Field>
          <Field label="Label">
            <TextInput
              value={chart.annotation?.label ?? ''}
              onChange={e => {
                if (chart.annotation) patchChart({ annotation: { ...chart.annotation, label: e.target.value } })
              }}
              placeholder="e.g. ↑ Incident start"
              disabled={!chart.annotation}
            />
          </Field>
        </div>
      </div>
    </EditShell>
  )
}
