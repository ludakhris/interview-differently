import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { DataAccessLogService } from '../data-access-log.service'
import { ProviderAccessService } from '../provider-access.service'
import type {
  AttendanceCounts,
  AttendanceSheet,
  AttendanceStatus,
  AttendanceSummary,
  CohortSessionDto,
  LearnerAttendance,
} from '../attendance-types'
import { CSV_BOM, csvLine, emptyCounts, isStatus, standing } from './attendance-rules'

interface SessionRow {
  id: string
  cohortId: string
  title: string
  startsAt: Date
  endsAt: Date | null
  location: string | null
}

const SESSION_SELECT = {
  id: true,
  cohortId: true,
  title: true,
  startsAt: true,
  endsAt: true,
  location: true,
} as const

const str = (v: unknown): v is string => typeof v === 'string'

function parseDate(v: unknown, field: string): Date {
  const d = str(v) ? new Date(v) : new Date(NaN)
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`${field} must be a valid date`)
  return d
}

@Injectable()
export class AttendanceService {
  constructor(
    readonly prisma: PrismaService,
    readonly access: ProviderAccessService,
    readonly audit: DataAccessLogService
  ) {}

  // ── Sessions ──────────────────────────────────────────────────────────────

  async listSessions(
    userId: string,
    role: string | undefined,
    cohortId: string
  ): Promise<CohortSessionDto[]> {
    await this.access.assertCohortStaff(userId, role, cohortId)
    const sessions = await this.sessionsOf(cohortId)
    const counts = await this.countsFor(cohortId, sessions)
    return sessions.map((s) => toDto(s, counts.get(s.id) ?? emptyCounts()))
  }

  async createSession(
    userId: string,
    role: string | undefined,
    cohortId: string,
    body: unknown
  ): Promise<CohortSessionDto> {
    const ctx = await this.access.assertCohortStaff(userId, role, cohortId)
    this.assertLive(ctx.delivery)
    const input = (body ?? {}) as Record<string, unknown>
    const title = this.title(input.title)
    const startsAt = parseDate(input.startsAt, 'startsAt')
    const endsAt =
      input.endsAt === undefined || input.endsAt === null ? null : parseDate(input.endsAt, 'endsAt')
    if (endsAt && endsAt <= startsAt) throw new BadRequestException('endsAt must be after startsAt')
    const location = this.location(input.location)
    const created = await this.prisma.cohortSession.create({
      data: { cohortId, title, startsAt, endsAt, location, createdBy: userId },
      select: SESSION_SELECT,
    })
    return toDto(created, await this.countsOne(cohortId, created.id))
  }

  async updateSession(
    userId: string,
    role: string | undefined,
    cohortId: string,
    sessionId: string,
    body: unknown
  ): Promise<CohortSessionDto> {
    const ctx = await this.access.assertCohortStaff(userId, role, cohortId)
    const existing = await this.sessionIn(cohortId, sessionId)
    this.assertLive(ctx.delivery)
    const input = (body ?? {}) as Record<string, unknown>
    const data: Record<string, unknown> = {}
    if (input.title !== undefined) data.title = this.title(input.title)
    if (input.startsAt !== undefined) data.startsAt = parseDate(input.startsAt, 'startsAt')
    if (input.endsAt !== undefined)
      data.endsAt = input.endsAt === null ? null : parseDate(input.endsAt, 'endsAt')
    if (input.location !== undefined) data.location = this.location(input.location)
    const startsAt = (data.startsAt as Date | undefined) ?? existing.startsAt
    const endsAt =
      data.endsAt !== undefined ? (data.endsAt as Date | null) : (existing.endsAt as Date | null)
    if (endsAt && endsAt <= startsAt) throw new BadRequestException('endsAt must be after startsAt')
    const updated = await this.prisma.cohortSession.update({
      where: { id: sessionId },
      data,
      select: SESSION_SELECT,
    })
    return toDto(updated, await this.countsOne(cohortId, sessionId))
  }

  async deleteSession(
    userId: string,
    role: string | undefined,
    cohortId: string,
    sessionId: string
  ): Promise<{ deleted: true }> {
    const ctx = await this.access.assertCohortStaff(userId, role, cohortId)
    await this.sessionIn(cohortId, sessionId)
    this.assertLive(ctx.delivery)
    await this.prisma.cohortSession.delete({ where: { id: sessionId } })
    return { deleted: true }
  }

