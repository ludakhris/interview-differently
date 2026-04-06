import { Handle, Position, type NodeProps } from 'reactflow'
import type { ScenarioNode } from '@id/types'

const ACCENT = '#2d9e5f'

export function StartNode({ selected }: NodeProps<ScenarioNode>) {
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
          Start
        </div>
        <div style={{ fontSize: 13, color: '#f5f3ee', fontWeight: 600 }}>
          Entry Point
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
