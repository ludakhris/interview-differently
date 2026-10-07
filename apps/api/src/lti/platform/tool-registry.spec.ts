import { ConflictException, ForbiddenException } from '@nestjs/common'
import type { ClerkService } from '../../auth/clerk.service'
import type { PrismaService } from '../../prisma/prisma.service'
import {
  defaultConnections,
  defaultTools,
  managedConnections,
  managedTools,
  registeredTools,
  resetStoredTools,
  scopeOf,
  setRegistryReady,
  setStoredConnections,
  setStoredTools,
  toolAllowedFor,
  toolById,
  type StoredConnection,
  type StoredTool,
} from './lti-platform-config'
import {
  connectionView,
  diffConnection,
  diffTool,
  internalHost,
  toolView,
  validateConnectionInput,
  validateToolInput,
} from './tool-config'
import { ToolRegistryService } from './tool-registry.service'

const goodTool = {
  toolId: 'acme-labs',
  connectionId: 'acme',
  name: 'Acme Labs',
  kind: 'interview',
}

const goodConnection = {
  id: 'acme',
  name: 'Acme',
  clientId: 'acme-client',
  deploymentId: '1',
  loginUrl: 'https://acme.example/lti/login',
  launchUrl: 'https://acme.example/lti/launch',
  jwksUrl: 'https://acme.example/lti/jwks',
}

describe('validateToolInput', () => {
  it('accepts a complete tool and fills the defaults for its kind', () => {
    expect(validateToolInput(goodTool)).toMatchObject({
      toolId: 'acme-labs',
      connectionId: 'acme',
      kind: 'interview',
      retries: true,
      labelable: false,
      enabled: true,
      workspaceIds: [],
    })
    expect(validateToolInput({ ...goodTool, kind: 'assessment' })).toMatchObject({
      retries: false,
      labelable: true,
    })
  })

  it('refuses a bad id, kind, or missing field, naming the problem', () => {
    expect(() => validateToolInput({ ...goodTool, toolId: 'Acme Labs' })).toThrow(/Tool id/)
    expect(() => validateToolInput({ ...goodTool, kind: 'quiz' })).toThrow(/Kind/)
    expect(() => validateToolInput({ ...goodTool, name: ' ' })).toThrow(/Name is required/)
    expect(() => validateToolInput({ ...goodTool, connectionId: undefined })).toThrow(/Connection/)
    expect(() => validateToolInput(null)).toThrow(/object/)
    expect(() => validateToolInput({ ...goodTool, retries: 'yes' })).toThrow(/Retries/)
  })

  it('takes the id from the path when given', () => {
    expect(validateToolInput({ ...goodTool, toolId: 'other' }, 'acme-labs').toolId).toBe(
      'acme-labs'
    )
  })

  it('reads a workspace list: none means everyone, duplicates collapse, junk is refused', () => {
    expect(
      validateToolInput({ ...goodTool, workspaceIds: ['a1', 'p1', 'a1'] }).workspaceIds
    ).toEqual(['a1', 'p1'])
    expect(() => validateToolInput({ ...goodTool, workspaceIds: 'a1' })).toThrow(/Workspaces/)
    expect(() => validateToolInput({ ...goodTool, workspaceIds: [1] })).toThrow(/Workspace id/)
    expect(() =>
      validateToolInput({
        ...goodTool,
        workspaceIds: Array.from({ length: 101 }, (_, i) => `w${i}`),
      })
    ).toThrow(/Workspaces/)
  })
})

