import { Handle, Position, type NodeProps } from 'reactflow'
import type { ScenarioNode } from '@id/types'

const ACCENT = '#1a5a8a'
const CHOICE_IDS = ['A', 'B', 'C', 'D'] as const

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '…'
}

export function DecisionNode({ data, selected }: NodeProps<ScenarioNode>) {
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
          Decision
        </div>
        <div
          style={{
            fontSize: 12,
            color: data.narrative ? '#f5f3ee' : 'rgba(255,255,255,0.3)',
            lineHeight: 1.5,
            marginBottom: 10,
          }}
        >
          {data.narrative ? truncate(data.narrative, 120) : 'No narrative yet…'}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {CHOICE_IDS.map(id => {
            const choice = data.choices?.find(c => c.id === id)
            return (
              <div
                key={id}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: 10,
                  fontWeight: 700,
                  color: choice?.text ? '#f5f3ee' : 'rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: 4,
                  padding: '3px 0',
                }}
              >
                {id}
              </div>
            )
          })}
        </div>
      </div>
      {/* Output handles for each choice */}
      {CHOICE_IDS.map((id, i) => (
        <Handle
          key={id}
          type="source"
          position={Position.Bottom}
          id={id}
          style={{
            background: ACCENT,
            border: '2px solid #0a0a0a',
            left: `${12.5 + i * 25}%`,
          }}
        />
      ))}
    </div>
  )
}
