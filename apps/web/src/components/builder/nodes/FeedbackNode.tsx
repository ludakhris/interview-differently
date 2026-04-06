import { Handle, Position, type NodeProps } from 'reactflow'
import type { ScenarioNode } from '@id/types'

const ACCENT = '#7b3fa0'

export function FeedbackNode({ selected }: NodeProps<ScenarioNode>) {
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
            marginBottom: 4,
          }}
        >
          Feedback Trigger
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
          Ends scenario &amp; triggers scoring
        </div>
      </div>
    </div>
  )
}