describe('validateConnectionInput', () => {
  it('accepts a complete connection', () => {
    expect(validateConnectionInput(goodConnection)).toEqual(goodConnection)
  })

  it('refuses a bad id or a missing field', () => {
    expect(() => validateConnectionInput({ ...goodConnection, id: 'Acme!' })).toThrow(
      /Connection id/
    )
    expect(() => validateConnectionInput({ ...goodConnection, clientId: undefined })).toThrow(
      /Client id/
    )
    expect(() => validateConnectionInput({ ...goodConnection, name: '' })).toThrow(/Name/)
    expect(() => validateConnectionInput([])).toThrow(/object/)
  })

  it('takes the id from the path when given', () => {
    expect(validateConnectionInput({ ...goodConnection, id: 'x' }, 'acme').id).toBe('acme')
  })

  it('needs https URLs, allowing http only for a local host in development, and no embedded login', () => {
    const bad = (jwksUrl: string) => () => validateConnectionInput({ ...goodConnection, jwksUrl })
    expect(bad('http://acme.example/x')).toThrow(/https/)
    expect(bad('javascript:alert(1)')).toThrow(/https/)
    expect(bad('not a url')).toThrow(/valid URL/)
    expect(bad('https://u:p@acme.example/k')).toThrow(/login/)
    expect(
      validateConnectionInput({ ...goodConnection, loginUrl: 'http://localhost:3000/login' })
        .loginUrl
    ).toBe('http://localhost:3000/login')
    expect(bad('https://10.0.0.5/jwks')).toThrow(/public address/)
  })
})

describe('URL safety', () => {
  const prod = () => {
    const was = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    return () => {
      process.env.NODE_ENV = was
    }
  }

  it('recognises hosts inside the network', () => {
    for (const h of [
      'localhost',
      'app.localhost',
      '127.0.0.1',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '[::1]',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:10.0.0.1',
      '[::ffff:7f00:1]',
      '[::ffff:a9fe:a9fe]',
      '[::7f00:1]',
      '[64:ff9b::7f00:1]',
      '[2002:7f00:1::]',
      '[2001:0:4136:e378:8000:63bf:3fff:fdd2]',
      'ff02::1',
      'localhost.',
      'db.internal.',
      'db.internal',
      'printer.local',
    ])
      expect(internalHost(h)).toBe(true)
    for (const h of [
      'acme.example',
      'acme.example.',
      '8.8.8.8',
      '172.32.0.1',
      '172.15.0.1',
      '192.169.0.1',
      '100.63.0.1',
      '[2606:4700:4700::1111]',
      '[::ffff:808:808]',
      '[64:ff9b::808:808]',
    ])
      expect(internalHost(h)).toBe(false)
  })

  it('refuses internal addresses in production, including localhost over http', () => {
    const restore = prod()
    try {
      for (const u of [
        'https://169.254.169.254/latest/meta-data',
        'https://10.0.0.5/jwks',
        'https://localhost/jwks',
        'http://localhost:3000/jwks',
        'https://[::1]/jwks',
        'https://2130706433/jwks',
        'https://0x7f.1/jwks',
        'https://[::ffff:127.0.0.1]/jwks',
        'https://[::ffff:169.254.169.254]/jwks',
        'https://localhost./jwks',
        'https://foo.internal./jwks',
      ])
        expect(() => validateConnectionInput({ ...goodConnection, jwksUrl: u })).toThrow(
          /public address|https/
        )
      expect(validateConnectionInput(goodConnection).jwksUrl).toBe(goodConnection.jwksUrl)
    } finally {
      restore()
    }
  })
})

describe('workspace limits', () => {
  it('allows everyone when the list is empty, else a listed workspace or its agency', () => {
    const open = { workspaceIds: [] }
    const limited = { workspaceIds: ['agency-1'] }
    expect(toolAllowedFor(open, scopeOf({ id: 'p1', parentId: 'agency-2' }))).toBe(true)
    expect(toolAllowedFor(limited, scopeOf({ id: 'p1', parentId: 'agency-1' }))).toBe(true)
    expect(toolAllowedFor(limited, scopeOf({ id: 'agency-1', parentId: null }))).toBe(true)
    expect(toolAllowedFor(limited, scopeOf({ id: 'p1', parentId: 'agency-2' }))).toBe(false)
    expect(toolAllowedFor(limited, scopeOf({ id: 'p1', parentId: null }))).toBe(false)
    expect(toolAllowedFor({ workspaceIds: ['p1'] }, scopeOf({ id: 'p1', parentId: 'a' }))).toBe(
      true
    )
  })

  it('shows who may use a tool only to someone who can manage tools', () => {
    const tool = { ...defaultTools()[0], workspaceIds: ['a1'] }
    expect(toolView(tool, false).workspaceIds).toEqual([])
    expect(toolView(tool, true).workspaceIds).toEqual(['a1'])
    expect(toolView(tool, true)).not.toHaveProperty('clientId')
  })

  it('counts the tools on each connection', () => {
    const [c] = defaultConnections()
    expect(connectionView(c, defaultTools())).toMatchObject({ id: c.id, toolCount: 2 })
    expect(connectionView(c, [])).toMatchObject({ toolCount: 0 })
  })
})