  // ── The sheet ─────────────────────────────────────────────────────────────

  async sheet(
    userId: string,
    role: string | undefined,
    cohortId: string,
    sessionId: string
  ): Promise<AttendanceSheet> {
    await this.access.assertCohortStaff(userId, role, cohortId)
    return this.buildSheet(cohortId, sessionId)
  }

  async saveMarks(
    userId: string,
    role: string | undefined,
    cohortId: string,
    sessionId: string,
    body: unknown
  ): Promise<AttendanceSheet> {
    const ctx = await this.access.assertCohortStaff(userId, role, cohortId)
    await this.sessionIn(cohortId, sessionId)
    this.assertLive(ctx.delivery)
    const raw = (body as { marks?: unknown } | null)?.marks
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 1000)
      throw new BadRequestException('marks must be a list of 1 to 1000 entries')
    const seen = new Set<string>()
    const marks: { userId: string; status: AttendanceStatus; note: string | null | undefined }[] =
      []
    for (const m of raw as Record<string, unknown>[]) {
      if (!m || !str(m.userId) || !m.userId)
        throw new BadRequestException('Each mark needs a userId')
      if (!isStatus(m.status))
        throw new BadRequestException('status must be present, absent, late or excused')
      if (seen.has(m.userId)) throw new BadRequestException('A learner appears twice in marks')
      seen.add(m.userId)
      let note: string | null | undefined
      if (m.note !== undefined && m.note !== null) {
        if (!str(m.note) || m.note.length > 500)
          throw new BadRequestException('note must be at most 500 characters')
        note = m.note.trim() === '' ? null : m.note.trim()
      } else note = m.note as null | undefined
      marks.push({ userId: m.userId, status: m.status, note })
    }
    const enrolled = await this.prisma.enrollment.findMany({
      where: { cohortId, userId: { in: [...seen] } },
      select: { userId: true },
    })
    if (enrolled.length !== seen.size)
      throw new BadRequestException('Every marked learner must be enrolled in this cohort')

    const now = new Date()
    // One transaction: if any upsert fails, none is kept.
    await this.prisma.$transaction(
      marks.map((m) =>
        this.prisma.attendanceMark.upsert({
          where: { sessionId_userId: { sessionId, userId: m.userId } },
          create: {
            sessionId,
            userId: m.userId,
            status: m.status,
            note: m.note ?? null,
            markedBy: userId,
            markedAt: now,
          },
          update: {
            status: m.status,
            ...(m.note !== undefined ? { note: m.note } : {}),
            markedBy: userId,
            markedAt: now,
          },
        })
      )
    )
    return this.buildSheet(cohortId, sessionId)
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  async summary(
    userId: string,
    role: string | undefined,
    cohortId: string
  ): Promise<AttendanceSummary> {
    await this.access.assertCohortStaff(userId, role, cohortId)
    return this.buildSummary(cohortId)
  }

  async csv(userId: string, role: string | undefined, cohortId: string): Promise<string> {
    await this.access.assertCohortStaff(userId, role, cohortId)
    const s = await this.buildSummary(cohortId)
    const emails = await this.prisma.user.findMany({
      where: { id: { in: s.rows.map((r) => r.userId) } },
      select: { id: true, email: true },
    })
    const emailOf = new Map(emails.map((u) => [u.id, u.email]))
    const lines = [
      csvLine([
        'name',
        'email',
        'present',
        'absent',
        'late',
        'excused',
        'sessions_counted',
        'sessions_held',
        'rate_percent',
        'note',
      ]),
      ...s.rows.map((r) =>
        csvLine([
          r.name,
          emailOf.get(r.userId) ?? '',
          r.present,
          r.absent,
          r.late,
          r.excused,
          r.sessions,
          r.sessionsHeld,
          r.ratePct,
          s.sessionList
            .filter((x) => r.notes[x.id])
            .map((x) => `${x.title}: ${r.notes[x.id]}`)
            .join('; '),
        ])
      ),
    ]
    return CSV_BOM + lines.join('\r\n') + '\r\n'
  }

