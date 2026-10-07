// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LearnerActivityReport, LearnerRecord } from '@id/types'

const send = vi.fn()
const reload = vi.fn()
const loads: Record<string, unknown> = {}
const errors: Record<string, Error> = {}
const requested: string[] = []
let tzName = 'America/New_York'
let kind = 'provider'
vi.mock('../api', () => ({
  useApiSend: () => send,
  useApiFetch: () => vi.fn(),
  useLoad: (path: string | null) => {
    if (path) requested.push(path)
    const key = path?.replace(/\?.*/, '') ?? ''
    return {
      data: path && !errors[key] ? (loads[key] ?? null) : null,
      error: path ? (errors[key] ?? null) : null,
      loading: false,
      reload,
    }
  },
}))
vi.mock('../app-context', () => ({
  useApp: () => ({ href: (p: string) => p, current: { kind } }),
}))
vi.mock('../shared', () => ({ errorNotice: (e: Error) => <p role="alert">Oops: {e.message}</p> }))
vi.mock('../activity/activityLogic', async (orig) => ({
  ...(await orig<typeof import('../activity/activityLogic')>()),
  localTz: () => tzName,
}))

import { LearnerRecordPage } from './LearnerRecordPage'

const RECORD = '/learn/cohorts/c1/learners/u1/record'
const WEEK = '/learn/cohorts/c1/activity/learners/u1'

const activity: LearnerActivityReport = {
  cohortId: 'c1',
  userId: 'u1',
  name: 'Lena Learner',
  from: '2026-09-08',
  to: '2026-10-07',
  tz: 'America/New_York',
  totalSeconds: 5400,
  activeDays: 2,
  averagePerActiveDaySeconds: 2700,
  days: [
    {
      day: '2026-10-06',
      seconds: 3600,
      firstSeenAt: '2026-10-06T13:05:00.000Z',
      lastSeenAt: '2026-10-06T14:10:00.000Z',
      sessionCount: 1,
      sessions: [
        {
          startedAt: '2026-10-06T13:05:00.000Z',
          seconds: 3600,
          itemId: 'i1',
          title: 'Resume basics',
        },
      ],
    },
  ],
}

function record(over: Partial<LearnerRecord['notes']> = {}, profile = true): LearnerRecord {
  return {
    header: {
      userId: 'u1',
      name: 'Lena Learner',
      email: 'lena@x.org',
      status: 'enrolled',
      joinedAt: '2026-09-02T12:00:00.000Z',
      courseTitle: 'Interview Ready',
      cohortName: 'Fall 2026',
      providerId: 'p1',
      progress: { itemsDone: 3, itemsTotal: 8 },
      readiness: { goal: 70, interviewBest: 82, interviewReady: true },
      profile: profile ? { status: 'shared', complete: true, fresh: null } : null,
    },
    attendance: {
      ratePct: 50,
      sessionsCounted: 2,
      marks: [
        {
          sessionId: 's2',
          title: 'Week 2',
          startsAt: '2026-10-08T01:30:00.000Z',
          status: 'absent',
          skipped: null,
          note: null,
        },
        {
          sessionId: 's1',
          title: 'Week 1',
          startsAt: '2026-10-01T14:00:00.000Z',
          status: 'present',
          skipped: null,
          note: 'Left early for work',
        },
      ],
    },
    activity,
    notes: {
      attendance: [
        {
          sessionId: 's1',
          sessionTitle: 'Week 1',
          cohortName: 'Fall 2026',
          startsAt: '2026-10-01T14:00:00.000Z',
          note: 'Left early for work',
          markedBy: 'Olu Org',
          markedAt: '2026-10-02T09:00:00.000Z',
        },
      ],
      participant: [
        {
          id: 'n1',
          providerId: 'p1',
          userId: 'u1',
          cohortId: 'c1',
          authorId: 'a',
          authorName: 'Dana Reyes',
          body: 'Needs a laptop',
          createdAt: '2026-10-05T10:00:00.000Z',
          updatedAt: '2026-10-05T10:00:00.000Z',
        },
        {
          id: 'n0',
          providerId: 'p1',
          userId: 'u1',
          cohortId: null,
          authorId: 'a',
          authorName: 'Dana Reyes',
          body: 'Older note',
          createdAt: '2026-09-20T10:00:00.000Z',
          updatedAt: '2026-09-20T10:00:00.000Z',
        },
      ],
      support: [
        {
          id: 'i1',
          providerId: 'p1',
          userId: 'u1',
          cohortId: null,
          title: 'Bus pass',
          category: 'transportation',
          details: null,
          status: 'open',
          dueDate: null,
          assigneeId: null,
          assigneeName: null,
          createdById: 'a',
          createdByName: 'Dana',
          resolvedAt: null,
          createdAt: '2026-10-01T10:00:00.000Z',
          updatedAt: '2026-10-01T10:00:00.000Z',
        },
        {
          id: 'i2',
          providerId: 'p1',
          userId: 'u1',
          cohortId: null,
          title: 'Old ride',
          category: 'transportation',
          details: null,
          status: 'resolved',
          dueDate: null,
          assigneeId: null,
          assigneeName: null,
          createdById: 'a',
          createdByName: 'Dana',
          resolvedAt: null,
          createdAt: '2026-10-01T10:00:00.000Z',
          updatedAt: '2026-10-01T10:00:00.000Z',
        },
      ],
      restricted: false,
      cohortNames: { c1: 'Fall 2026' },
      ...over,
    },
  }
}

