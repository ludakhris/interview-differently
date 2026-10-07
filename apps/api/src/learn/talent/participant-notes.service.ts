import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { DataAccessLogService } from '../data-access-log.service'
import { ProviderAccessService } from '../provider-access.service'
import type {
  NoteInput,
  ParticipantNoteDto,
  SupportCategory,
  SupportItemDto,
  SupportItemInput,
  SupportQueueRow,
  SupportStatus,
} from '../talent-types'

export const SUPPORT_STATUSES: SupportStatus[] = ['open', 'in_progress', 'resolved', 'cancelled']
export const SUPPORT_CATEGORIES: SupportCategory[] = [
  'transportation',
  'childcare',
  'housing',
  'technology',
  'financial',
  'health',
  'other',
]
const NOTE_MAX = 4000
const TITLE_MAX = 200
const DETAILS_MAX = 2000
const QUEUE_LIMIT = 500
const DAY = /^\d{4}-\d{2}-\d{2}$/

interface Actor {
  userId: string
  role?: string
}

/** A calendar day as UTC midnight, or null. Rejects anything that is not a real YYYY-MM-DD. */
function parseDay(value: unknown, field: string): Date | null {
  if (value === null || value === '') return null
  if (typeof value !== 'string' || !DAY.test(value))
    throw new BadRequestException(`${field} must be a date like 2026-10-31`)
  const d = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value)
    throw new BadRequestException(`${field} is not a real date`)
  return d
}

function noteDto(n: {
  id: string
  providerId: string
  userId: string
  cohortId: string | null
  authorId: string
  authorName: string
  body: string
  createdAt: Date
  updatedAt: Date
}): ParticipantNoteDto {
  return {
    id: n.id,
    providerId: n.providerId,
    userId: n.userId,
    cohortId: n.cohortId,
    authorId: n.authorId,
    authorName: n.authorName,
    body: n.body,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  }
}

function itemDto(i: {
  id: string
  providerId: string
  userId: string
  cohortId: string | null
  title: string
  category: string
  details: string | null
  status: string
  dueDate: Date | null
  assigneeId: string | null
  assigneeName: string | null
  createdById: string
  createdByName: string
  resolvedAt: Date | null
  createdAt: Date
  updatedAt: Date
}): SupportItemDto {
  return {
    id: i.id,
    providerId: i.providerId,
    userId: i.userId,
    cohortId: i.cohortId,
    title: i.title,
    category: i.category as SupportCategory,
    details: i.details,
    status: i.status as SupportStatus,
    dueDate: i.dueDate ? i.dueDate.toISOString().slice(0, 10) : null,
    assigneeId: i.assigneeId,
    assigneeName: i.assigneeName,
    createdById: i.createdById,
    createdByName: i.createdByName,
    resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }
}

/**
 * #69 B: staff notes and support items. Staff of the provider only; a learner never reaches any of
 * this. Each handler checks access first, then that the person is a participant of the provider,
 * then (for writes) that the record belongs to that provider and person (404 otherwise), and
 * awaits the audit row BEFORE the data is read or changed, so a failed audit write fails the request.
 * Audit detail carries ids-free counts only, never note text.
 */
