// ProfitTreeEditor — inline editor for profit-tree exhibits.
// Supports multiple top-level nodes (roots) and up to 3 levels of nesting.

import { useState } from 'react'
import type { ProfitTreeExhibit, ProfitTreeNode } from '@id/types'
import {
  EditShell, Field, TextInput, SelectInput, SectionLabel, AddButton, RemoveButton,
} from './shared'

const TONE_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'accent', label: 'Accent (green)' },
  { value: 'danger', label: 'Danger (red)' },
  { value: 'neutral', label: 'Neutral' },
]

interface Props {
  exhibit: ProfitTreeExhibit
  onDone: (updated: ProfitTreeExhibit) => void
}

function newNode(label = ''): ProfitTreeNode {
  return { id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label, children: [] }
}

function NodeRow({
  node,
  depth,
  onUpdate,
  onRemove,
}: {
  node: ProfitTreeNode
  depth: number
  onUpdate: (updated: ProfitTreeNode) => void
  onRemove?: () => void
}) {
  function addChild() {
    onUpdate({ ...node, children: [...(node.children ?? []), newNode()] })
  }
  function updateChild(idx: number, updated: ProfitTreeNode) {
    onUpdate({ ...node, children: (node.children ?? []).map((c, i) => i === idx ? updated : c) })
  }
  function removeChild(idx: number) {
    onUpdate({ ...node, children: (node.children ?? []).filter((_, i) => i !== idx) })
  }

  return (
    <div className={depth > 0 ? 'pl-6 border-l border-white/[0.06] ml-3' : ''}>
      <div className="flex gap-2 items-center mb-2">
        <TextInput
          value={node.label}
          onChange={e => onUpdate({ ...node, label: e.target.value })}
          placeholder="Node label"
        />
        <TextInput
          value={node.value ?? ''}
          onChange={e => onUpdate({ ...node, value: e.target.value || undefined })}
          placeholder="Value (e.g. $22M)"
        />
        <div className="w-36 flex-none">
          <SelectInput
            value={node.tone ?? ''}
            onChange={e => onUpdate({ ...node, tone: (e.target.value || undefined) as ProfitTreeNode['tone'] })}
            options={TONE_OPTIONS}
          />
        </div>
        {onRemove && <RemoveButton onClick={onRemove} />}
      </div>

      {(node.children ?? []).map((child, ci) => (
        <NodeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          onUpdate={updated => updateChild(ci, updated)}
          onRemove={() => removeChild(ci)}
        />
      ))}

      {depth < 2 && (
        <div className={depth > 0 ? 'pl-3' : ''}>
          <AddButton onClick={addChild} label="Add branch" />
        </div>
      )}
    </div>
  )
}

export function ProfitTreeEditor({ exhibit, onDone }: Props) {
  const [title, setTitle] = useState(exhibit.title ?? '')
  const [caption, setCaption] = useState(exhibit.caption ?? '')
  // Initialise from roots (multi-root) falling back to single root
  const [roots, setRoots] = useState<ProfitTreeNode[]>(exhibit.roots ?? [exhibit.root])

  function updateRoot(idx: number, updated: ProfitTreeNode) {
    setRoots(prev => prev.map((r, i) => i === idx ? updated : r))
  }
  function removeRoot(idx: number) {
    setRoots(prev => prev.filter((_, i) => i !== idx))
  }
  function addRoot() {
    setRoots(prev => [...prev, newNode()])
  }

  function handleDone() {
    // write roots; keep root = first root for backwards compat
    onDone({ ...exhibit, title, caption: caption || undefined, root: roots[0] ?? exhibit.root, roots })
  }

  return (
    <EditShell emoji="🌳" kindLabel="Profit Tree" onDone={handleDone}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Title">
          <TextInput value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Profit breakdown" />
        </Field>
        <Field label="Caption">
          <TextInput value={caption} onChange={e => setCaption(e.target.value)} placeholder="e.g. Trace the driver" />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel label="Tree" />
        {roots.map((root, i) => (
          <div key={root.id} className="p-3 border border-white/[0.06] rounded-xl bg-white/[0.01]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                {roots.length > 1 ? `Node ${i + 1}` : 'Root'}
              </span>
              {roots.length > 1 && <RemoveButton onClick={() => removeRoot(i)} />}
            </div>
            <NodeRow
              node={root}
              depth={0}
              onUpdate={updated => updateRoot(i, updated)}
            />
          </div>
        ))}
        <AddButton onClick={addRoot} label="Add top-level node" />
      </div>
    </EditShell>
  )
}
