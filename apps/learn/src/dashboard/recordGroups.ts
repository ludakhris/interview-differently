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

/** Which assessments the course has, so the record does not list ones that cannot happen. */
export interface RecordShape {
  hasPre: boolean
  hasPost: boolean
}

/** The learner's readiness record in reading order: Course, then Skills, then Interview readiness (one line). */
export function recordGroups(
  record: ReadinessRecord,
  shape: RecordShape = { hasPre: true, hasPost: true }
): RecordGroup[] {
  const skills: RecordRow[] = [
    ...(shape.hasPre ? [{ label: 'Pre-assessment', value: score(record.pre) }] : []),
    ...(shape.hasPost
      ? [
          { label: 'Post-assessment', value: score(record.post) },
          {
            label: 'Change',
            value: record.gain === null ? '—' : `${points(record.gain)} % points`,
          },
          {
            label: `Post-assessment goal (${record.targetScore}%)`,
            value: record.reachedTarget
              ? 'Reached'
              : record.post === null
                ? 'Not yet taken'
                : 'Not reached',
            yes: record.reachedTarget,
          },
        ]
      : []),
  ]
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
    ...(skills.length ? [{ heading: 'Skills', rows: skills }] : []),
    {
      heading: null,
      rows: [
        {
          label: `Interview readiness (goal ${record.readinessThreshold}%)`,
          value:
            record.interviewBest === null
              ? 'Not yet scored'
              : `${record.interviewReady ? 'Ready to interview' : 'Keep practicing'} (${score(record.interviewBest)})`,
          yes: record.interviewReady,
        },
      ],
    },
  ]
}