describe('what changed', () => {
  it('lists only the fields that differ', () => {
    const [a] = defaultTools()
    expect(diffTool(a, { ...a, name: 'New', enabled: false })).toEqual({
      name: { from: a.name, to: 'New' },
      enabled: { from: true, to: false },
    })
    expect(diffTool(a, { ...a })).toEqual({})
    expect(diffTool(a, { ...a, workspaceIds: ['x'] })).toEqual({
      workspaceIds: { from: [], to: ['x'] },
    })
  })

  it('treats a new tool as every field from nothing, and a removed one as every field to nothing', () => {
    const [a] = defaultTools()
    expect(diffTool(null, a).name).toEqual({ from: null, to: a.name })
    expect(diffTool(a, null).name).toEqual({ from: a.name, to: null })
    const [c] = defaultConnections()
    expect(Object.keys(diffConnection(null, c))).toEqual([
      'name',
      'clientId',
      'deploymentId',
      'loginUrl',
      'launchUrl',
      'jwksUrl',
    ])
    expect(diffConnection(c, { ...c, launchUrl: 'https://n.example/l' })).toEqual({
      launchUrl: { from: c.launchUrl, to: 'https://n.example/l' },
    })
  })
})

describe('start-up', () => {
  afterEach(() => {
    resetStoredTools()
    setRegistryReady(true)
  })

  it('has the two Interview Differently tools and their connection until a registry is loaded', () => {
    expect(managedTools().map((t) => t.toolId)).toEqual(['id-interview', 'id-assessment'])
    expect(managedConnections().map((c) => c.id)).toEqual(['interview-differently'])
  })

  it('treats every tool as off until the stored tools have loaded, so a restriction is not lost', () => {
    setRegistryReady(false)
    expect(registeredTools()).toEqual([])
    expect(toolById('id-interview')).toBeUndefined()
    setRegistryReady(true)
    expect(registeredTools().length).toBe(2)
  })
})

describe('the tools the platform reads', () => {
  afterEach(() => resetStoredTools())

  const row = (over: Partial<StoredTool> = {}): StoredTool => ({
    ...defaultTools()[0],
    toolId: 'acme-labs',
    name: 'Acme Labs',
    ...over,
  })

  it('are exactly the loaded rows: nothing else is added from code', () => {
    setStoredTools([row()])
    expect(managedTools().map((t) => t.toolId)).toEqual(['acme-labs'])
    expect(toolById('id-interview')).toBeUndefined()
  })

  it('list a switched-off tool for the admin, but it cannot be launched', () => {
    setStoredTools([row(), row({ toolId: 'off', enabled: false })])
    expect(registeredTools().map((t) => t.toolId)).toEqual(['acme-labs'])
    expect(toolById('off')).toBeUndefined()
    expect(managedTools().find((t) => t.toolId === 'off')).toMatchObject({ enabled: false })
  })
})

