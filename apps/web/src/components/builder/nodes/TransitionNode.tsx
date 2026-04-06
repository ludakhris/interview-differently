import { Handle, Position, type NodeProps } from 'reactflow'
import type { ScenarioNode } from '@id/types'

const ACCENT = '#d4830a'

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '…'
}

export function TransitionNode({ data, selected }: NodeProps<ScenarioNode>) {
  return (
    <div
      style={{
        minWidth: 200,
        background: '#111111',
        border: `1px solid ${selected ? '#ffffff' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: selected ? '0 0 0 2px rgba(255,255,255,0.3)' : 'none',
      }}
    >
      <div style={{ height: 4, background: ACCENT }} />
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: ACCENT, border: '2px solid #0a0a0a' }}
      />
      <div style={{ padding: '12px 16px' }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: ACCENT,
            marginBottom: 6,
          }}
        >
          Transition
        </div>
        <div
          style={{
            fontSize: 12,
            color: data.narrative ? '#f5f3ee' : 'rgba(255,255,255,0.3)',
            lineHeight: 1.5,
          }}
        >
          {data.narrative ? truncate(data.narrative, 100) : 'No narrative yet…'}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: ACCENT, border: '2px solid #0a0a0a' }}
      />
    </div>
  )
}
