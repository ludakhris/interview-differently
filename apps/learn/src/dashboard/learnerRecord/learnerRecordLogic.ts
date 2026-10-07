import type { LearnerRecord, ParticipantNoteDto } from '@id/types'
import { score } from '../format'

/** One entry of the merged notes feed. */
export type FeedItem =
  | {
      kind: 'note'
      id: string
      /** When it was written (ISO). The feed is sorted on this, newest first. */
      at: string
      author: string
      body: string
    }
  | {
      kind: 'attendance'
      id: string
      at: string
      author: string
      body: string
      sessionId: string
      sessionTitle: string
      /** The session's start (ISO), shown in the tag. */
      startsAt: string
    }

/** Staff notes and attendance notes in one list, newest written first. */
export function mergeFeed(
  participant: ParticipantNoteDto[] | null,
  attendance: LearnerRecord['notes']['attendance']
): FeedItem[] {
  const items: FeedItem[] = [
    ...(participant ?? []).map(
      (n): FeedItem => ({
        kind: 'note',
        id: n.id,
        at: n.createdAt,
        author: n.authorName,
        body: n.body,
      })
    ),
    ...attendance.map(
      (n): FeedItem => ({
        kind: 'attendance',
        id: `attendance-${n.sessionId}`,
        at: n.markedAt,
        author: n.markedBy,
        body: n.note,
        sessionId: n.sessionId,
        sessionTitle: n.sessionTitle,
        startsAt: n.startsAt,
      })
    ),
  ]
  return items.sort((a, b) => b.at.localeCompare(a.at))
}

/** A date such as "Oct 8, 2026" in the viewer's timezone. */
export function dateIn(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: tz,
  }).format(new Date(iso))
}

/** A session time such as "Oct 8, 2026, 2:00 PM" in the viewer's timezone. */
export function dateTimeIn(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  })
    .format(new Date(iso))
    .replace(/\u202f/g, ' ')
}

/** "Attendance · Week 2 · Oct 8, 2026" */
export const attendanceTag = (title: string, startsAt: string, tz: string): string =>
  `Attendance · ${title} · ${dateIn(startsAt, tz)}`

/** The learner's own readiness line (same wording as their record). */
export function readinessLine(r: LearnerRecord['header']['readiness']): string {
  const value =
    r.interviewBest === null
      ? 'Not yet scored'
      : `${r.interviewReady ? 'Ready to interview' : 'Keep practicing'} (${score(r.interviewBest)})`
  return `Interview readiness (goal ${r.goal}%): ${value}`
}

export const PROFILE_LABEL = {
  shared: 'Profile shared with you',
  not_shared: 'Profile not shared',
  none: 'No profile yet',
} as const

export const SKIPPED_LABEL = {
  not_taken: 'Register not taken',
  before_join: 'Before they joined',
} as const
