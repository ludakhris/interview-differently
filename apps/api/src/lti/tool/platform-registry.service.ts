import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common'
import type { PlatformRegistration } from '../lti-spec'
import { PrismaService } from '../../prisma/prisma.service'
import { platformRegistration } from './lti-tool.config'

/** How often another instance's change is picked up. */
const REFRESH_MS = 15_000
/** Id of the platform that comes from server settings rather than the table. */
export const BUILT_IN_ID = 'built-in'

/** A platform that launches this tool. `enabled` false means registered but not yet approved. */
export interface ToolPlatform extends PlatformRegistration {
  id: string
  name: string
  enabled: boolean
}

/** What an administrator sees of a platform. */
export interface PlatformView extends Omit<ToolPlatform, 'enabled'> {
  enabled: boolean
  /** Null for the built-in platform, which is not a row. */
  createdAt: string | null
  /** When it was first switched on; null while it is still waiting for approval. */
  approvedAt: string | null
  source: 'registered' | 'built-in'
}

export interface PlatformChange {
  id: string
  subjectId: string
  subjectName: string
  action: string
  userName: string
  changes: unknown
  createdAt: string
}

export interface Who {
  userId: string | null
  userName: string
}

type Row = ToolPlatform & { createdAt: Date; approvedAt: Date | null }
type Fields = Omit<ToolPlatform, 'id' | 'enabled'>

const FIELDS = [
  'name',
  'issuer',
  'clientId',
  'deploymentId',
  'authUrl',
  'tokenUrl',
  'jwksUrl',
] as const

/** `{ field: { from, to } }` for a new platform (every field from null). */
export const platformCreated = (p: Fields & { enabled: boolean }) =>
  Object.fromEntries(
    [...FIELDS, 'enabled'].map((f) => [f, { from: null, to: p[f as keyof typeof p] }])
  )

/** The platform from server settings (LTI_PLATFORM_* and LTI_TOOL_CLIENT_ID), always enabled. */
const builtIn = (): ToolPlatform => ({
  ...platformRegistration(),
  id: BUILT_IN_ID,
  name: 'Built-in platform (server settings)',
  enabled: true,
})

const isEnvIdentity = (p: Pick<PlatformRegistration, 'issuer' | 'clientId'>): boolean => {
  const env = platformRegistration()
  return p.issuer === env.issuer && p.clientId === env.clientId
}

/**
 * Whether learners of this platform keep their bare `sub` as the local user id. Only the platform
 * that was here first (the one in server settings) does: its ids are already what results and
 * attempts are stored under. Every other platform's ids are prefixed, so two platforms that both
 * have a user "1", or one that makes up a user id, can never reach another platform's results.
 */
export const keepsBareSub = isEnvIdentity

/**
 * The platforms that may launch this tool, read into memory and changed by an administrator. The
 * cache is refreshed every 15 seconds and starts empty: until the first read succeeds no platform
 * can log in, so a platform switched off is never let in by a failed read.
 */
