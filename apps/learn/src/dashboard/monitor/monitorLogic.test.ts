import { describe, expect, it } from 'vitest'
import type { AssessmentMonitorStudent } from '@id/types'
import type { AssessmentMonitorDelivery } from '@id/types'
import {
  limitText,
  monitorEntries,
  progressPercent,
  progressText,
  sortStudents,
  whenText,
} from './monitorLogic'

const student = (over: Partial<AssessmentMonitorStudent> = {}): AssessmentMonitorStudent => ({
  userId: 'u1',
  name: 'Ana',
  email: null,
  status: 'in_progress',
  answeredCount: 3,
  questionCount: 4,
  startedAt: null,
  submittedAt: null,
  lastActivityAt: null,
  ...over,
})

describe('monitorLogic', () => {
  it('rounds progress to a whole percent and is 0 when nothing was drawn', () => {
    expect(progressPercent(student())).toBe(75)
    expect(progressPercent(student({ answeredCount: 1, questionCount: 3 }))).toBe(33)
    expect(progressPercent(student({ answeredCount: 0, questionCount: 0 }))).toBe(0)
  })

  it('words progress, with a dash before the learner starts', () => {
    expect(progressText(student())).toBe('3 of 4 answered')
    expect(progressText(student({ status: 'not_started', answeredCount: 0 }))).toBe('—')
  })

  it('shows a dash for a missing or invalid time', () => {
    expect(whenText(null)).toBe('—')
    expect(whenText('nope')).toBe('—')
    expect(whenText('2026-10-09T16:42:00Z')).toMatch(/Oct 9/)
  })

  it('words a time limit only when there is one', () => {
    expect(limitText(30)).toBe('30 min limit')
    expect(limitText(null)).toBeNull()
  })

  it('sorts students by a column, falling back to name so rows do not jump', () => {
    const rows = [
      student({ userId: 'a', name: 'Cy', status: 'not_started', answeredCount: 0 }),
      student({
        userId: 'b',
        name: 'Ben',
        answeredCount: 1,
        lastActivityAt: '2026-10-09T16:05:00Z',
      }),
      student({ userId: 'c', name: 'Ana', status: 'submitted', answeredCount: 4 }),
      student({
        userId: 'd',
        name: 'Al',
        answeredCount: 3,
        lastActivityAt: '2026-10-09T16:09:00Z',
      }),
    ]
    const names = (key: Parameters<typeof sortStudents>[1], dir: 'asc' | 'desc' = 'asc') =>
      sortStudents(rows, key, dir).map((s) => s.name)
    expect(names('status')).toEqual(['Al', 'Ben', 'Ana', 'Cy']) // in progress, submitted, not started
    expect(names('name')).toEqual(['Al', 'Ana', 'Ben', 'Cy'])
    expect(names('name', 'desc')).toEqual(['Cy', 'Ben', 'Ana', 'Al'])
    expect(names('progress', 'desc')).toEqual(['Ana', 'Al', 'Ben', 'Cy'])
    expect(names('saved', 'desc')).toEqual(['Al', 'Ben', 'Ana', 'Cy'])
  })

  describe('what the monitor can show', () => {
    const d = (
      id: string,
      label: string,
      counts: Partial<AssessmentMonitorDelivery['counts']> = {},
      tags: string[] = []
    ): AssessmentMonitorDelivery => ({
      id,
      label,
      tags,
      assessmentTitle: null,
      itemId: null,
      opensAt: null,
      closesAt: null,
      timeLimitMinutes: null,
      counts: { notStarted: 0, inProgress: 0, submitted: 0, ...counts },
      students: [],
    })
    const data = {
      generatedAt: 'now',
      cohort: { id: 'k', name: 'K' },
      deliveries: [
        d('pre', 'Pre-assessment'),
        d('post', 'Post-assessment', {}, ['post', 'attempt 2']),
      ],
      other: [d('x', 'Side bank')],
    }

    it('lists course assessments in order, then ones outside the course, then SQL', () => {
      expect(monitorEntries(data, true).map((e) => [e.label, e.outside, e.sql])).toEqual([
        ['Pre-assessment', false, false],
        ['Post-assessment, attempt 2', false, false],
        ['Side bank (outside the course)', true, false],
        ['SQL practice', false, true],
      ])
      expect(monitorEntries(null, false)).toEqual([])
    })
  })
})
