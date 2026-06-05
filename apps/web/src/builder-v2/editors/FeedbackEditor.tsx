import { useState } from 'react'
import type { ScenarioNode } from '@id/types'
import { EditShell, Field, Textarea } from './shared'

interface Props {
  node: ScenarioNode
  onDone: (updated: ScenarioNode) => void
}

export function FeedbackEditor({ node, onDone }: Props) {
  const [narrative, setNarrative] = useState(node.narrative ?? '')

  return (
    <EditShell emoji="🏁" kindLabel="Ending" onDone={() => onDone({ ...node, narrative })}>
      <Field label="Closing narrative">
        <Textarea
          value={narrative}
          onChange={e => setNarrative(e.target.value)}
          rows={5}
          placeholder="Describe the outcome — what happened, what the candidate did well or missed."
        />
      </Field>
    </EditShell>
  )
}
