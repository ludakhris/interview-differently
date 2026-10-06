import type { ReadinessRecord } from '@id/types'
import { points, score } from './format'

export interface RecordRow {
  label: string
  value: string
  /** Highlighted when the learner has reached the goal the row measures. */
  yes?: boolean
}

export interface RecordGroup {
  /** Null for the opening Course row, which needs no heading. */
  heading: string | null
  rows: RecordRow[]
}

/** The learner's readiness record in reading order: Course, then Skills, then Interview readiness. */
export function recordGroups(record: ReadinessRecord): RecordGroup[] {
  return [
    {
      heading: null,
      rows: [
        {
          label: 'Course',
          value: record.completed ? 'Completed' : 'In progress',
          yes: record.completed,
        },
      ],
    },
    {
      heading: 'Skills',
      rows: [
        { label: 'Pre-assessment', value: score(record.pre) },
        { label: 'Post-assessment', value: score(record.post) },
        {
          label: 'Change',
          value: record.gain === null ? '—' : `${points(record.gain)} % points`,
        },
        { label: 'Course target', value: `${record.targetScore}%` },
        {
          label: 'Target score',
          value: record.reachedTarget
            ? 'Reached'
            : record.post === null
              ? 'Not yet taken'
              : 'Not reached',
          yes: record.reachedTarget,
        },
      ],
    },
    {
      heading: 'Interview readiness',
      rows: [
        { label: 'Practice interview (best)', value: score(record.interviewBest) },
        {
          label: 'Interview readiness',
          value: record.interviewReady
            ? 'Ready to interview'
            : record.interviewBest === null
              ? 'Not yet scored'
              : 'Keep practicing',
          yes: record.interviewReady,
        },
      ],
    },
  ]
}