beforeEach(() => {
  tzName = 'America/New_York'
  kind = 'provider'
})
afterEach(() => {
  cleanup()
  send.mockReset()
  reload.mockReset()
  requested.length = 0
  for (const k of Object.keys(loads)) delete loads[k]
  for (const k of Object.keys(errors)) delete errors[k]
})

const open = () => render(<LearnerRecordPage cohortId="c1" userId="u1" />)

describe('LearnerRecordPage', () => {
  it('asks for the record in the viewer timezone', () => {
    loads[RECORD] = record()
    open()
    expect(requested).toContain(`${RECORD}?tz=America%2FNew_York`)
  })

  it('shows the header, a back link and the sections in order with a nav', () => {
    loads[RECORD] = record()
    open()
    expect(screen.getByRole('heading', { level: 1, name: 'Lena Learner' })).toBeTruthy()
    expect(screen.getByText('lena@x.org')).toBeTruthy()
    expect(screen.getByText('Enrolled')).toBeTruthy()
    expect(screen.getByText(/3 of 8 items/)).toBeTruthy()
    expect(
      screen.getByText('Interview readiness (goal 70%): Ready to interview (82%)')
    ).toBeTruthy()
    expect(screen.getByText(/Profile shared with you, complete/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '← Back to the cohort' }).getAttribute('href')).toBe(
      '/lms/cohorts/c1'
    )
    expect(screen.getByRole('link', { name: 'View their profile' }).getAttribute('href')).toBe(
      '/lms/talent/u1'
    )
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(h2).toEqual(['Attendance', 'Activity', 'Notes', 'Support follow-ups'])
    const nav = within(screen.getByRole('navigation', { name: 'On this page' }))
    expect(nav.getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Attendance',
      'Activity',
      'Notes',
      'Support follow-ups1',
    ])
  })

  it('shows the attendance sessions with local time, status letter and word, and the note inline', () => {
    loads[RECORD] = record()
    open()
    expect(screen.getByText('50% attendance')).toBeTruthy()
    const rows = screen.getAllByRole('row').filter((r) => r.id.startsWith('lr-session-'))
    expect(rows.map((r) => r.id)).toEqual(['lr-session-s2', 'lr-session-s1'])
    // 01:30 UTC on Oct 8 is still Oct 7, 9:30 PM in New York.
    expect(within(rows[0]).getByText('Oct 7, 2026, 9:30 PM')).toBeTruthy()
    expect(within(rows[0]).getByText(/Absent/)).toBeTruthy()
    expect(within(rows[1]).getByText(/Present/)).toBeTruthy()
    expect(within(rows[1]).getByText('Left early for work')).toBeTruthy()
  })

  it('uses the viewer timezone for session times', () => {
    tzName = 'Asia/Tokyo'
    loads[RECORD] = record()
    open()
    expect(screen.getByText('Oct 8, 2026, 10:30 AM')).toBeTruthy()
  })

  it('shows the activity cards and a daily table with expandable sessions, local time', async () => {
    loads[RECORD] = record()
    open()
    expect(screen.getByText('Average per active day')).toBeTruthy()
    expect(screen.getByText('1 h 30 min')).toBeTruthy()
    const row = screen.getByRole('row', { name: /Tue, Oct 6/ })
    // 13:05 UTC is 9:05 AM in New York.
    expect(within(row).getByText('9:05 AM')).toBeTruthy()
    await userEvent.click(within(row).getByRole('button', { name: /1 session/ }))
    expect(screen.getByText(/9:05 AM, 1 h 00 min: Resume basics/)).toBeTruthy()
  })

  it('loads the last 7 days from the activity endpoint only when chosen', async () => {
    loads[RECORD] = record()
    loads[WEEK] = {
      ...activity,
      totalSeconds: 600,
      activeDays: 1,
      averagePerActiveDaySeconds: 600,
      days: [],
    }
    open()
    expect(requested.some((p) => p.startsWith(WEEK))).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Last 7 days' }))
    expect(requested.some((p) => p.startsWith(`${WEEK}?from=`))).toBe(true)
    expect(screen.getAllByText('10 min')).toHaveLength(2)
    expect(screen.getByText(/No activity was recorded/)).toBeTruthy()
  })

  it('merges notes and attendance notes into one feed, newest written first, tagged by cohort', () => {
    loads[RECORD] = record()
    open()
    const feed = within(screen.getByRole('list', { name: 'Notes, newest first' }))
    const items = feed.getAllByRole('listitem').map((li) => li.textContent ?? '')
    expect(items[0]).toContain('Needs a laptop')
    expect(items[1]).toContain('Left early for work')
    expect(items[2]).toContain('Older note')
    // The pill is the cohort; a note about no cohort says so. There is no generic "Note" pill.
    expect(items[0]).toContain('Fall 2026')
    expect(items[1]).toContain('Fall 2026')
    expect(items[2]).toContain('All cohorts')
    expect(feed.queryByText('Note')).toBeNull()
    // The attendance detail stays as the secondary line, linking to the session row.
    const detail = feed.getByRole('link', { name: 'Attendance · Week 1 · Oct 1, 2026' })
    expect(detail.getAttribute('href')).toBe('#lr-session-s1')
  })

  it('shows the staff-only notice with a lock', () => {
    loads[RECORD] = record()
    open()
    const note = screen.getByRole('note')
    expect(note.textContent).toBe(
      "Only your organization's staff can see notes. Learners never can."
    )
    expect(note.querySelector('svg[aria-hidden="true"]')).toBeTruthy()
  })

  it('shows support follow-ups for provider staff: helper, add form, open ones counted', () => {
    loads[RECORD] = record()
    open()
    expect(screen.getByText(/Things you are tracking to help this person succeed/)).toBeTruthy()
    expect(screen.getByLabelText('What would help?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add item' })).toBeTruthy()
    expect(screen.getAllByText('Bus pass').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /Support follow-ups/ }).textContent).toContain('1')
  })

  it('adds a note through the existing notes endpoint, saved with this cohort, and shows it first', async () => {
    loads[RECORD] = record()
    send.mockResolvedValue({
      id: 'n2',
      providerId: 'p1',
      userId: 'u1',
      cohortId: 'c1',
      authorId: 'me',
      authorName: 'Me',
      body: 'Called today',
      createdAt: '2026-10-07T10:00:00.000Z',
      updatedAt: '2026-10-07T10:00:00.000Z',
    })
    open()
    expect(screen.queryByLabelText('About this cohort')).toBeNull()
    expect(
      screen.getByText('Saved to Fall 2026. Notes follow this person across all your cohorts.')
    ).toBeTruthy()
    await userEvent.type(screen.getByLabelText('Add a note'), 'Called today')
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(send).toHaveBeenCalledWith('POST', '/learn/providers/p1/participants/u1/notes', {
      body: 'Called today',
      cohortId: 'c1',
    })
    await waitFor(() => expect(screen.getByText('Called today')).toBeTruthy())
    const first = screen
      .getAllByRole('listitem')
      .find((li) => li.textContent?.includes('Called today'))
    expect(first).toBeTruthy()
    expect(screen.getAllByRole('status')[0].textContent).toBe('Note added.')
  })

  it('shows an error and keeps the text when adding fails', async () => {
    loads[RECORD] = record()
    send.mockRejectedValue(new Error('Write something in the note first'))
    open()
    await userEvent.type(screen.getByLabelText('Add a note'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() =>
      expect(screen.getAllByRole('status')[0].textContent).toMatch(/Write something/)
    )
    expect((screen.getByLabelText('Add a note') as HTMLTextAreaElement).value).toBe('x')
  })

  it('restricted: no add box, no follow-up form, no profile chip; attendance notes still show', () => {
    loads[RECORD] = record({ participant: null, support: null, restricted: true }, false)
    open()
    expect(screen.queryByLabelText('Add a note')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull()
    expect(screen.queryByLabelText('What would help?')).toBeNull()
    expect(screen.getByText('Support follow-ups are visible to provider staff only.')).toBeTruthy()
    expect(screen.queryByText(/Profile/)).toBeNull()
    expect(screen.getByText(/only its staff can see or add them/)).toBeTruthy()
    const items = screen.getAllByRole('listitem').map((li) => li.textContent ?? '')
    expect(items.some((t) => t.includes('Left early for work'))).toBe(true)
    expect(items.some((t) => t.includes('Needs a laptop'))).toBe(false)
  })

  it('does not link to the profile outside a provider workspace', () => {
    kind = 'organization'
    loads[RECORD] = record()
    open()
    expect(screen.queryByRole('link', { name: 'View their profile' })).toBeNull()
  })

  it('shows empty states', () => {
    const r = record({ attendance: [], participant: [], support: [] })
    r.attendance = { ratePct: null, sessionsCounted: 0, marks: [] }
    r.activity = {
      ...activity,
      totalSeconds: 0,
      activeDays: 0,
      averagePerActiveDaySeconds: 0,
      days: [],
    }
    loads[RECORD] = r
    open()
    expect(screen.getByText(/No sessions have been held/)).toBeTruthy()
    expect(screen.getByText(/No activity was recorded/)).toBeTruthy()
    expect(screen.getByText('No notes yet.')).toBeTruthy()
    expect(screen.getByText('Nothing to follow up on yet.')).toBeTruthy()
  })

  it('shows loading, then an error with a retry', async () => {
    const { unmount } = open()
    expect(screen.getByText('Loading the record…')).toBeTruthy()
    unmount()
    errors[RECORD] = new Error('Server fell over')
    open()
    expect(screen.getByRole('alert').textContent).toContain('Server fell over')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reload).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: '← Back to the cohort' })).toBeTruthy()
  })
})
