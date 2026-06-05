import { useState } from 'react'
import type { ScenarioNode } from '@id/types'
import { EditShell, Field, Textarea, SelectInput } from './shared'

interface Props {
  node: ScenarioNode
  allNodes: ScenarioNode[]
  onDone: (updated: ScenarioNode) => void
}

export function TransitionEditor({ node, allNodes, onDone }: Props) {
  const [narrative, setNarrative] = useState(node.narrative ?? '')
  const [nextNodeId, setNextNodeId] = useState(node.nextNodeId ?? '')

  const targetOptions = [
    { value: '', label: '— unset —' },
    ...allNodes
      .filter(n => n.nodeId !== node.nodeId)
      .map(n => ({
        value: n.nodeId,
        label: `${n.nodeId} — ${n.narrative?.slice(0, 40) ?? n.type}${(n.narrative?.length ?? 0) > 40 ? '…' : ''}`,
      })),
  ]

  return (
    <EditShell emoji="↩" kindLabel="Redirect / Transition" onDone={() => onDone({ ...node, narrative, nextNodeId })}>
      <Field label="Bridge narrative">
        <Textarea
          value={narrative}
          onChange={e => setNarrative(e.target.value)}
          rows={3}
          placeholder="What does the interviewer say to redirect or bridge to the next topic?"
        />
      </Field>
      <Field label="Continues to">
        <SelectInput
          value={nextNodeId}
          onChange={e => setNextNodeId(e.target.value)}
          options={targetOptions}
        />
      </Field>
    </EditShell>
  )
}
