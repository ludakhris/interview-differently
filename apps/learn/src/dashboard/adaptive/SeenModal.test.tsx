// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LearnerSeen } from '@id/types'

// "See what Theo saw": a video made for the learner plays in Spark's player, not as a storyboard.

const seen: LearnerSeen = {
  name: 'Theo Park',
  entries: [
    {
      kind: 'video',
      at: '2026-10-15T10:00:00.000Z',
      item: 'Filters',
      lessonId: 'lesson 1',
      title: 'Filtering rows',
      scenes: [
        { heading: 'Why filter', narration: 'Said aloud', visual: { kind: 'text' } as never },
      ],
      watched: null,
    },
  ],
}
let watch: { data: unknown; error: Error | null } = { data: null, error: null }
const paths: string[] = []
vi.mock('../api', () => ({
  useLoad: (path: string) => {
    paths.push(path)
    const r = path.endsWith('/seen') ? { data: seen, error: null } : watch
    return { ...r, loading: false, reload: vi.fn() }
  },
}))

import { LINK_EXPIRES_MS, SeenModal } from './SeenModal'

afterEach(() => {
  cleanup()
  paths.length = 0
})

describe('SeenModal video', () => {
  it('plays the video in Spark’s player with a watch link for that learner’s lesson', () => {
    watch = { data: { url: 'https://spark.example.test/lesson#token=t' }, error: null }
    render(<SeenModal cohortId="c1" enrollmentId="e1" onClose={() => {}} />)
    const frame = screen.getByTitle('Filtering rows')
    expect(frame.tagName).toBe('IFRAME')
    expect(frame.getAttribute('src')).toBe('https://spark.example.test/lesson#token=t')
    expect(paths).toContain('/learn/cohorts/c1/adaptive/learners/e1/seen/lessons/lesson%201/watch')
    expect(screen.queryByText('Said aloud')).toBeNull()
  })

  it('says the link has expired when the view stays open for an hour', () => {
    vi.useFakeTimers()
    try {
      watch = { data: { url: 'https://spark.example.test/lesson#token=t' }, error: null }
      render(<SeenModal cohortId="c1" enrollmentId="e1" onClose={() => {}} />)
      expect(screen.queryByText(/link has expired/)).toBeNull()
      act(() => {
        vi.advanceTimersByTime(LINK_EXPIRES_MS)
      })
      expect(screen.getByText(/link has expired/)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('falls back to the storyboard when the video cannot be loaded', () => {
    watch = { data: null, error: new Error('Lesson not found') }
    render(<SeenModal cohortId="c1" enrollmentId="e1" onClose={() => {}} />)
    expect(screen.queryByTitle('Filtering rows')).toBeNull()
    expect(screen.getByText('Said aloud')).toBeTruthy()
  })
})
