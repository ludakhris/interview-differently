import { describe, expect, it } from 'vitest'
import type { LibraryContent } from '@id/types'
import {
  canApprove,
  canReject,
  capText,
  contentList,
  levelText,
  statusText,
  tokenText,
  usedByText,
} from './contentReview'

const row = (over: Partial<LibraryContent> = {}): LibraryContent => ({
  id: 'p1',
  kind: 'practice',
  skillLabel: 'Joins',
  status: 'pending',
  reusable: false,
  title: 'You mix up joins.',
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

describe('content review', () => {
  it('lists practice and lessons together, newest first', () => {
    const old = row({ id: 'p1', createdAt: '2026-10-01T00:00:00.000Z' })
    const lesson = row({ id: 'l1', kind: 'lesson', createdAt: '2026-10-10T00:00:00.000Z' })
    const recent = row({ id: 'p2', createdAt: '2026-10-12T00:00:00.000Z' })
    expect(
      contentList({
        practice: [old, recent],
        lessons: [lesson],
        total: { practice: 2, lessons: 1 },
      }).map((r) => r.id)
    ).toEqual(['p2', 'l1', 'p1'])
  })

  it('says where a row stands', () => {
    expect(statusText(row())).toBe('Waiting for review')
    expect(statusText(row({ status: 'approved' }))).toBe('Shown to learners, not yet approved')
    expect(statusText(row({ status: 'approved', reusable: true }))).toBe('Approved for reuse')
    expect(statusText(row({ status: 'rejected' }))).toBe('Rejected')
  })

  it('reads token counts, leaving out what was not recorded', () => {
    expect(tokenText({ input: 1200, output: 340, cacheRead: 800, cacheWrite: 100 })).toBe(
      '1,200 in · 340 out · 900 cached'
    )
    expect(tokenText({ input: 10, output: 5, cacheRead: 0, cacheWrite: null })).toBe(
      '10 in · 5 out'
    )
    expect(tokenText({ input: null, output: null, cacheRead: null, cacheWrite: null })).toBeNull()
  })

  it('says when only the newest of a kind are listed', () => {
    const practice = [row(), row({ id: 'p2' })]
    const lessons = [row({ id: 'l1', kind: 'lesson' })]
    expect(capText({ practice, lessons, total: { practice: 2, lessons: 1 } })).toBeNull()
    expect(capText({ practice, lessons, total: { practice: 340, lessons: 1 } })).toBe(
      'Showing the newest 2 of 340 practice.'
    )
    expect(capText({ practice, lessons, total: { practice: 340, lessons: 9 } })).toBe(
      'Showing the newest 2 of 340 practice and the newest 1 of 9 lessons.'
    )
  })

  it('counts learners in plain words', () => {
    expect(usedByText({ learners: 0 })).toBe('Not used yet')
    expect(usedByText({ learners: 1 })).toBe('Used by 1 learner')
    expect(usedByText({ learners: 3 })).toBe('Used by 3 learners')
  })

  it('offers only the decisions that change something', () => {
    expect(canApprove(row({ status: 'approved' }))).toBe(true)
    expect(canApprove(row({ status: 'approved', reusable: true }))).toBe(false)
    expect(canApprove(row({ status: 'rejected' }))).toBe(true)
    expect(canReject(row({ status: 'rejected' }))).toBe(false)
    expect(canReject(row({ status: 'approved', reusable: true }))).toBe(true)
  })

  it('names who a lesson was written for in the words of the intake question', () => {
    expect(levelText('never')).toBe('For learners who have never written SQL')
    expect(levelText('some')).toBe('For learners who have written a little SQL')
    expect(levelText('regular')).toBe('For learners who use SQL regularly')
    expect(levelText(null)).toBeNull()
    expect(levelText('')).toBeNull()
    expect(levelText('constructor')).toBe('For learners who said “constructor”')
  })
})
