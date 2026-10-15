// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { CheckpointSimulation } from '@id/types'
import { WorkSimulationCards, simulationCompetencies, simulationStatus } from '../WorkSimulations'

const service = vi.hoisted(() => ({ startSimulation: vi.fn() }))
vi.mock('@/services/checkpointService', async (real) => ({
  ...(await real<typeof import('@/services/checkpointService')>()),
  ...service,
}))

const sim = (over: Partial<CheckpointSimulation> = {}): CheckpointSimulation => ({
  bankSlug: 'orders',
  title: 'Orders desk',
  requests: 3,
  answered: 0,
  done: false,
  scorePct: null,
  competencies: [],
  ...over,
})

const getToken = async () => 'clerk-token'

function setup(sims: CheckpointSimulation[]) {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route
          path="/dashboard"
          element={<WorkSimulationCards sims={sims} getToken={getToken} color="#0a9396" />}
        />
        <Route path="/simulations/:deliveryId" element={<p>Simulation page</p>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => Object.values(service).forEach((f) => f.mockReset()))
afterEach(cleanup)

describe('WorkSimulationCards', () => {
  it('lists the simulations and opens one on its delivery', async () => {
    service.startSimulation.mockResolvedValue({ deliveryId: 'd1' })
    setup([sim()])
    fireEvent.click(await screen.findByRole('button', { name: /Orders desk/ }))
    expect(await screen.findByText('Simulation page')).toBeTruthy()
    expect(service.startSimulation).toHaveBeenCalledWith(getToken, 'orders')
  })

  it('turns each skill into a competency profile row, averaging a skill two simulations share', () => {
    expect(
      simulationCompetencies([
        sim({
          competencies: [
            { name: 'Finding the right records', score: 100 },
            { name: 'Summarizing data', score: 50 },
          ],
        }),
        sim({ bankSlug: 'b', competencies: [{ name: 'Summarizing data', score: 0 }] }),
      ])
    ).toEqual([
      { dimension: 'Finding the right records', averageScore: 100 },
      { dimension: 'Summarizing data', averageScore: 25 },
    ])
  })

  it('says where the learner is in each', () => {
    expect(simulationStatus(sim())).toBe('3 requests')
    expect(simulationStatus(sim({ answered: 1 }))).toBe('1 of 3 answered')
    expect(simulationStatus(sim({ answered: 3, done: true, scorePct: 67 }))).toBe(
      'Done · 67% right'
    )
  })
})
