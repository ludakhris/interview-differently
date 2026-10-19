// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { ScenarioPhase } from '@id/types'
import { PhasesRail } from './PhasesRail'

function Harness({ onRename }: { onRename: (id: string, label: string) => void }) {
  const [phases, setPhases] = useState<ScenarioPhase[]>([])
  return (
    <PhasesRail
      phases={phases}
      activePhaseId={null}
      onSelect={() => {}}
      onReorder={() => {}}
      onRename={onRename}
      onAdd={() =>
        setPhases((p) => [...p, { id: `p${p.length + 1}`, label: 'New phase' } as ScenarioPhase])
      }
    />
  )
}

afterEach(cleanup)

describe('PhasesRail', () => {
  it('opens a new phase for naming, so Enter names it instead of adding another', async () => {
    const onRename = vi.fn()
    render(<Harness onRename={onRename} />)
    await userEvent.click(screen.getByRole('button', { name: /Add phase/ }))
    await userEvent.keyboard('Discovery{Enter}')
    expect(onRename).toHaveBeenCalledWith('p1', 'Discovery')
    expect(screen.getAllByRole('button', { name: 'New phase' })).toHaveLength(1)
  })
})
