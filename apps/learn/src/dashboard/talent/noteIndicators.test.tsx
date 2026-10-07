// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { TalentParticipantRow } from '@id/types'

const loads: Record<string, unknown> = {}
vi.mock('../api', () => ({
  useApiSend: () => vi.fn(),
  useApiFetch: () => vi.fn(),
  downloadFile: vi.fn(),
  useLoad: (path: string) => ({
    data: loads[path] ?? null,
    error: null,
    loading: false,
    reload: vi.fn(),
  }),
}))
vi.mock('../app-context', () => ({ useApp: () => ({ href: (p: string) => p }) }))

import { CohortPage } from '../CohortPage'
import { ParticipantTable } from './TalentPage'

afterEach(() => {
  cleanup()
  for (const k of Object.keys(loads)) delete loads[k]
})

const person = (over: Partial<TalentParticipantRow>): TalentParticipantRow => ({
  userId: 'u1',
  name: 'Ada',
  email: null,
  cohorts: [],
  profileStatus: 'none',
  complete: null,
  fresh: null,
  profile: null,
  openSupportItems: 0,
  noteCount: 0,
  ...over,
})

describe('Talent list indicators', () => {
  it('shows notes and open follow-ups as links with accessible names, a dash when none', () => {
    render(
      <ParticipantTable
        rows={[
          person({ userId: 'u1', name: 'Ada', noteCount: 2, openSupportItems: 1 }),
          person({ userId: 'u2', name: 'Bo' }),
        ]}
      />
    )
    expect(screen.getByRole('columnheader', { name: 'Notes' })).toBeTruthy()
    const notes = screen.getByRole('link', { name: '2 notes' })
    expect(notes.getAttribute('href')).toBe('/lms/talent/u1#notes')
    expect(notes.getAttribute('title')).toBe('2 notes')
    expect(notes.querySelector('[aria-hidden="true"]')?.textContent).toBe('📝 2')
    const follow = screen.getByRole('link', { name: '1 open follow-up' })
    expect(follow.getAttribute('href')).toBe('/lms/talent/u1#follow-ups')
    expect(screen.getAllByRole('link', { name: /note|follow-up/ })).toHaveLength(2)
    expect(screen.getAllByLabelText('No notes or follow-ups')).toHaveLength(1)
  })
  it('says 1 note in the singular and shows only the kind that exists', () => {
    render(<ParticipantTable rows={[person({ noteCount: 1 })]} />)
    expect(screen.getByRole('link', { name: '1 note' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /follow-up/ })).toBeNull()
  })
})

const cohort = {
  id: 'c1',
  name: 'Fall',
  courseId: 'k1',
  courseTitle: 'Data Analysis',
  status: 'upcoming',
  startsAt: '2026-11-01T00:00:00Z',
  endsAt: '2026-12-01T00:00:00Z',
  joinKey: 'ABC',
  maxLearners: 20,
  enrolled: 3,
  lengthWeeks: 4,
  requiresApproval: false,
  joinContact: null,
  delivery: 'online',
  requiresProfile: false,
  profileRefreshMonths: null,
}
const rosterRow = (userId: string, name: string, noteSummary: unknown) => ({
  enrollmentId: `e-${userId}`,
  userId,
  name,
  email: null,
  status: 'enrolled',
  enrolledAt: '2026-11-02T00:00:00Z',
  itemsDone: 0,
  itemsTotal: 4,
  noteSummary,
})
const setup = (roster: unknown[]) => {
  loads['/learn/cohorts/c1'] = { ...cohort, roster }
  loads['/learn/cohorts/c1/join-requests'] = []
  return render(<CohortPage cohortId="c1" />)
}

describe('cohort roster indicators', () => {
  it('links to the Notes and follow-up sections of the learner record; dash for zero; none for self', () => {
    setup([
      rosterRow('a', 'Ann', { notes: 3, openFollowUps: 2 }),
      rosterRow('b', 'Bo', { notes: 0, openFollowUps: 0 }),
      rosterRow('me', 'Staff', null),
    ])
    expect(screen.getByRole('columnheader', { name: 'Notes' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '3 notes' }).getAttribute('href')).toBe(
      '/lms/cohorts/c1/learners/a#lr-notes'
    )
    expect(screen.getByRole('link', { name: '2 open follow-ups' }).getAttribute('href')).toBe(
      '/lms/cohorts/c1/learners/a#lr-support'
    )
    const bo = screen.getByRole('row', { name: /Bo/ })
    expect(within(bo).getByLabelText('No notes or follow-ups')).toBeTruthy()
    const me = screen.getByRole('row', { name: /Staff/ })
    expect(within(me).queryByLabelText('No notes or follow-ups')).toBeNull()
    expect(within(me).queryByRole('link', { name: /note|follow-up/ })).toBeNull()
  })
  it('has no Notes column or indicators when the server sent no counts', () => {
    setup([rosterRow('a', 'Ann', null), rosterRow('b', 'Bo', null)])
    expect(screen.queryByRole('columnheader', { name: 'Notes' })).toBeNull()
    expect(screen.queryByRole('link', { name: /note|follow-up/ })).toBeNull()
  })
})
