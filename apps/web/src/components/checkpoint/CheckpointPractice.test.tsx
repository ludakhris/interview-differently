// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { CheckpointView } from '@id/types'
import { CheckpointPractice, PENDING_POLL_MS } from './CheckpointPractice'
import { CheckpointError } from '@/services/checkpointService'

const client = {
  view: vi.fn(),
  answer: vi.fn(),
  run: vi.fn(),
  help: vi.fn(),
  practice: vi.fn(),
}

const slot = (status: 'writing' | 'pending' | 'ready' | 'rejected'): CheckpointView => ({
  deliveryId: 'd1',
  title: 'Practice',
  scenario: null,
  diagnostic: false,
  oneAnswer: false,
  schema: [],
  tasks: [],
  answers: {},
  practice: { status, skill: 'GROUP BY', intro: null },
  done: false,
  scorePct: null,
})

function setup(gate: 'writing' | 'pending' | 'rejected') {
  const onView = vi.fn()
  const onSessionEnded = vi.fn()
  const utils = render(
    <CheckpointPractice
      view={slot(gate)}
      gate={gate}
      client={client}
      onView={onView}
      onSessionEnded={onSessionEnded}
    />
  )
  return { ...utils, onView, onSessionEnded }
}

const tick = () => act(async () => vi.advanceTimersByTimeAsync(PENDING_POLL_MS))

beforeEach(() => Object.values(client).forEach((f) => f.mockReset()))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CheckpointPractice', () => {
  it('looks again every 20 seconds while pending, and stops once it changes', async () => {
    vi.useFakeTimers()
    client.view.mockResolvedValueOnce(slot('pending'))
    client.view.mockResolvedValueOnce(slot('ready'))
    const { onView } = setup('pending')
    await act(async () => vi.advanceTimersByTimeAsync(PENDING_POLL_MS - 1))
    expect(client.view).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(client.view).toHaveBeenCalledTimes(1)
    expect(onView).not.toHaveBeenCalled()
    await tick()
    expect(onView).toHaveBeenCalledWith(slot('ready'))
    await tick()
    await tick()
    expect(client.view).toHaveBeenCalledTimes(2)
  })

  it('stops looking when the page goes', async () => {
    vi.useFakeTimers()
    client.view.mockResolvedValue(slot('pending'))
    const { unmount } = setup('pending')
    await tick()
    unmount()
    await tick()
    expect(client.view).toHaveBeenCalledTimes(1)
  })

  it('hands an ended session to the page while pending', async () => {
    vi.useFakeTimers()
    client.view.mockRejectedValue(new CheckpointError(401, 'expired'))
    const { onSessionEnded } = setup('pending')
    await tick()
    await tick()
    expect(onSessionEnded).toHaveBeenCalledTimes(1)
    expect(client.view).toHaveBeenCalledTimes(1)
  })

  it('does not poll when the slot is not pending', async () => {
    vi.useFakeTimers()
    setup('rejected')
    await tick()
    expect(client.view).not.toHaveBeenCalled()
  })

  it('says so when the practice is still not written, and asks again', async () => {
    client.practice.mockResolvedValueOnce(slot('writing'))
    client.practice.mockResolvedValueOnce(slot('pending'))
    const { onView } = setup('writing')
    expect(await screen.findByText('We could not write your practice just now.')).toBeTruthy()
    expect(onView).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(onView).toHaveBeenCalledWith(slot('pending')))
    expect(client.practice).toHaveBeenCalledTimes(2)
  })
})