@Injectable()
export class PlatformRegistryService implements OnModuleInit {
  private readonly logger = new Logger(PlatformRegistryService.name)
  private rows: Row[] = []
  private loaded = false
  private loadedAt = 0
  private inflight: Promise<boolean> | null = null
  /** Wait between the first load attempts at start-up (a field so tests can shorten it). */
  retryDelayMs = 2_000

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    for (let attempt = 0; attempt < 3 && !(await this.load()); attempt++)
      await new Promise((r) => setTimeout(r, this.retryDelayMs))
    setInterval(() => void this.load(), REFRESH_MS).unref()
  }

  /** Reads every platform (switched on or off) into the cache. A failed read keeps what was loaded. */
  load(): Promise<boolean> {
    this.inflight ??= this.read().finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  private async read(): Promise<boolean> {
    try {
      const rows = await this.prisma.ltiPlatform.findMany({ orderBy: { createdAt: 'asc' } })
      this.rows = rows
      this.loaded = true
      this.loadedAt = Date.now()
      return true
    } catch (err) {
      this.logger.warn(
        `Could not load the platform registry: ${err instanceof Error ? err.message : err}`
      )
      return false
    }
  }

  /** True once the cache holds a read; refreshes it first when it is old. */
  private async ready(): Promise<boolean> {
    if (!this.loaded || Date.now() - this.loadedAt > REFRESH_MS) await this.load()
    return this.loaded
  }

  /**
   * The platform for a login's `iss` and `client_id`, switched on or off (the caller refuses an
   * off one). The built-in platform answers only when the table has no row for that pair, so
   * switching its row off really turns it off.
   * TODO(#63): remove the built-in fallback once every environment has run `seed:lti-platforms`.
   */
  async forLogin(
    issuer: string | undefined,
    clientId: string | undefined
  ): Promise<ToolPlatform | undefined> {
    if (!issuer || !clientId || !(await this.ready())) return undefined
    const row = this.rows.find((r) => r.issuer === issuer && r.clientId === clientId)
    if (row) return row
    return isEnvIdentity({ issuer, clientId }) ? builtIn() : undefined
  }

  /** The platform a login was started for, as recorded in its state (`built-in`, or a row id). */
  async forLaunch(id: string | undefined): Promise<ToolPlatform | undefined> {
    if (id && id !== BUILT_IN_ID) {
      if (!(await this.ready())) return undefined
      return this.rows.find((r) => r.id === id)
    }
    const env = platformRegistration()
    return this.forLogin(env.issuer, env.clientId)
  }

  /**
   * The platform a signed session or submission names, for returning a score. Switched on or off:
   * work a learner already did can still be sent back, as on the platform side. No id (a token
   * from before platforms were registered) means the built-in platform.
   */
  async forScore(id: string | undefined): Promise<ToolPlatform | undefined> {
    if (!id || id === BUILT_IN_ID) return builtIn()
    if (!(await this.ready())) return undefined
    return this.rows.find((r) => r.id === id)
  }

  /** Registered platforms waiting for approval: never approved (one switched off after approval is not waiting). */
  async pendingCount(): Promise<number> {
    await this.ready()
    return this.rows.filter((r) => !r.enabled && !r.approvedAt).length
  }

  private view(r: Row): PlatformView {
    return {
      id: r.id,
      name: r.name,
      issuer: r.issuer,
      clientId: r.clientId,
      deploymentId: r.deploymentId,
      authUrl: r.authUrl,
      tokenUrl: r.tokenUrl,
      jwksUrl: r.jwksUrl,
      enabled: r.enabled,
      createdAt: r.createdAt.toISOString(),
      approvedAt: r.approvedAt?.toISOString() ?? null,
      source: 'registered',
    }
  }

  /** Every platform, plus the built-in one while no row stands in for it. */
  async list(): Promise<PlatformView[]> {
    await this.ready()
    const out = this.rows.map((r) => this.view(r))
    if (!this.rows.some((r) => isEnvIdentity(r)))
      out.unshift({ ...builtIn(), createdAt: null, approvedAt: null, source: 'built-in' })
    return out
  }

  /**
   * Switches a registered platform on or off. The row is read in the same transaction as the update
   * and the history entry, so two concurrent toggles each log what they really changed.
   */
  async setEnabled(who: Who, id: string, enabled: boolean): Promise<PlatformView> {
    if (id === BUILT_IN_ID)
      throw new BadRequestException('The built-in platform comes from server settings')
    const out = await this.prisma.$transaction(async (tx) => {
      const row = await tx.ltiPlatform.findUnique({ where: { id } })
      if (!row) throw new NotFoundException('Platform not found')
      if (row.enabled === enabled) return row
      const updated = await tx.ltiPlatform.update({
        where: { id },
        // approvedAt is set the first time it is switched on and kept after that
        data: { enabled, ...(enabled && !row.approvedAt ? { approvedAt: new Date() } : {}) },
      })
      await tx.ltiPlatformChange.create({
        data: {
          subjectId: id,
          subjectName: row.name,
          action: enabled ? 'enabled' : 'disabled',
          userId: who.userId,
          userName: who.userName,
          changes: { enabled: { from: row.enabled, to: enabled } },
        },
      })
      return updated
    })
    await this.load()
    return this.view(out)
  }

  /**
   * Rejects a registration nobody ever approved: deletes the row and writes the history entry in one
   * transaction. An approved platform (on, or switched off after being on) is switched off instead.
   */
  async reject(who: Who, id: string): Promise<void> {
    if (id === BUILT_IN_ID)
      throw new BadRequestException('The built-in platform comes from server settings')
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.ltiPlatform.findUnique({ where: { id } })
      if (!row) throw new NotFoundException('Platform not found')
      if (row.enabled || row.approvedAt)
        throw new BadRequestException('Only a registration that was never approved can be rejected')
      // guarded again in the delete, so a concurrent approval cannot be deleted
      const { count } = await tx.ltiPlatform.deleteMany({
        where: { id, enabled: false, approvedAt: null },
      })
      if (count !== 1)
        throw new BadRequestException('Only a registration that was never approved can be rejected')
      await tx.ltiPlatformChange.create({
        data: {
          subjectId: id,
          subjectName: row.name,
          action: 'rejected',
          userId: who.userId,
          userName: who.userName,
          changes: Object.fromEntries(FIELDS.map((f) => [f, { from: row[f], to: null }])),
        },
      })
    })
    await this.load()
  }

  /** The recent changes (all, or one platform's), newest first. */
  async history(subjectId?: string): Promise<PlatformChange[]> {
    const rows = await this.prisma.ltiPlatformChange.findMany({
      where: subjectId ? { subjectId } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return rows.map((r) => ({
      id: r.id,
      subjectId: r.subjectId,
      subjectName: r.subjectName,
      action: r.action,
      userName: r.userName,
      changes: r.changes,
      createdAt: r.createdAt.toISOString(),
    }))
  }

  /**
   * Stores a platform that registered itself, switched off. A platform already stored under the
   * same issuer and client id is left exactly as it is (never changed, never switched on): the
   * answer says it was not created.
   */
  async addRegistered(
    p: Fields,
    id: string,
    who: Who
  ): Promise<{ platform: PlatformView; created: boolean }> {
    const key = { issuer_clientId: { issuer: p.issuer, clientId: p.clientId } }
    const existing = await this.prisma.ltiPlatform.findUnique({ where: key })
    if (existing) return { platform: this.view(existing), created: false }
    try {
      await this.prisma.$transaction([
        this.prisma.ltiPlatform.create({ data: { id, ...p, enabled: false } }),
        this.prisma.ltiPlatformChange.create({
          data: {
            subjectId: id,
            subjectName: p.name,
            action: 'created',
            userId: who.userId,
            userName: who.userName,
            changes: platformCreated({ ...p, enabled: false }),
          },
        }),
      ])
    } catch (err) {
      // a concurrent registration of the same pair won
      if ((err as { code?: string }).code === 'P2002') {
        const won = await this.prisma.ltiPlatform.findUnique({ where: key })
        if (won) return { platform: this.view(won), created: false }
      }
      throw err
    }
    await this.load()
    const stored = await this.prisma.ltiPlatform.findUnique({ where: key })
    return { platform: this.view(stored as Row), created: true }
  }
}
