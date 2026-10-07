import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LEARN_ROLES } from './learn.service'
import { PROVIDER_STAFF_ROLES, ProviderAccessService } from './provider-access.service'
import type { DataAccessAction, DataAccessLogPage, DataAccessResource } from './talent-types'

export const DATA_ACCESS_RESOURCES: DataAccessResource[] = [
  'note',
  'support_item',
  'compensation',
  'resume',
  'talent_profile',
]
export const DATA_ACCESS_ACTIONS: DataAccessAction[] = [
  'read',
  'list',
  'create',
  'update',
  'delete',
  'export',
  'download',
]

export interface AccessEntry {
  actorId: string
  /** Looked up from the user when left out. */
  actorName?: string
  providerId: string
  /** The participant concerned; leave out for a bulk read or export. */
  subjectUserId?: string | null
  resource: DataAccessResource
  action: DataAccessAction
  /** Short and non-sensitive, e.g. "csv, 42 rows". Never note text, compensation values or file content. */
  detail?: string | null
}

export interface AccessLogQuery {
  providerId?: string
  subjectUserId?: string
  actorId?: string
  resource?: string
  limit?: number
  /** ISO time of the last row of the previous page. */
  before?: string
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/**
 * The audit trail for staff access to notes, support items, compensation and resumes.
 * Callers must `await record(...)` BEFORE returning the data: if the write fails the request fails,
 * so nothing is ever read without a trace.
 */
@Injectable()
export class DataAccessLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProviderAccessService
  ) {}

  async record(entry: AccessEntry): Promise<void> {
    if (!DATA_ACCESS_RESOURCES.includes(entry.resource))
      throw new Error(`Unknown data access resource: ${entry.resource}`)
    if (!DATA_ACCESS_ACTIONS.includes(entry.action))
      throw new Error(`Unknown data access action: ${entry.action}`)
    let actorName = entry.actorName
    if (!actorName) {
      const u = await this.prisma.user.findUnique({
        where: { id: entry.actorId },
        select: { displayName: true, email: true },
      })
      actorName = u?.displayName ?? u?.email ?? entry.actorId
    }
    await this.prisma.dataAccessLog.create({
      data: {
        actorId: entry.actorId,
        actorName,
        providerId: entry.providerId,
        subjectUserId: entry.subjectUserId ?? null,
        resource: entry.resource,
        action: entry.action,
        detail: entry.detail ? entry.detail.slice(0, 200) : null,
      },
    })
  }

  /**
   * Newest first. A system admin may read any provider's log (or all of them); provider staff must
   * name their own provider. Everyone else, learners included, is refused.
   */
  async list(
    userId: string,
    role: string | undefined,
    query: AccessLogQuery
  ): Promise<DataAccessLogPage> {
    // A system admin may name any provider, or none (all of them). Provider staff must name their own.
    if (role !== LEARN_ROLES.systemAdmin) {
      if (!role || !PROVIDER_STAFF_ROLES.includes(role))
        throw new ForbiddenException('Insufficient role')
      if (!query.providerId) throw new BadRequestException('providerId is required')
      await this.access.assertProviderStaff(userId, role, query.providerId)
    }
    if (query.resource && !DATA_ACCESS_RESOURCES.includes(query.resource as DataAccessResource))
      throw new BadRequestException('Unknown resource')
    let before: Date | undefined
    if (query.before) {
      before = new Date(query.before)
      if (Number.isNaN(before.getTime())) throw new BadRequestException('before is not a time')
    }
    const take = Math.min(
      Math.max(Math.floor(query.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1),
      MAX_LIMIT
    )
    const rows = await this.prisma.dataAccessLog.findMany({
      where: {
        ...(query.providerId ? { providerId: query.providerId } : {}),
        ...(query.subjectUserId ? { subjectUserId: query.subjectUserId } : {}),
        ...(query.actorId ? { actorId: query.actorId } : {}),
        ...(query.resource ? { resource: query.resource } : {}),
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    })
    const page = rows.slice(0, take)
    const subjectIds = [
      ...new Set(page.map((r) => r.subjectUserId).filter((x): x is string => !!x)),
    ]
    const users = subjectIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: subjectIds } },
          select: { id: true, displayName: true, email: true },
        })
      : []
    const names = new Map(users.map((u) => [u.id, u.displayName ?? u.email ?? u.id]))
    return {
      rows: page.map((r) => ({
        id: r.id,
        actorId: r.actorId,
        actorName: r.actorName,
        providerId: r.providerId,
        subjectUserId: r.subjectUserId,
        subjectName: r.subjectUserId ? (names.get(r.subjectUserId) ?? null) : null,
        resource: r.resource as DataAccessResource,
        action: r.action as DataAccessAction,
        detail: r.detail,
        createdAt: r.createdAt.toISOString(),
      })),
      nextBefore: rows.length > take ? page[page.length - 1].createdAt.toISOString() : null,
    }
  }
}
