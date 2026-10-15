// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdaptiveBoard, BoardPractice, ContentLibrary, LibraryContent } from '@id/types'

// "Watch the lesson" (GitHub issue #90): on both review screens, for lessons only, opening Spark's player in a new tab.

let loaded: unknown = null
const apiFetch = vi.fn<[string], Promise<Response>>(
  async () =>
    ({ json: async () => ({ url: 'https://spark.example.test/lesson#token=t' }) }) as Response
)
vi.mock('./api', () => ({
  useApiFetch: () => apiFetch,
  useApiSend: () => vi.fn(),
  useLoad: () => ({ data: loaded, error: null, loading: false, reload: vi.fn() }),
}))
vi.mock('./app-context', () => ({ useApp: () => ({ href: (p: string) => p }) }))
vi.mock('./shared', () => ({ errorNotice: () => null, useRole: () => 'system-admin' }))
vi.mock('./AdminPages', () => ({ SYSTEM_ADMIN: 'system-admin' }))
vi.mock('./DashboardShell', () => ({ Notice: () => null }))

import { ContentReviewPage } from './ContentReviewPage'
import { AdaptiveBoardPage } from './adaptive/AdaptiveBoardPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  apiFetch.mockClear()
})

const row = (over: Partial<LibraryContent>): LibraryContent => ({
  id: 'p1',
  kind: 'practice',
  skillLabel: 'Joins',
  status: 'pending',
  reusable: false,
  title: 'Practice title',
  bankSlug: 'bank',
  level: null,
  parts: [],
  model: 'm',
  promptVersion: 'v1',
  tokens: { input: null, output: null, cacheRead: null, cacheWrite: null },
  createdAt: '2026-10-14T09:00:00.000Z',
  reviewedAt: null,
  reviewedBy: null,
  uses: 0,
  learners: 0,
  ...over,
})

const card = (over: Partial<BoardPractice>): BoardPractice => ({
  id: 'p1',
  kind: 'practice',
  learnerName: 'Ana',
  skillLabel: 'Joins',
  status: 'pending',
  reviewed: false,
  intro: 'Practice intro',
  tasks: ['Task'],
  model: 'm',
  createdAt: '2026-10-14T09:00:00.000Z',
  ...over,
})

describe('Content review', () => {
  it('offers to watch lessons only, and names the level in plain words', () => {
    const lib: ContentLibrary = {
      practice: [row({})],
      lessons: [
        row({
          id: 'l1',
          kind: 'lesson',
          title: 'Lesson title',
          bankSlug: null,
          level: 'never',
          createdAt: '2026-10-15T09:00:00.000Z',
        }),
      ],
      total: { practice: 1, lessons: 1 },
    }
    loaded = lib
    render(<ContentReviewPage />)
    expect(screen.getAllByRole('button', { name: 'Watch the lesson' })).toHaveLength(1)
    expect(screen.getByText(/For learners who have never written SQL/)).toBeTruthy()
    expect(screen.queryByText(/“never”/)).toBeNull()
    expect(screen.getAllByText(/Reject removes it from the library for everyone/)).toHaveLength(2)
  })

  it('opens the tab inside the click, cut from this page, then points it at the preview link', async () => {
    loaded = {
      practice: [],
      lessons: [row({ id: 'l 1', kind: 'lesson' })],
      total: { practice: 0, lessons: 1 },
    }
    const tab = { opener: {} as unknown, location: { href: '' }, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    render(<ContentReviewPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Watch the lesson' }))
    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(tab.opener).toBeNull()
    await waitFor(() => expect(tab.location.href).toBe('https://spark.example.test/lesson#token=t'))
    expect(apiFetch).toHaveBeenCalledWith('/learn/admin/content/lesson/l%201/preview')
  })

  it('closes the tab and says why when the link cannot be had', async () => {
    loaded = {
      practice: [],
      lessons: [row({ id: 'l1', kind: 'lesson' })],
      total: { practice: 0, lessons: 1 },
    }
    apiFetch.mockRejectedValueOnce(new Error('Lesson not found'))
    const tab = { opener: null, location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    render(<ContentReviewPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Watch the lesson' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Lesson not found'))
    expect(tab.close).toHaveBeenCalled()
  })
})

describe('the board’s review section', () => {
  it('offers to watch lessons only, with what each decision does by the buttons', () => {
    const board: AdaptiveBoard = {
      cohortId: 'c1',
      courseTitle: 'Course',
      skills: [],
      settings: { testOut: true, approveGenerated: true, canEdit: false },
      learners: [],
      practice: [
        card({}),
        card({ id: 'l1', kind: 'lesson', intro: 'Lesson title', status: 'approved' }),
      ],
      jobTitle: null,
      outline: [],
    }
    loaded = board
    render(<AdaptiveBoardPage cohortId="c1" />)
    expect(screen.getAllByRole('button', { name: 'Watch the lesson' })).toHaveLength(1)
    expect(screen.getByText(/shows it to the learner and lets it be reused/)).toBeTruthy()
    expect(screen.getByText('Approve lets it be reused for other learners.')).toBeTruthy()
    expect(screen.getAllByText(/Send back gives this cohort’s learners a new one/)).toHaveLength(2)
    expect(screen.queryByText(/Approving it also approves it for reuse/)).toBeNull()
  })

  it('asks the board for the preview of a lesson in this cohort', async () => {
    loaded = {
      cohortId: 'c1',
      courseTitle: 'Course',
      skills: [],
      settings: { testOut: true, approveGenerated: true, canEdit: false },
      learners: [],
      practice: [card({ id: 'l1', kind: 'lesson' })],
      jobTitle: null,
      outline: [],
    } satisfies AdaptiveBoard
    const tab = { opener: null, location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    render(<AdaptiveBoardPage cohortId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Watch the lesson' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/learn/cohorts/c1/adaptive/content/l1/preview')
    )
  })
})