@Injectable()
export class ParticipantNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProviderAccessService,
    private readonly audit: DataAccessLogService
  ) {}

  private async guard(actor: Actor, providerId: string, participantId: string) {
    await this.access.assertProviderStaff(actor.userId, actor.role, providerId)
    await this.access.assertParticipantOfProvider(providerId, participantId)
  }

  private async nameOf(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, email: true },
    })
    return u?.displayName ?? u?.email ?? userId
  }

  /** The cohort must belong to one of this provider's courses. */
  private async checkCohort(providerId: string, cohortId: unknown): Promise<string | null> {
    if (cohortId === undefined || cohortId === null || cohortId === '') return null
    if (typeof cohortId !== 'string') throw new BadRequestException('cohortId is not valid')
    const c = await this.prisma.cohort.findFirst({
      where: { id: cohortId, course: { providerId } },
      select: { id: true },
    })
    if (!c) throw new BadRequestException('That cohort does not belong to this provider')
    return c.id
  }

  private noteText(body: unknown): string {
    if (typeof body !== 'string' || body.trim().length === 0)
      throw new BadRequestException('Write something in the note first')
    if (body.length > NOTE_MAX)
      throw new BadRequestException(`A note can be at most ${NOTE_MAX} characters`)
    return body.trim()
  }

  // ── People who can be assigned ────────────────────────────────────────────

  /** Workspace-level members of the provider: the only people an item may be assigned to. */
  async staff(actor: Actor, providerId: string): Promise<{ id: string; name: string }[]> {
    await this.access.assertProviderStaff(actor.userId, actor.role, providerId)
    const rows = await this.prisma.membership.findMany({
      where: { institutionId: providerId, cohortId: null },
      select: { user: { select: { id: true, displayName: true, email: true } } },
    })
    return rows
      .map((r) => ({ id: r.user.id, name: r.user.displayName ?? r.user.email ?? r.user.id }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  private async assertAssignable(providerId: string, assigneeId: string): Promise<string> {
    const m = await this.prisma.membership.findFirst({
      where: { userId: assigneeId, institutionId: providerId, cohortId: null },
      select: { id: true },
    })
    if (!m) throw new BadRequestException('You can only assign an item to staff of this provider')
    return this.nameOf(assigneeId)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(
    actor: Actor,
    providerId: string,
    participantId: string
  ): Promise<ParticipantNoteDto[]> {
    await this.guard(actor, providerId, participantId)
    await this.audit.record({
      actorId: actor.userId,
      providerId,
      subjectUserId: participantId,
      resource: 'note',
      action: 'list',
    })
    const rows = await this.prisma.participantNote.findMany({
      where: { providerId, userId: participantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    return rows.map(noteDto)
  }

  async createNote(
    actor: Actor,
    providerId: string,
    participantId: string,
    input: NoteInput
  ): Promise<ParticipantNoteDto> {
    await this.guard(actor, providerId, participantId)
    const body = this.noteText(input?.body)
    const cohortId = await this.checkCohort(providerId, input?.cohortId)
    await this.audit.record({
      actorId: actor.userId,
      providerId,
      subjectUserId: participantId,
      resource: 'note',
      action: 'create',
    })
    const row = await this.prisma.participantNote.create({
      data: {
        providerId,
        userId: participantId,
        cohortId,
        authorId: actor.userId,
        authorName: await this.nameOf(actor.userId),
        body,
      },
    })
    return noteDto(row)
  }

  private async ownNote(providerId: string, participantId: string, noteId: string) {
    const n = await this.prisma.participantNote.findFirst({
      where: { id: noteId, providerId, userId: participantId },
      select: { id: true },
    })
    if (!n) throw new NotFoundException('Note not found')
  }

  async updateNote(
    actor: Actor,
    providerId: string,
    participantId: string,
    noteId: string,
    input: { body: string }
  ): Promise<ParticipantNoteDto> {
    await this.guard(actor, providerId, participantId)
    const body = this.noteText(input?.body)
    await this.ownNote(providerId, participantId, noteId)
    await this.audit.record({
      actorId: actor.userId,
      providerId,
      subjectUserId: participantId,
      resource: 'note',
      action: 'update',
    })
    const row = await this.prisma.participantNote.update({ where: { id: noteId }, data: { body } })
    return noteDto(row)
  }

  async deleteNote(
    actor: Actor,
    providerId: string,
    participantId: string,
    noteId: string
  ): Promise<{ deleted: true }> {
    await this.guard(actor, providerId, participantId)
    await this.ownNote(providerId, participantId, noteId)
    await this.audit.record({
      actorId: actor.userId,
      providerId,
      subjectUserId: participantId,
      resource: 'note',
      action: 'delete',
    })
    await this.prisma.participantNote.delete({ where: { id: noteId } })
    return { deleted: true }
  }

  // ── Support items ─────────────────────────────────────────────────────────

  async listItems(
    actor: Actor,
    providerId: string,
    participantId: string
  ): Promise<SupportItemDto[]> {
    await this.guard(actor, providerId, participantId)
    await this.audit.record({
      actorId: actor.userId,
      providerId,
      subjectUserId: participantId,
      resource: 'support_item',
      action: 'list',
    })
    const rows = await this.prisma.supportItem.findMany({
      where: { providerId, userId: participantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    return rows.map(itemDto)
  }

  private checkTitle(title: unknown): string {
    if (typeof title !== 'string' || title.trim().length === 0)
      throw new BadRequestException('Give the item a short title')
    if (title.trim().length > TITLE_MAX)
      throw new BadRequestException(`The title can be at most ${TITLE_MAX} characters`)
    return title.trim()
  }

  private checkDetails(details: unknown): string | null {
    if (details === null || details === undefined || details === '') return null
    if (typeof details !== 'string' || details.length > DETAILS_MAX)
      throw new BadRequestException(`Details can be at most ${DETAILS_MAX} characters`)
    return details.trim() || null
  }

  private checkCategory(category: unknown): SupportCategory {
    if (!SUPPORT_CATEGORIES.includes(category as SupportCategory))
      throw new BadRequestException('Unknown category')
    return category as SupportCategory
  }

  private checkStatus(status: unknown): SupportStatus {
    if (!SUPPORT_STATUSES.includes(status as SupportStatus))
      throw new BadRequestException('Unknown status')
    return status as SupportStatus
  }

  async createItem(
    actor: Actor,
    providerId: string,
    participantId: string,
    input: SupportItemInput
  ): Promise<SupportItemDto> {
    await this.guard(actor, providerId, participantId)
    const title = this.checkTitle(input?.title)
    const category = input.category === undefined ? 'other' : this.checkCategory(input.category)
    const status = input.status === undefined ? 'open' : this.checkStatus(input.status)
    const details = this.checkDetails(input.details)
    const dueDate = parseDay(input.dueDate ?? null, 'dueDate')
    const cohortId = await this.checkCohort(providerId, input.cohortId)
    let assigneeId: string | null = null
    let assigneeName: string | null = null
    if (input.assigneeId) {
      assigneeId = input.assigneeId
      assigneeName = await this.assertAssignable(providerId, input.assigneeId)
    }
    await this.audit.record({
      actorId: actor.userId,
      providerId,
      subjectUserId: participantId,
      resource: 'support_item',
      action: 'create',
    })
    const row = await this.prisma.supportItem.create({
      data: {
        providerId,
        userId: participantId,
        cohortId,
        title,
        category,
        details,
        status,
        dueDate,
        assigneeId,
        assigneeName,
        createdById: actor.userId,
        createdByName: await this.nameOf(actor.userId),
        resolvedAt: status === 'resolved' ? new Date() : null,
      },
    })
    return itemDto(row)
  }

  async updateItem(
    actor: Actor,
    providerId: string,
    participantId: string,
    itemId: string,
    input: Partial<SupportItemInput>
  ): Promise<SupportItemDto> {
    await this.guard(actor, providerId, participantId)
    const existing = await this.prisma.supportItem.findFirst({
      where: { id: itemId, providerId, userId: participantId },
      select: { id: true, status: true },
    })
    if (!existing) throw new NotFoundException('Support item not found')
    const data: Record<string, unknown> = {}
    if (input.title !== undefined) data.title = this.checkTitle(input.title)
    if (input.category !== undefined) data.category = this.checkCategory(input.category)
    if (input.details !== undefined) data.details = this.checkDetails(input.details)
    if (input.dueDate !== undefined) data.dueDate = parseDay(input.dueDate, 'dueDate')
    if (input.cohortId !== undefined)
      data.cohortId = await this.checkCohort(providerId, input.cohortId)
    if (input.assigneeId !== undefined) {
      if (input.assigneeId === null || input.assigneeId === '') {
        data.assigneeId = null
        data.assigneeName = null
      } else {
        data.assigneeId = input.assigneeId
        data.assigneeName = await this.assertAssignable(providerId, input.assigneeId)
      }
    }
    if (input.status !== undefined) {
      const status = this.checkStatus(input.status)
      data.status = status
      if (status === 'resolved' && existing.status !== 'resolved') data.resolvedAt = new Date()
      if (status !== 'resolved') data.resolvedAt = null
    }
    await this.audit.record({
      actorId: actor.userId,
      providerId,
      subjectUserId: participantId,
      resource: 'support_item',
      action: 'update',
    })
    const row = await this.prisma.supportItem.update({ where: { id: itemId }, data })
    return itemDto(row)
  }

  async deleteItem(
    actor: Actor,
    providerId: string,
    participantId: string,
    itemId: string
  ): Promise<{ deleted: true }> {
    await this.guard(actor, providerId, participantId)
    const existing = await this.prisma.supportItem.findFirst({
      where: { id: itemId, providerId, userId: participantId },
      select: { id: true },
    })
    if (!existing) throw new NotFoundException('Support item not found')
    await this.audit.record({
      actorId: actor.userId,
      providerId,
      subjectUserId: participantId,
      resource: 'support_item',
      action: 'delete',
    })
    await this.prisma.supportItem.delete({ where: { id: itemId } })
    return { deleted: true }
  }

  // ── Queue ─────────────────────────────────────────────────────────────────

  /**
   * Follow-ups across the provider. `status` is one status, or `all`; left out it means the items
   * still to do (open and in progress). `assigneeId` may be `unassigned`.
   */
  async queue(
    actor: Actor,
    providerId: string,
    filters: { status?: string; assigneeId?: string; dueBefore?: string }
  ): Promise<SupportQueueRow[]> {
    await this.access.assertProviderStaff(actor.userId, actor.role, providerId)
    const where: Record<string, unknown> = { providerId }
    if (filters.status === 'all') {
      /* every status */
    } else if (filters.status) {
      where.status = this.checkStatus(filters.status)
    } else {
      where.status = { in: ['open', 'in_progress'] }
    }
    if (filters.assigneeId === 'unassigned') where.assigneeId = null
    else if (filters.assigneeId) where.assigneeId = filters.assigneeId
    const before = parseDay(filters.dueBefore ?? null, 'dueBefore')
    if (before) where.dueDate = { lte: before }
    const rows = await this.prisma.supportItem.findMany({
      where,
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: QUEUE_LIMIT,
      include: { user: { select: { displayName: true, email: true } } },
    })
    await this.audit.record({
      actorId: actor.userId,
      providerId,
      resource: 'support_item',
      action: 'list',
      detail: `queue, ${rows.length} rows`,
    })
    return rows.map((r) => ({
      ...itemDto(r),
      participantName: r.user.displayName ?? r.user.email ?? 'Participant',
    }))
  }
}