describe('ToolRegistryService', () => {
  const prisma = {
    institution: { findMany: jest.fn() },
    platformConfig: { findUnique: jest.fn(), upsert: jest.fn() },
    ltiConnection: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    ltiTool: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    ltiRegistryChange: { create: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  }
  const clerk = { getUserProfile: jest.fn() }
  const service = new ToolRegistryService(
    prisma as unknown as PrismaService,
    clerk as unknown as ClerkService
  )
  const admin = 'system-admin'
  const connection = (over: Partial<StoredConnection> = {}): StoredConnection => ({
    ...goodConnection,
    ...over,
  })

  /** What `load()` reads back: the default connection and tools, plus anything extra. */
  const stored = (extra: { connections?: StoredConnection[]; tools?: StoredTool[] } = {}) => {
    const conns = [...defaultConnections(), ...(extra.connections ?? [])]
    prisma.ltiConnection.findMany.mockResolvedValue(conns)
    prisma.ltiTool.findMany.mockResolvedValue(
      [...defaultTools(), ...(extra.tools ?? [])].map((t) => ({
        ...t,
        connection: conns.find((c) => c.id === t.connectionId),
      }))
    )
  }

  beforeEach(() => {
    jest.resetAllMocks()
    stored()
    prisma.institution.findMany.mockResolvedValue([])
    prisma.platformConfig.findUnique.mockResolvedValue({ key: 'lti-tools-seeded' })
    prisma.$transaction.mockResolvedValue([])
    prisma.ltiRegistryChange.findMany.mockResolvedValue([])
    clerk.getUserProfile.mockResolvedValue({
      email: 'boss@example.com',
      displayName: 'Boss Person',
    })
    service.retryDelayMs = 0
    setRegistryReady(true)
    setStoredConnections(defaultConnections())
    setStoredTools(defaultTools())
  })
  afterEach(() => {
    resetStoredTools()
    setRegistryReady(true)
  })

  it('lets only a system administrator manage tools', () => {
    expect(service.canManage('system-admin')).toBe(true)
    for (const role of ['agency-admin', 'provider-admin', 'case-manager', undefined])
      expect(service.canManage(role)).toBe(false)
  })

  describe('start', () => {
    it('writes the default connection and tools once, with a history entry each, then loads', async () => {
      prisma.platformConfig.findUnique.mockResolvedValue(null)
      await service.onModuleInit()
      expect(prisma.ltiConnection.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ id: 'interview-differently' })],
        skipDuplicates: true,
      })
      expect(prisma.ltiTool.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            toolId: 'id-interview',
            connectionId: 'interview-differently',
          }),
          expect.objectContaining({ toolId: 'id-assessment' }),
        ],
        skipDuplicates: true,
      })
      const log = prisma.ltiRegistryChange.createMany.mock.calls[0][0].data
      expect(
        log.map((e: { subject: string; subjectId: string }) => [e.subject, e.subjectId])
      ).toEqual([
        ['connection', 'interview-differently'],
        ['tool', 'id-interview'],
        ['tool', 'id-assessment'],
      ])
      expect(log[0]).toMatchObject({
        action: 'created',
        userId: null,
        userName: 'System (first start)',
      })
      expect(prisma.platformConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { key: 'lti-tools-seeded' } })
      )
      expect(registeredTools().length).toBe(2)
    })

    it('does not write them again, so a tool an admin removed stays removed', async () => {
      prisma.ltiConnection.findMany.mockResolvedValue([])
      prisma.ltiTool.findMany.mockResolvedValue([])
      await service.onModuleInit()
      expect(prisma.ltiTool.createMany).not.toHaveBeenCalled()
      expect(registeredTools()).toEqual([])
    })

    it('keeps every tool off when the database cannot be read, trying three times', async () => {
      prisma.platformConfig.findUnique.mockRejectedValue(new Error('db down'))
      await service.onModuleInit()
      expect(prisma.platformConfig.findUnique).toHaveBeenCalledTimes(3)
      expect(registeredTools()).toEqual([])
      prisma.platformConfig.findUnique.mockResolvedValue({ key: 'x' })
      await service.load()
      expect(registeredTools().length).toBe(2)
    })

    it('gives each tool the launch settings of its connection', async () => {
      const acme = connection()
      stored({
        connections: [acme],
        tools: [{ ...defaultTools()[0], toolId: 'acme-labs', connectionId: 'acme' }],
      })
      await service.load()
      expect(toolById('acme-labs')).toMatchObject({
        clientId: 'acme-client',
        launchUrl: 'https://acme.example/lti/launch',
      })
      expect(toolById('id-interview')?.clientId).toBe(defaultConnections()[0].clientId)
    })
  })

  describe('who may change things', () => {
    it('refuses everyone but a system administrator, writing nothing', async () => {
      for (const role of ['agency-admin', 'provider-admin']) {
        await expect(service.createTool(role, 'u1', goodTool)).rejects.toThrow(ForbiddenException)
        await expect(service.updateTool(role, 'u1', 'id-interview', goodTool)).rejects.toThrow(
          ForbiddenException
        )
        await expect(service.removeTool(role, 'u1', 'id-interview')).rejects.toThrow(
          ForbiddenException
        )
        await expect(service.createConnection(role, 'u1', goodConnection)).rejects.toThrow(
          ForbiddenException
        )
        await expect(service.updateConnection(role, 'u1', 'x', goodConnection)).rejects.toThrow(
          ForbiddenException
        )
        await expect(service.removeConnection(role, 'u1', 'x')).rejects.toThrow(ForbiddenException)
        await expect(service.history(role)).rejects.toThrow(ForbiddenException)
      }
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('tools', () => {
    it('adds a tool and logs who added it, in one transaction', async () => {
      const acme = connection()
      setStoredConnections([...defaultConnections(), acme])
      await service.createTool(admin, 'u1', goodTool)
      expect(prisma.ltiTool.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ toolId: 'acme-labs', connectionId: 'acme' }),
      })
      expect(prisma.ltiRegistryChange.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subject: 'tool',
          subjectId: 'acme-labs',
          action: 'created',
          userId: 'u1',
          userName: 'Boss Person',
        }),
      })
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    })

    it('names the person by email when they have no display name, else by id', async () => {
      stored({ connections: [connection()] })
      setStoredConnections([...defaultConnections(), connection()])
      clerk.getUserProfile.mockResolvedValue({ email: 'only@example.com', displayName: ' ' })
      await service.createTool(admin, 'u1', goodTool)
      expect(prisma.ltiRegistryChange.create.mock.calls[0][0].data.userName).toBe(
        'only@example.com'
      )
      clerk.getUserProfile.mockResolvedValue(null)
      await service.createTool(admin, 'u1', { ...goodTool, toolId: 'second' })
      expect(prisma.ltiRegistryChange.create.mock.calls[1][0].data.userName).toBe('u1')
    })

    it('refuses an unknown connection, a taken id, and a bad workspace list, writing nothing', async () => {
      await expect(service.createTool(admin, 'u1', goodTool)).rejects.toThrow(/existing connection/)
      await expect(
        service.createTool(admin, 'u1', {
          ...goodTool,
          toolId: 'id-interview',
          connectionId: 'interview-differently',
        })
      ).rejects.toThrow(ConflictException)
      prisma.institution.findMany.mockResolvedValue([{ id: 'a1' }])
      await expect(
        service.createTool(admin, 'u1', {
          ...goodTool,
          connectionId: 'interview-differently',
          workspaceIds: ['a1', 'ghost'],
        })
      ).rejects.toThrow(/existing agencies or providers/)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('answers 409, not 500, when another request created the same tool first', async () => {
      setStoredConnections([...defaultConnections(), connection()])
      prisma.$transaction.mockRejectedValue({ code: 'P2002' })
      await expect(service.createTool(admin, 'u1', goodTool)).rejects.toThrow(ConflictException)
    })

    it('saves a change and logs exactly what changed', async () => {
      await service.updateTool(admin, 'u1', 'id-interview', {
        ...defaultTools()[0],
        name: 'Renamed',
        workspaceIds: [],
      })
      expect(prisma.ltiRegistryChange.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'updated',
          subjectId: 'id-interview',
          changes: { name: { from: 'Interview Differently', to: 'Renamed' } },
        }),
      })
    })

    it('leaves no history row when nothing changed', async () => {
      await service.updateTool(admin, 'u1', 'id-interview', defaultTools()[0])
      expect(prisma.ltiTool.update).toHaveBeenCalledTimes(1)
      expect(prisma.ltiRegistryChange.create).not.toHaveBeenCalled()
    })

    it('says not found for a tool that is not there', async () => {
      await expect(service.updateTool(admin, 'u1', 'ghost', goodTool)).rejects.toThrow(/not found/)
      await expect(service.removeTool(admin, 'u1', 'ghost')).rejects.toThrow(/not found/)
    })

    it('removes a tool and logs what it was', async () => {
      await service.removeTool(admin, 'u1', 'id-interview')
      expect(prisma.ltiTool.delete).toHaveBeenCalledWith({ where: { toolId: 'id-interview' } })
      expect(prisma.ltiRegistryChange.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'removed',
          subjectName: 'Interview Differently',
          changes: expect.objectContaining({ name: { from: 'Interview Differently', to: null } }),
        }),
      })
    })
  })

  describe('connections', () => {
    it('adds a connection and logs it', async () => {
      await service.createConnection(admin, 'u1', goodConnection)
      expect(prisma.ltiConnection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ id: 'acme', clientId: 'acme-client' }),
      })
      expect(prisma.ltiRegistryChange.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subject: 'connection',
          subjectId: 'acme',
          action: 'created',
        }),
      })
    })

    it('will not give two connections one client id, or reuse an id', async () => {
      const taken = defaultConnections()[0]
      await expect(
        service.createConnection(admin, 'u1', { ...goodConnection, clientId: taken.clientId })
      ).rejects.toThrow(/client id is already used/)
      await expect(
        service.createConnection(admin, 'u1', { ...goodConnection, id: taken.id })
      ).rejects.toThrow(/already exists/)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('changes a connection once and every tool on it follows, with one history row', async () => {
      const [c] = defaultConnections()
      await service.updateConnection(admin, 'u1', c.id, {
        ...c,
        launchUrl: 'https://new.example/launch',
      })
      expect(prisma.ltiConnection.update).toHaveBeenCalledWith({
        where: { id: c.id },
        data: expect.objectContaining({ launchUrl: 'https://new.example/launch' }),
      })
      expect(prisma.ltiRegistryChange.create).toHaveBeenCalledTimes(1)
      expect(prisma.ltiRegistryChange.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subject: 'connection',
          changes: { launchUrl: { from: c.launchUrl, to: 'https://new.example/launch' } },
        }),
      })
    })

    it("will not move a connection onto another one's client id, or save one that is not there", async () => {
      setStoredConnections([...defaultConnections(), connection()])
      await expect(
        service.updateConnection(admin, 'u1', 'acme', {
          ...goodConnection,
          clientId: defaultConnections()[0].clientId,
        })
      ).rejects.toThrow(/client id is already used/)
      await expect(service.updateConnection(admin, 'u1', 'ghost', goodConnection)).rejects.toThrow(
        /not found/
      )
    })

    it('refuses to remove a connection that tools still use, and removes an unused one', async () => {
      await expect(service.removeConnection(admin, 'u1', 'interview-differently')).rejects.toThrow(
        /2 tools use this connection/
      )
      expect(prisma.ltiConnection.delete).not.toHaveBeenCalled()
      setStoredConnections([...defaultConnections(), connection()])
      await service.removeConnection(admin, 'u1', 'acme')
      expect(prisma.ltiConnection.delete).toHaveBeenCalledWith({ where: { id: 'acme' } })
      expect(prisma.ltiRegistryChange.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ subject: 'connection', action: 'removed' }),
      })
    })
  })

  describe('history', () => {
    it("lists the recent changes newest first, or one tool's", async () => {
      const at = new Date('2026-10-07T04:00:00Z')
      prisma.ltiRegistryChange.findMany.mockResolvedValue([
        {
          id: 'h1',
          subject: 'tool',
          subjectId: 'id-interview',
          subjectName: 'Interview Differently',
          action: 'updated',
          userId: 'u1',
          userName: 'Boss Person',
          changes: { enabled: { from: true, to: false } },
          createdAt: at,
        },
      ])
      expect(await service.history(admin, 'id-interview')).toEqual([
        {
          id: 'h1',
          subject: 'tool',
          subjectId: 'id-interview',
          subjectName: 'Interview Differently',
          action: 'updated',
          userName: 'Boss Person',
          changes: { enabled: { from: true, to: false } },
          createdAt: at.toISOString(),
        },
      ])
      expect(prisma.ltiRegistryChange.findMany).toHaveBeenCalledWith({
        where: { subjectId: 'id-interview' },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      await service.history(admin)
      expect(prisma.ltiRegistryChange.findMany).toHaveBeenLastCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
    })
  })
})
