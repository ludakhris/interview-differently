import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { ClerkService } from '../../auth/clerk.service'
import type { LearnRegistryChange } from '../../learn/learn-types'
import { LEARN_ROLES } from '../../learn/learn.service'
import { PrismaService } from '../../prisma/prisma.service'
import {
  defaultConnections,
  defaultTools,
  managedConnections,
  managedTools,
  setRegistryReady,
  setStoredConnections,
  setStoredTools,
  type StoredConnection,
  type StoredTool,
} from './lti-platform-config'
import {
  diffConnection,
  diffTool,
  validateConnectionInput,
  validateToolInput,
  type ToolRow,
} from './tool-config'

/** How often another instance's change is picked up. */
const REFRESH_MS = 15_000

/** Marks that the default connection and tools have been written to the tables, once. */
const SEEDED_KEY = 'lti-tools-seeded'

/** The connections and tools as the registry holds them. */
export interface Registry {
  tools: StoredTool[]
  connections: StoredConnection[]
}

interface Who {
  userId: string | null
  userName: string
}

const connectionColumns = (c: StoredConnection) => ({
  id: c.id,
  name: c.name,
  clientId: c.clientId,
  deploymentId: c.deploymentId,
  loginUrl: c.loginUrl,
  launchUrl: c.launchUrl,
  jwksUrl: c.jwksUrl,
})

/** The columns a tool row stores: what it is and who may use it. Where it lives is its connection's. */
const toolColumns = (t: ToolRow) => ({
  toolId: t.toolId,
  connectionId: t.connectionId,
  name: t.name,
  kind: t.kind,
  retries: t.retries,
  labelable: t.labelable,
  enabled: t.enabled,
  workspaceIds: t.workspaceIds,
})

