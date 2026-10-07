import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ActivityService } from '../activity/activity.service'
import { parseTz } from '../activity/activity-rules'
import { AttendanceService } from '../attendance/attendance.service'
import { LearnService } from '../learn.service'
import { isReady } from '../outcomes'
import { ProviderAccessService } from '../provider-access.service'
import type { LearnerRecord, LearnerRecordAttendanceNote } from '../record-types'
import { ParticipantNotesService } from '../talent/participant-notes.service'
import { TalentService } from '../talent/talent.service'

interface Range {
  from?: string
  to?: string
  tz?: string
}

/**
 * A thin composer: it adds nothing of its own to who may see what. Cohort staff (the roster guard)
 * get the header, attendance and activity. Participant notes and support items are the provider's
 * private records: they are read only through ParticipantNotesService (which writes the audit
 * rows), and only for staff of the cohort's provider who are not the learner. Anyone else gets
 * `restricted: true` and null lists, never an error.
 */
@Injectable()
export class RecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProviderAccessService,
    private readonly learn: LearnService,
    private readonly attendance: AttendanceService,
    private readonly activity: ActivityService,
    private readonly notes: ParticipantNotesService,
    private readonly talent: TalentService
  ) {}

  async record(
    userId: string,
    role: string | undefined,
    cohortId: string,
    learnerId: string,
    range: Range
  ): Promise<LearnerRecord> {
    const ctx = await this.access.assertCohortStaff(userId, role, cohortId)
    await this.access.assertLearnerOfCohort(learnerId, cohortId) // 404 unless enrolled here
    const zone = parseTz(range.tz)
    if ('error' in zone) throw new BadRequestException(zone.error) // before any work

    const actor = { userId, role }
    const canSeeNotes = userId !== learnerId && (await this.isProviderStaff(actor, ctx.providerId))

    const [enrollment, summary, activity, marksWithNotes, rows] = await Promise.all([
      this.prisma.enrollment.findUnique({
        where: { cohortId_userId: { cohortId, userId: learnerId } },
        select: {
          status: true,
          enrolledAt: true,
          user: { select: { displayName: true, email: true } },
          cohort: { select: { name: true, course: { select: { title: true } } } },
        },
      }),
      this.attendance.summary(userId, role, cohortId),
      this.activity.learnerReport(
        userId,
        role,
        cohortId,
        learnerId,
        range.from,
        range.to,
        range.tz
      ),
      this.prisma.attendanceMark.findMany({
        where: { userId: learnerId, session: { cohortId }, note: { not: null } },
        select: {
          sessionId: true,
          note: true,
          markedBy: true,
          markedAt: true,
          session: { select: { title: true, startsAt: true } },
        },
      }),
      this.learn.enrollmentRows({ id: ctx.hostId, kind: 'organization' }),
    ])
    const e = enrollment as NonNullable<typeof enrollment>
    const row = rows.find((r) => r.cohortId === cohortId && r.userId === learnerId)
    const mine = summary.rows.find((r) => r.userId === learnerId)

    const markers = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(marksWithNotes.map((m) => m.markedBy))] } },
      select: { id: true, displayName: true, email: true },
    })
    const markerName = new Map(markers.map((u) => [u.id, u.displayName ?? u.email ?? 'Staff']))
    const attendanceNotes: LearnerRecordAttendanceNote[] = marksWithNotes
      .filter((m) => (m.note ?? '').trim() !== '')
      .sort((a, b) => b.session.startsAt.getTime() - a.session.startsAt.getTime())
      .map((m) => ({
        sessionId: m.sessionId,
        sessionTitle: m.session.title,
        startsAt: m.session.startsAt.toISOString(),
        note: m.note as string,
        markedBy: markerName.get(m.markedBy) ?? 'Staff',
        markedAt: m.markedAt.toISOString(),
      }))

    // Staff-only records of the provider: through the notes service, so the audit rows are written.
    const [participant, support, profile] = canSeeNotes
      ? await Promise.all([
          this.notes.listNotes(actor, ctx.providerId, learnerId),
          this.notes.listItems(actor, ctx.providerId, learnerId),
          this.talent.profileStatus(ctx.providerId, learnerId),
        ])
      : [null, null, null]

    return {
      header: {
        userId: learnerId,
        name: e.user.displayName ?? e.user.email ?? learnerId,
        email: e.user.email,
        status: e.status as LearnerRecord['header']['status'],
        joinedAt: e.enrolledAt.toISOString(),
        courseTitle: e.cohort.course?.title ?? '',
        cohortName: e.cohort.name,
        providerId: ctx.providerId,
        progress: { itemsDone: row?.itemsDone ?? 0, itemsTotal: row?.itemsTotal ?? 0 },
        readiness: {
          goal: row?.readinessThreshold ?? 70,
          interviewBest: row?.interviewBest ?? null,
          interviewReady: row ? isReady(row) : false,
        },
        profile,
      },
      attendance: {
        ratePct: mine?.ratePct ?? null,
        sessionsCounted: mine?.sessions ?? 0,
        marks: [...summary.sessionList]
          .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
          .map((s) => ({
            sessionId: s.id,
            title: s.title,
            startsAt: s.startsAt,
            status: mine?.marks[s.id] ?? null,
            skipped: mine?.skipped[s.id] ?? null,
            note: mine?.notes[s.id] ?? null,
          })),
      },
      activity,
      notes: {
        attendance: attendanceNotes,
        participant,
        support,
        restricted: !canSeeNotes,
      },
    }
  }

  /** True for staff of the provider; false for any other caller (they are restricted, not refused). */
  private async isProviderStaff(
    actor: { userId: string; role: string | undefined },
    providerId: string
  ): Promise<boolean> {
    try {
      await this.access.assertProviderStaff(actor.userId, actor.role, providerId)
      return true
    } catch (err) {
      if (err instanceof ForbiddenException) return false
      throw err
    }
  }
}