  /** One session's register: every learner on the sheet, their status (empty if not marked) and note. */
  async sessionCsv(
    userId: string,
    role: string | undefined,
    cohortId: string,
    sessionId: string
  ): Promise<string> {
    await this.access.assertCohortStaff(userId, role, cohortId)
    const sheet = await this.buildSheet(cohortId, sessionId)
    const lines = [
      csvLine(['name', 'email', 'status', 'marked_at', 'note']),
      ...sheet.rows.map((r) => csvLine([r.name, r.email, r.status, r.markedAt, r.note])),
    ]
    return CSV_BOM + lines.join('\r\n') + '\r\n'
  }

  // ── The learner's own view ────────────────────────────────────────────────

  async mine(userId: string, cohortId: string): Promise<LearnerAttendance> {
    await this.access.assertLearnerOfCohort(userId, cohortId)
    const sessions = await this.sessionsOf(cohortId)
    const [enrollment, own, any] = await Promise.all([
      this.prisma.enrollment.findUnique({
        where: { cohortId_userId: { cohortId, userId } },
        select: { enrolledAt: true },
      }),
      // Own marks only, and never the staff note (it is not selected).
      this.prisma.attendanceMark.findMany({
        where: { userId, session: { cohortId } },
        select: { sessionId: true, status: true },
      }),
      // Only which sessions have any mark at all (the register was taken); nobody else's status.
      sessions.length
        ? this.prisma.attendanceMark.findMany({
            where: { sessionId: { in: sessions.map((s) => s.id) } },
            select: { sessionId: true },
            distinct: ['sessionId'],
          })
        : Promise.resolve([] as { sessionId: string }[]),
    ])
    const marks = new Map(
      own.filter((m) => isStatus(m.status)).map((m) => [m.sessionId, m.status as AttendanceStatus])
    )
    const st = standing(
      sessions,
      new Set(any.map((m) => m.sessionId)),
      enrollment?.enrolledAt ?? new Date(0),
      marks,
      Date.now()
    )
    return {
      cohortId,
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title,
        startsAt: s.startsAt.toISOString(),
        location: s.location,
        status: st.statuses[s.id] ?? null,
        skipped: st.skipped[s.id] ?? null,
      })),
      counts: {
        present: st.present,
        absent: st.absent,
        late: st.late,
        excused: st.excused,
        unmarked: 0,
      },
      sessionsCounted: st.counted,
      ratePct: st.ratePct,
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private assertLive(delivery: string) {
    if (delivery !== 'live' && delivery !== 'hybrid')
      throw new ConflictException('This cohort is online-only')
  }

  private title(v: unknown): string {
    if (!str(v) || v.trim().length < 1 || v.trim().length > 120)
      throw new BadRequestException('title must be 1 to 120 characters')
    return v.trim()
  }

  private location(v: unknown): string | null {
    if (v === undefined || v === null || v === '') return null
    if (!str(v) || v.length > 200)
      throw new BadRequestException('location must be at most 200 characters')
    return v
  }

  private sessionsOf(cohortId: string): Promise<SessionRow[]> {
    return this.prisma.cohortSession.findMany({
      where: { cohortId },
      orderBy: { startsAt: 'asc' },
      select: SESSION_SELECT,
    })
  }

  private async sessionIn(cohortId: string, sessionId: string): Promise<SessionRow> {
    const s = await this.prisma.cohortSession.findFirst({
      where: { id: sessionId, cohortId },
      select: SESSION_SELECT,
    })
    if (!s) throw new NotFoundException('Session not found')
    return s
  }

  private async countsOne(cohortId: string, sessionId: string): Promise<AttendanceCounts> {
    const s = await this.sessionIn(cohortId, sessionId)
    return (await this.countsFor(cohortId, [s])).get(sessionId) ?? emptyCounts()
  }

  /** Counts per session; `unmarked` is the active roster without a mark. */
  private async countsFor(
    cohortId: string,
    sessions: SessionRow[]
  ): Promise<Map<string, AttendanceCounts>> {
    const out = new Map<string, AttendanceCounts>()
    if (sessions.length === 0) return out
    const [roster, marks] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { cohortId, status: { not: 'withdrawn' } },
        select: { userId: true },
      }),
      this.prisma.attendanceMark.findMany({
        where: { sessionId: { in: sessions.map((s) => s.id) } },
        select: { sessionId: true, userId: true, status: true },
      }),
    ])
    const active = new Set(roster.map((r) => r.userId))
    for (const s of sessions) out.set(s.id, emptyCounts())
    const marked = new Map<string, Set<string>>()
    for (const m of marks) {
      const c = out.get(m.sessionId)
      if (!c || !isStatus(m.status)) continue
      c[m.status]++
      if (!marked.has(m.sessionId)) marked.set(m.sessionId, new Set())
      marked.get(m.sessionId)!.add(m.userId)
    }
    for (const s of sessions) {
      const done = marked.get(s.id)
      let unmarked = 0
      for (const u of active) if (!done?.has(u)) unmarked++
      out.get(s.id)!.unmarked = unmarked
    }
    return out
  }

  private async buildSheet(cohortId: string, sessionId: string): Promise<AttendanceSheet> {
    const session = await this.sessionIn(cohortId, sessionId)
    const [enrollments, marks] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { cohortId },
        select: {
          id: true,
          userId: true,
          status: true,
          user: { select: { displayName: true, email: true } },
        },
      }),
      this.prisma.attendanceMark.findMany({
        where: { sessionId },
        select: { userId: true, status: true, note: true, markedAt: true },
      }),
    ])
    const markOf = new Map(marks.map((m) => [m.userId, m]))
    const rows = enrollments
      .filter((e) => e.status !== 'withdrawn' || markOf.has(e.userId))
      .map((e) => {
        const m = markOf.get(e.userId)
        return {
          userId: e.userId,
          enrollmentId: e.id,
          name: e.user.displayName ?? e.user.email ?? 'Learner',
          email: e.user.email,
          status: m && isStatus(m.status) ? m.status : null,
          note: m?.note ?? null,
          markedAt: m ? m.markedAt.toISOString() : null,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
    const counts = (await this.countsFor(cohortId, [session])).get(sessionId) ?? emptyCounts()
    return { session: toDto(session, counts), rows }
  }

  private async buildSummary(cohortId: string): Promise<AttendanceSummary> {
    const now = Date.now()
    const held = (await this.sessionsOf(cohortId)).filter((s) => s.startsAt.getTime() <= now)
    const [enrollments, marks] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { cohortId },
        select: {
          userId: true,
          status: true,
          enrolledAt: true,
          user: { select: { displayName: true, email: true } },
        },
      }),
      held.length
        ? this.prisma.attendanceMark.findMany({
            where: { sessionId: { in: held.map((s) => s.id) } },
            select: { sessionId: true, userId: true, status: true, note: true },
          })
        : Promise.resolve([]),
    ])
    // A session was "taken" once anyone has a mark for it.
    const taken = new Set(marks.map((m) => m.sessionId))
    const byUser = new Map<string, Map<string, AttendanceStatus>>()
    const notesOf = new Map<string, Record<string, string>>()
    for (const m of marks) {
      if (!isStatus(m.status)) continue
      if (m.note) notesOf.set(m.userId, { ...notesOf.get(m.userId), [m.sessionId]: m.note })
      if (!byUser.has(m.userId)) byUser.set(m.userId, new Map())
      byUser.get(m.userId)!.set(m.sessionId, m.status)
    }
    const rows = enrollments
      .filter((e) => e.status !== 'withdrawn' || byUser.has(e.userId))
      .map((e) => {
        const st = standing(held, taken, e.enrolledAt, byUser.get(e.userId) ?? new Map(), now)
        return {
          userId: e.userId,
          name: e.user.displayName ?? e.user.email ?? 'Learner',
          present: st.present,
          absent: st.absent,
          late: st.late,
          excused: st.excused,
          sessions: st.counted,
          sessionsHeld: st.held,
          ratePct: st.ratePct,
          marks: st.statuses,
          skipped: st.skipped,
          notes: notesOf.get(e.userId) ?? {},
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
    return {
      cohortId,
      sessions: held.length,
      sessionList: held.map((s) => ({
        id: s.id,
        title: s.title,
        startsAt: s.startsAt.toISOString(),
        taken: taken.has(s.id),
      })),
      rows,
    }
  }
}

function toDto(s: SessionRow, counts: AttendanceCounts): CohortSessionDto {
  return {
    id: s.id,
    cohortId: s.cohortId,
    title: s.title,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt ? s.endsAt.toISOString() : null,
    location: s.location,
    counts,
  }
}