/** The connections and tools the platform launches, read into memory and changed by a system admin. */
@Injectable()
export class ToolRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ToolRegistryService.name)
  private loadedAt = 0
  /** Wait between the first load attempts at start-up (a field so tests can shorten it). */
  retryDelayMs = 2_000

  constructor(
    private readonly prisma: PrismaService,
    private readonly clerk: ClerkService
  ) {}

  async onModuleInit(): Promise<void> {
    // Until the stored tools have loaded once, no tool may be launched (see setRegistryReady).
    setRegistryReady(false)
    // The database may still be coming up: try a few times before the 15-second refresh takes over.
    for (let attempt = 0; attempt < 3 && !(await this.start()); attempt++)
      await new Promise((r) => setTimeout(r, this.retryDelayMs))
    // Another instance may have changed a tool: pick it up without waiting for a request.
    setInterval(() => void this.load(), REFRESH_MS).unref()
  }

  /** First start of an environment writes the default connection and tools; then loads them. */
  private async start(): Promise<boolean> {
    try {
      await this.seedOnce()
    } catch (err) {
      this.logger.warn(
        `Could not set up the tool registry: ${err instanceof Error ? err.message : err}`
      )
      return false
    }
    return this.load()
  }

  /**
   * Writes the default connection and tools once per database. After that the tables are the only
   * source: an admin who removes one is not undone by the next start. Safe if two instances start
   * together.
   */
  private async seedOnce(): Promise<void> {
    if (await this.prisma.platformConfig.findUnique({ where: { key: SEEDED_KEY } })) return
    const connections = defaultConnections()
    const tools: ToolRow[] = defaultTools()
    const system: Who = { userId: null, userName: 'System (first start)' }
    await this.prisma.$transaction([
      this.prisma.ltiConnection.createMany({
        data: connections.map(connectionColumns),
        skipDuplicates: true,
      }),
      this.prisma.ltiTool.createMany({ data: tools.map(toolColumns), skipDuplicates: true }),
      this.prisma.ltiRegistryChange.createMany({
        data: [
          ...connections.map((c) =>
            this.entry('connection', c.id, c.name, 'created', system, diffConnection(null, c))
          ),
          ...tools.map((t) =>
            this.entry('tool', t.toolId, t.name, 'created', system, diffTool(null, t))
          ),
        ],
      }),
      this.prisma.platformConfig.upsert({
        where: { key: SEEDED_KEY },
        create: { key: SEEDED_KEY, value: new Date().toISOString() },
        update: {},
      }),
    ])
  }

  /** Reads the stored connections and tools into the cache. A failed read keeps what was loaded before. */
  async load(): Promise<boolean> {
    try {
      const [connections, tools] = await Promise.all([
        this.prisma.ltiConnection.findMany({ orderBy: { createdAt: 'asc' } }),
        this.prisma.ltiTool.findMany({
          orderBy: { createdAt: 'asc' },
          include: { connection: true },
        }),
      ])
      setStoredConnections(connections.map(connectionColumns))
      setStoredTools(
        tools.map((t) => ({
          toolId: t.toolId,
          connectionId: t.connectionId,
          name: t.name,
          kind: t.kind === 'assessment' ? 'assessment' : 'interview',
          retries: t.retries,
          labelable: t.labelable,
          enabled: t.enabled,
          workspaceIds: t.workspaceIds ?? [],
          // Where it launches comes from its connection.
          clientId: t.connection.clientId,
          deploymentId: t.connection.deploymentId,
          loginUrl: t.connection.loginUrl,
          launchUrl: t.connection.launchUrl,
          jwksUrl: t.connection.jwksUrl,
        }))
      )
      setRegistryReady(true)
      this.loadedAt = Date.now()
      return true
    } catch (err) {
      this.logger.warn(
        `Could not load the tool registry: ${err instanceof Error ? err.message : err}`
      )
      return false
    }
  }

  /** The connections and tools, refreshed first when the cache is old. */
  async list(): Promise<Registry> {
    if (Date.now() - this.loadedAt > REFRESH_MS) await this.load()
    return this.snapshot()
  }

  private snapshot(): Registry {
    return { tools: managedTools(), connections: managedConnections() }
  }

  /**
   * Registering a tool hands it learners' identities, so it is a system-administrator task: an
   * agency or provider role does not grant it.
   */
  canManage(role: string | undefined): boolean {
    return role === LEARN_ROLES.systemAdmin
  }

  assertManage(role: string | undefined): void {
    if (!this.canManage(role))
      throw new ForbiddenException('Only a system administrator can change connected tools')
  }

  // ── history ────────────────────────────────────────────────────────────────

  /** Who is making a change, as it should read in the history later. */
  private async actor(userId: string): Promise<Who> {
    const p = await this.clerk.getUserProfile(userId, 'learn')
    return { userId, userName: p?.displayName?.trim() || p?.email || userId }
  }

  private entry(
    subject: 'connection' | 'tool',
    subjectId: string,
    subjectName: string,
    action: 'created' | 'updated' | 'removed',
    who: Who,
    changes: object
  ) {
    return {
      subject,
      subjectId,
      subjectName,
      action,
      userId: who.userId,
      userName: who.userName,
      changes,
    }
  }

  /** One history row, to be written in the same transaction as the change itself. */
  private log(...args: Parameters<ToolRegistryService['entry']>) {
    return this.prisma.ltiRegistryChange.create({ data: this.entry(...args) })
  }

  /** The recent changes (all, or one tool's or connection's), newest first. */
  async history(role: string | undefined, subjectId?: string): Promise<LearnRegistryChange[]> {
    this.assertManage(role)
    const rows = await this.prisma.ltiRegistryChange.findMany({
      where: subjectId ? { subjectId } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return rows.map((r) => ({
      id: r.id,
      subject: r.subject as LearnRegistryChange['subject'],
      subjectId: r.subjectId,
      subjectName: r.subjectName,
      action: r.action as LearnRegistryChange['action'],
      userName: r.userName,
      changes: r.changes as LearnRegistryChange['changes'],
      createdAt: r.createdAt.toISOString(),
    }))
  }

  /** Runs a write; a unique-key clash from a concurrent request answers 409, not 500. */
  private async write(what: string, ops: Prisma.PrismaPromise<unknown>[]) {
    try {
      await this.prisma.$transaction(ops)
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002')
        throw new ConflictException(`${what} already exists`)
      throw err
    }
    await this.load()
    return this.snapshot()
  }

  // ── tools ──────────────────────────────────────────────────────────────────

  /** Refuses a workspace list naming anything that is not an existing agency or provider. */
  private async assertWorkspaces(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const found = await this.prisma.institution.findMany({
      where: { id: { in: ids }, kind: { in: ['agency', 'provider'] } },
      select: { id: true },
    })
    if (found.length !== ids.length)
      throw new BadRequestException('Workspaces must be existing agencies or providers')
  }

  private assertConnection(id: string): void {
    if (!managedConnections().some((c) => c.id === id))
      throw new BadRequestException('Choose an existing connection')
  }

  async createTool(role: string | undefined, userId: string, body: unknown): Promise<Registry> {
    this.assertManage(role)
    const tool = validateToolInput(body)
    this.assertConnection(tool.connectionId)
    await this.assertWorkspaces(tool.workspaceIds)
    if (managedTools().some((t) => t.toolId === tool.toolId))
      throw new ConflictException('A tool with that id already exists')
    const who = await this.actor(userId)
    return this.write('A tool with that id', [
      this.prisma.ltiTool.create({ data: toolColumns(tool) }),
      this.log('tool', tool.toolId, tool.name, 'created', who, diffTool(null, tool)),
    ])
  }

  async updateTool(
    role: string | undefined,
    userId: string,
    toolId: string,
    body: unknown
  ): Promise<Registry> {
    this.assertManage(role)
    const current = managedTools().find((t) => t.toolId === toolId)
    if (!current) throw new NotFoundException('Tool not found')
    const tool = validateToolInput(body, toolId)
    this.assertConnection(tool.connectionId)
    await this.assertWorkspaces(tool.workspaceIds)
    const changes = diffTool(toolColumns(current), tool)
    const who = await this.actor(userId)
    return this.write('A tool with that id', [
      this.prisma.ltiTool.update({ where: { toolId }, data: toolColumns(tool) }),
      // Saving without changing anything leaves no history row.
      ...(Object.keys(changes).length > 0
        ? [this.log('tool', toolId, tool.name, 'updated', who, changes)]
        : []),
    ])
  }

  /** Removes a tool. Course items that use it stop opening until it is back. */
  async removeTool(role: string | undefined, userId: string, toolId: string): Promise<Registry> {
    this.assertManage(role)
    const current = managedTools().find((t) => t.toolId === toolId)
    if (!current) throw new NotFoundException('Tool not found')
    const who = await this.actor(userId)
    return this.write('A tool with that id', [
      this.prisma.ltiTool.delete({ where: { toolId } }),
      this.log('tool', toolId, current.name, 'removed', who, diffTool(toolColumns(current), null)),
    ])
  }

  // ── connections ────────────────────────────────────────────────────────────

  /** A client id names one connection: the platform finds a tool's registration by it. */
  private assertClientId(c: StoredConnection): void {
    const clash = managedConnections().find((x) => x.id !== c.id && x.clientId === c.clientId)
    if (clash) throw new ConflictException(`That client id is already used by ${clash.name}`)
  }

  async createConnection(
    role: string | undefined,
    userId: string,
    body: unknown
  ): Promise<Registry> {
    this.assertManage(role)
    const c = validateConnectionInput(body)
    if (managedConnections().some((x) => x.id === c.id))
      throw new ConflictException('A connection with that id already exists')
    this.assertClientId(c)
    const who = await this.actor(userId)
    return this.write('A connection with that id or client id', [
      this.prisma.ltiConnection.create({ data: connectionColumns(c) }),
      this.log('connection', c.id, c.name, 'created', who, diffConnection(null, c)),
    ])
  }

  async updateConnection(
    role: string | undefined,
    userId: string,
    id: string,
    body: unknown
  ): Promise<Registry> {
    this.assertManage(role)
    const current = managedConnections().find((c) => c.id === id)
    if (!current) throw new NotFoundException('Connection not found')
    const c = validateConnectionInput(body, id)
    this.assertClientId(c)
    const changes = diffConnection(current, c)
    const who = await this.actor(userId)
    return this.write('A connection with that client id', [
      this.prisma.ltiConnection.update({ where: { id }, data: connectionColumns(c) }),
      ...(Object.keys(changes).length > 0
        ? [this.log('connection', id, c.name, 'updated', who, changes)]
        : []),
    ])
  }

  /** Removes a connection that no tool uses. */
  async removeConnection(role: string | undefined, userId: string, id: string): Promise<Registry> {
    this.assertManage(role)
    const current = managedConnections().find((c) => c.id === id)
    if (!current) throw new NotFoundException('Connection not found')
    const using = managedTools().filter((t) => t.connectionId === id).length
    if (using > 0)
      throw new ConflictException(
        `${using} ${using === 1 ? 'tool uses' : 'tools use'} this connection. Remove ${using === 1 ? 'it' : 'them'} first.`
      )
    const who = await this.actor(userId)
    return this.write('A connection with that id', [
      this.prisma.ltiConnection.delete({ where: { id } }),
      this.log('connection', id, current.name, 'removed', who, diffConnection(current, null)),
    ])
  }
}
