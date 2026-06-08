// QuantEditor — inline editor for numeric-range and structured-quant nodes.
// Includes: prompt, per-field bands, formula tokenizer, hint, footnote.

import { useState } from 'react'
import type { ScenarioNode, QuantSpec, QuantFieldSpec, QuantFormula, QuantVariable, QuantNumberFormat, QuantBand, StructuredQuant } from '@id/types'
import {
  EditShell, Field, TextInput, Textarea, NumberInput, SelectInput, SectionLabel, AddButton, RemoveButton,
} from './shared'

const FORMAT_OPTIONS: { value: QuantNumberFormat; label: string }[] = [
  { value: 'integer', label: 'Integer' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'percent', label: 'Percent' },
  { value: 'currency', label: 'Currency' },
]

// ── Formula tokenizer ─────────────────────────────────────────────────────────

function tokenizeExpression(expression: string, existing: QuantVariable[]): QuantVariable[] {
  const names = [...new Set([...expression.matchAll(/\{(\w+)\}/g)].map(m => m[1]))]
  return names.map(name => existing.find(v => v.name === name) ?? {
    name,
    label: name,
    format: 'decimal' as QuantNumberFormat,
  })
}

// ── Field band editor ─────────────────────────────────────────────────────────

function FieldEditor({
  field,
  onChange,
  onRemove,
}: {
  field: QuantFieldSpec
  onChange: (updated: QuantFieldSpec) => void
  onRemove?: () => void
}) {
  function patch(p: Partial<QuantFieldSpec>) { onChange({ ...field, ...p }) }
  function patchBand(p: Partial<QuantBand>) { onChange({ ...field, acceptedRange: { ...field.acceptedRange, ...p } }) }

  return (
    <div className="flex flex-col gap-3 p-3 border border-white/[0.06] rounded-xl bg-white/[0.01]">
      <div className="flex items-center gap-2">
        <Field label="Field label">
          <TextInput value={field.label} onChange={e => patch({ label: e.target.value })} placeholder="e.g. Rural families" />
        </Field>
        <Field label="Unit">
          <TextInput value={field.unit ?? ''} onChange={e => patch({ unit: e.target.value || undefined })} placeholder="e.g. M" />
        </Field>
        <Field label="Format">
          <SelectInput
            value={field.format ?? 'decimal'}
            onChange={e => patch({ format: e.target.value as QuantNumberFormat })}
            options={FORMAT_OPTIONS}
          />
        </Field>
        {onRemove && <div className="pt-5"><RemoveButton onClick={onRemove} /></div>}
      </div>

      <div>
        <SectionLabel label="Accepted band" />
        <div className="grid grid-cols-4 gap-2 mt-2">
          {([
            { key: 'min', label: 'Min' },
            { key: 'idealMin', label: 'Ideal min' },
            { key: 'idealMax', label: 'Ideal max' },
            { key: 'max', label: 'Max' },
          ] as { key: keyof QuantBand; label: string }[]).map(({ key, label }) => (
            <Field key={key} label={label}>
              <NumberInput
                value={field.acceptedRange[key] ?? ''}
                onChange={e => patchBand({ [key]: e.target.value ? Number(e.target.value) : 0 })}
              />
            </Field>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Model answer">
          <NumberInput value={field.modelAnswer ?? ''} onChange={e => patch({ modelAnswer: Number(e.target.value) })} />
        </Field>
        <Field label="Derivation (shown on submit)">
          <TextInput value={field.derivation ?? ''} onChange={e => patch({ derivation: e.target.value || undefined })} placeholder="Brief explanation" />
        </Field>
      </div>
    </div>
  )
}

// ── Formula section ───────────────────────────────────────────────────────────

function FormulaSection({
  formula,
  onChange,
  priorQuantNodes,
}: {
  formula: QuantFormula | undefined
  onChange: (f: QuantFormula | undefined) => void
  priorQuantNodes?: ScenarioNode[]
}) {
  const [enabled, setEnabled] = useState(!!formula)
  const [expression, setExpression] = useState(formula?.expression ?? '')
  const [display, setDisplay] = useState(formula?.display ?? '')
  const [variables, setVariables] = useState<QuantVariable[]>(formula?.variables ?? [])

  function handleExpressionChange(expr: string) {
    setExpression(expr)
    const vars = tokenizeExpression(expr, variables)
    setVariables(vars)
    onChange({ expression: expr, variables: vars, display: display || undefined })
  }

  function updateVar(idx: number, patch: Partial<QuantVariable>) {
    const updated = variables.map((v, i) => i === idx ? { ...v, ...patch } : v)
    setVariables(updated)
    onChange({ expression, variables: updated, display: display || undefined })
  }

  function toggleEnabled(on: boolean) {
    setEnabled(on)
    if (!on) onChange(undefined)
    else onChange({ expression, variables, display: display || undefined })
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={e => toggleEnabled(e.target.checked)} className="accent-emerald-400" />
        <span className="text-[12px] text-white/60 font-medium">Enable formula</span>
      </label>

      {enabled && (
        <>
          <Field label="Expression  (wrap variable names in { })">
            <TextInput
              value={expression}
              onChange={e => handleExpressionChange(e.target.value)}
              placeholder="e.g. {families} * {monthly_cost} * 12"
            />
          </Field>
          <Field label="Display formula (human-readable, shown as hint)">
            <TextInput
              value={display}
              onChange={e => {
                setDisplay(e.target.value)
                onChange({ expression, variables, display: e.target.value || undefined })
              }}
              placeholder="e.g. families × monthly cost × 12 months"
            />
          </Field>

          {variables.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionLabel label="Variables" />
              {variables.map((v, i) => {
                const sourceNode = priorQuantNodes?.find(n => n.nodeId === v.source?.nodeId)
                const sourceFields = sourceNode?.quant?.variant === 'structured-quant'
                  ? (sourceNode.quant as StructuredQuant).fields
                  : undefined
                return (
                  <div key={v.name} className="flex flex-wrap gap-2 items-center">
                    <span className="text-[12px] font-mono text-emerald-300/70 w-24 flex-none">{`{${v.name}}`}</span>
                    <TextInput
                      value={v.label}
                      onChange={e => updateVar(i, { label: e.target.value })}
                      placeholder="Label"
                    />
                    <TextInput
                      value={v.unit ?? ''}
                      onChange={e => updateVar(i, { unit: e.target.value || undefined })}
                      placeholder="Unit"
                    />
                    <div className="w-28 flex-none">
                      <SelectInput
                        value={v.format ?? 'decimal'}
                        onChange={e => updateVar(i, { format: e.target.value as QuantNumberFormat })}
                        options={FORMAT_OPTIONS}
                      />
                    </div>
                    {/* Carry-forward source */}
                    {priorQuantNodes && priorQuantNodes.length > 0 && (
                      <div className="w-52 flex-none">
                        <SelectInput
                          value={v.source?.nodeId ?? ''}
                          onChange={e => {
                            const nodeId = e.target.value
                            updateVar(i, { source: nodeId ? { nodeId } : undefined })
                          }}
                          options={[
                            { value: '', label: '← carry fwd: none' },
                            ...priorQuantNodes.map(n => ({
                              value: n.nodeId,
                              label: `← ${n.quant?.prompt?.slice(0, 28) ?? n.nodeId}`,
                            })),
                          ]}
                        />
                      </div>
                    )}
                    {/* Field picker when source is structured-quant */}
                    {sourceFields && sourceFields.length > 1 && (
                      <div className="w-36 flex-none">
                        <SelectInput
                          value={v.source?.fieldId ?? ''}
                          onChange={e => updateVar(i, { source: { ...v.source!, fieldId: e.target.value || undefined } })}
                          options={[
                            { value: '', label: 'Any field' },
                            ...sourceFields.map(f => ({ value: f.id, label: f.label })),
                          ]}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main editor ───────────────────────────────────────────────────────────────

interface Props {
  node: ScenarioNode
  allNodes?: ScenarioNode[]
  onDone: (updated: ScenarioNode) => void
}

export function QuantEditor({ node, allNodes, onDone }: Props) {
  const spec = node.quant!
  // Quant nodes that appear before this one — used for carry-forward dropdowns
  const nodeList = allNodes ?? []
  const currentIdx = nodeList.findIndex(n => n.nodeId === node.nodeId)
  const priorQuantNodes = nodeList.slice(0, currentIdx < 0 ? 0 : currentIdx).filter(n => n.type === 'quant' && n.quant)

  const [narrative, setNarrative] = useState(node.narrative ?? '')
  const [prompt, setPrompt] = useState(spec.prompt ?? '')
  const [hint, setHint] = useState(spec.hint ?? '')
  const [hintFootnote, setHintFootnote] = useState(spec.hintFootnote ?? '')
  const [formula, setFormula] = useState<QuantFormula | undefined>(spec.formula)

  // Single field (numeric-range) or multiple (structured-quant)
  const [fields, setFields] = useState<QuantFieldSpec[]>(
    spec.variant === 'structured-quant' ? spec.fields : [spec.field]
  )

  function updateField(idx: number, updated: QuantFieldSpec) {
    setFields(prev => prev.map((f, i) => i === idx ? updated : f))
  }

  function addField() {
    setFields(prev => [...prev, {
      id: `field-${Date.now()}`,
      label: '',
      format: 'decimal',
      acceptedRange: { min: 0, max: 100, idealMin: 40, idealMax: 60 },
      modelAnswer: 50,
    }])
  }

  function removeField(idx: number) {
    setFields(prev => prev.filter((_, i) => i !== idx))
  }

  function handleDone() {
    const base = { prompt, hint: hint || undefined, hintFootnote: hintFootnote || undefined, formula }
    let updatedSpec: QuantSpec
    if (spec.variant === 'numeric-range') {
      updatedSpec = { ...spec, ...base, field: fields[0] ?? spec.field }
    } else {
      updatedSpec = { ...spec, ...base, fields }
    }
    onDone({ ...node, narrative, quant: updatedSpec })
  }

  return (
    <EditShell emoji="🔢" kindLabel={spec.variant === 'structured-quant' ? 'Structured Quant' : 'Numeric Range'} onDone={handleDone}>
      <Field label="Narrative (framing above the prompt)">
        <Textarea value={narrative} onChange={e => setNarrative(e.target.value)} rows={2} placeholder="Context sentence shown above the question." />
      </Field>
      <Field label="Prompt (the question)">
        <Textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={2} placeholder="What is your estimate?" />
      </Field>

      {/* Fields / bands */}
      <div className="flex flex-col gap-3">
        <SectionLabel label={spec.variant === 'structured-quant' ? 'Fields' : 'Band'} />
        {fields.map((f, i) => (
          <FieldEditor
            key={f.id}
            field={f}
            onChange={updated => updateField(i, updated)}
            onRemove={spec.variant === 'structured-quant' && fields.length > 1 ? () => removeField(i) : undefined}
          />
        ))}
        {spec.variant === 'structured-quant' && (
          <AddButton onClick={addField} label="Add field" />
        )}
      </div>

      {/* Formula */}
      <div className="flex flex-col gap-2">
        <SectionLabel label="Formula (optional)" />
        <FormulaSection formula={formula} onChange={setFormula} priorQuantNodes={priorQuantNodes.length ? priorQuantNodes : undefined} />
      </div>

      {/* Hint */}
      <div className="flex flex-col gap-3">
        <SectionLabel label="Hint (optional — caps score at Proficient)" />
        <Field label="Hint text">
          <Textarea value={hint} onChange={e => setHint(e.target.value)} rows={2} placeholder="Approach or formula revealed when candidate asks for a hint." />
        </Field>
        <Field label="Hint footnote (jargon glossary)">
          <Textarea value={hintFootnote} onChange={e => setHintFootnote(e.target.value)} rows={2} placeholder="e.g. TAM = Total Addressable Market, SAM = Serviceable…" />
        </Field>
      </div>
    </EditShell>
  )
}
