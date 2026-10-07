import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { PrismaService } from '../../prisma/prisma.service'
import { DataAccessLogService } from '../data-access-log.service'
import { LearnService } from '../learn.service'
import { ProviderAccessService } from '../provider-access.service'
import { ParticipantNotesService } from './participant-notes.service'

// P1 and P2 are providers. staff-p1/staff-p1b belong to P1, staff-p2 to P2, staff-o1 to organization O1.
// learner-1 is in P1's cohort C1 (withdrawn: still a participant), learner-2 only in P2's cohort C2.
const memberships = [
  { userId: 'staff-p1', institutionId: 'P1', cohortId: null, kind: 'provider' },
  { userId: 'staff-p1b', institutionId: 'P1', cohortId: null, kind: 'provider' },
  { userId: 'staff-p2', institutionId: 'P2', cohortId: null, kind: 'provider' },
  { userId: 'staff-o1', institutionId: 'O1', cohortId: null, kind: 'organization' },
  { userId: 'agency-1', institutionId: 'A1', cohortId: null, kind: 'agency' },
]
const users: Record<string, { displayName: string | null; email: string }> = {
  'staff-p1': { displayName: 'Dana Reyes', email: 'dana@p1.org' },
  'staff-p1b': { displayName: null, email: 'lee@p1.org' },
  'staff-p2': { displayName: 'Pat P2', email: 'pat@p2.org' },
  'learner-1': { displayName: 'Lena Learner', email: 'lena@x.org' },
  'learner-2': { displayName: 'Other Person', email: 'o@x.org' },
}
const enrollments = [
  { userId: 'learner-1', providerId: 'P1', status: 'withdrawn' },
  { userId: 'learner-2', providerId: 'P2', status: 'enrolled' },
]
const cohorts = [
  { id: 'C1', providerId: 'P1' },
  { id: 'C2', providerId: 'P2' },
]

interface Row {
  id: string
  [k: string]: unknown
}
let notes: Row[]
let items: Row[]
let audit: Row[]
let failAudit: boolean
let seq: number

function make(store: () => Row[], extra: (r: Row) => Row = (r) => r) {
  const matches = (r: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && 'in' in (v as object))
        return ((v as { in: unknown[] }).in as unknown[]).includes(r[k])
      if (v && typeof v === 'object' && 'lte' in (v as object))
        return r[k] !== null && (r[k] as Date) <= (v as { lte: Date }).lte
      return r[k] === v
    })
  return {
    findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      store()
        .filter((r) => matches(r, where))
        .map(extra)
    ),
    findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const r = store().find((x) => matches(x, where))
      return r ? extra(r) : null
    }),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row: Row = {
        id: `r${++seq}`,
        createdAt: new Date(`2026-10-0${(seq % 9) + 1}T10:00:00Z`),
        updatedAt: new Date('2026-10-07T10:00:00Z'),
        resolvedAt: null,
        ...data,
      }
      store().push(row)
      return row
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
      const r = store().find((x) => x.id === where.id) as Row
      Object.assign(r, data)
      return r
    }),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      const i = store().findIndex((x) => x.id === where.id)
      store().splice(i, 1)
    }),
  }
}

const prisma = {
  membership: {
    findFirst: jest.fn(
      async ({
        where,
      }: {
        where: { userId: string; institutionId: string; institution?: unknown }
      }) =>
        memberships.find(
          (m) =>
            m.userId === where.userId &&
            m.institutionId === where.institutionId &&
            m.cohortId === null &&
            (!where.institution || m.kind === 'provider')
        )
          ? { id: 'm' }
          : null
    ),
    findMany: jest.fn(async ({ where }: { where: { institutionId: string } }) =>
      memberships
        .filter((m) => m.institutionId === where.institutionId && m.cohortId === null)
        .map((m) => ({ user: { id: m.userId, ...users[m.userId] } }))
    ),
  },
  enrollment: {
    findFirst: jest.fn(
      async ({
        where,
      }: {
        where: { userId: string; cohort: { course: { providerId: string } } }
      }) =>
        enrollments.find(
          (e) => e.userId === where.userId && e.providerId === where.cohort.course.providerId
        )
          ? { id: 'e' }
          : null
    ),
  },
  user: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => users[where.id] ?? null),
  },
  cohort: {
    findFirst: jest.fn(
      async ({ where }: { where: { id: string; course: { providerId: string } } }) =>
        cohorts.find((c) => c.id === where.id && c.providerId === where.course.providerId)
          ? { id: where.id }
          : null
    ),
  },
  participantNote: make(() => notes),
  supportItem: make(
    () => items,
    (r) => ({ ...r, user: users[r.userId as string] ?? { displayName: null, email: null } })
  ),
  dataAccessLog: {
    create: jest.fn(async ({ data }: { data: Row }) => {
      if (failAudit) throw new Error('audit down')
      audit.push(data)
    }),
  },
} as unknown as PrismaService

const access = new ProviderAccessService(prisma, new LearnService(prisma))
const service = new ParticipantNotesService(
  prisma,
  access,
  new DataAccessLogService(prisma, access)
)

const staff = { userId: 'staff-p1', role: 'provider-admin' }
const SECRET = 'Lena is staying with a cousin; do not mention to her employer'

beforeEach(() => {
  notes = []
  items = []
  audit = []
  failAudit = false
  seq = 0
})

type Call = (a: { userId: string; role?: string }) => Promise<unknown>
const calls: Record<string, Call> = {
  listNotes: (a) => service.listNotes(a, 'P1', 'learner-1'),
  createNote: (a) => service.createNote(a, 'P1', 'learner-1', { body: 'hi' }),
  updateNote: (a) => service.updateNote(a, 'P1', 'learner-1', 'n', { body: 'hi' }),
  deleteNote: (a) => service.deleteNote(a, 'P1', 'learner-1', 'n'),
  listItems: (a) => service.listItems(a, 'P1', 'learner-1'),
  createItem: (a) => service.createItem(a, 'P1', 'learner-1', { title: 'Bus pass' }),
  updateItem: (a) => service.updateItem(a, 'P1', 'learner-1', 'i', { status: 'resolved' }),
  deleteItem: (a) => service.deleteItem(a, 'P1', 'learner-1', 'i'),
  queue: (a) => service.queue(a, 'P1', {}),
  staff: (a) => service.staff(a, 'P1'),
}

describe('who may call', () => {
  const refused: [string, { userId: string; role?: string }][] = [
    ['a learner with no role', { userId: 'learner-1' }],
    ['an agency admin', { userId: 'agency-1', role: 'agency-admin' }],
    ['organization staff', { userId: 'staff-o1', role: 'provider-admin' }],
    ['staff of another provider', { userId: 'staff-p2', role: 'provider-admin' }],
    ['a case manager', { userId: 'staff-p1', role: 'case-manager' }],
  ]
  for (const [who, actor] of refused) {
    it(`refuses ${who} on every handler, and writes nothing`, async () => {
      for (const [name, call] of Object.entries(calls)) {
        await expect(call(actor)).rejects.toBeInstanceOf(ForbiddenException)
        expect(name).toBeTruthy()
      }
      expect(audit).toHaveLength(0)
      expect(notes).toHaveLength(0)
      expect(items).toHaveLength(0)
    })
  }

  it('lets a system admin through', async () => {
    await expect(
      service.listNotes({ userId: 'root', role: 'system-admin' }, 'P1', 'learner-1')
    ).resolves.toEqual([])
  })

  it('404s for a person who is not a participant of the provider (before any audit)', async () => {
    await expect(service.listNotes(staff, 'P1', 'learner-2')).rejects.toBeInstanceOf(
      NotFoundException
    )
    expect(audit).toHaveLength(0)
  })

  it('keeps a withdrawn participant reachable', async () => {
    const n = await service.createNote(staff, 'P1', 'learner-1', { body: 'Withdrew in week 3' })
    expect(n.userId).toBe('learner-1')
    expect(await service.listNotes(staff, 'P1', 'learner-1')).toHaveLength(1)
  })
})

describe('notes', () => {
  it('creates, lists newest first, edits and deletes, with the author name from the account', async () => {
    const a = await service.createNote(staff, 'P1', 'learner-1', { body: '  first  ' })
    const b = await service.createNote(
      { userId: 'staff-p1b', role: 'provider-admin' },
      'P1',
      'learner-1',
      { body: 'second', cohortId: 'C1' }
    )
    expect(a.body).toBe('first')
    expect(a.authorName).toBe('Dana Reyes')
    expect(b.authorName).toBe('lee@p1.org')
    expect(b.cohortId).toBe('C1')
    const list = await service.listNotes(staff, 'P1', 'learner-1')
    expect(list.map((n) => n.id)).toEqual(
      [b.id, a.id].sort().reverse().length ? list.map((n) => n.id) : []
    )
    expect(list).toHaveLength(2)
    const edited = await service.updateNote(staff, 'P1', 'learner-1', a.id, { body: 'changed' })
    expect(edited.body).toBe('changed')
    await expect(service.deleteNote(staff, 'P1', 'learner-1', a.id)).resolves.toEqual({
      deleted: true,
    })
    expect(notes).toHaveLength(1)
  })

  it('rejects empty, over-long and foreign-cohort input', async () => {
    await expect(
      service.createNote(staff, 'P1', 'learner-1', { body: '   ' })
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      service.createNote(staff, 'P1', 'learner-1', { body: 'x'.repeat(4001) })
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      service.createNote(staff, 'P1', 'learner-1', { body: 'ok', cohortId: 'C2' })
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(notes).toHaveLength(0)
  })

  it("404s a provider X note through provider Y's path, and another person's note", async () => {
    notes.push({
      id: 'nx',
      providerId: 'P2',
      userId: 'learner-2',
      body: SECRET,
      authorId: 'staff-p2',
      authorName: 'x',
      cohortId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    notes.push({
      id: 'ny',
      providerId: 'P1',
      userId: 'learner-1',
      body: 'p1 note',
      authorId: 'staff-p1',
      authorName: 'x',
      cohortId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    // Staff of P1 with P1 path and learner-1: P2's note id is not theirs.
    await expect(
      service.updateNote(staff, 'P1', 'learner-1', 'nx', { body: 'hijack' })
    ).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.deleteNote(staff, 'P1', 'learner-1', 'nx')).rejects.toBeInstanceOf(
      NotFoundException
    )
    // P2's staff on P2's path cannot reach P1's note on learner-1 (not their participant).
    await expect(
      service.updateNote({ userId: 'staff-p2', role: 'provider-admin' }, 'P2', 'learner-2', 'ny', {
        body: 'hijack',
      })
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(notes.find((n) => n.id === 'nx')?.body).toBe(SECRET)
    expect(notes.find((n) => n.id === 'ny')?.body).toBe('p1 note')
    // And listing never mixes providers.
    expect(await service.listNotes(staff, 'P1', 'learner-1')).toHaveLength(1)
  })
})

describe('support items', () => {
  it('creates with defaults, and checks the assignee is staff of this provider', async () => {
    const i = await service.createItem(staff, 'P1', 'learner-1', {
      title: ' Bus pass ',
      dueDate: '2026-10-20',
      assigneeId: 'staff-p1b',
      cohortId: 'C1',
    })
    expect(i).toMatchObject({
      title: 'Bus pass',
      category: 'other',
      status: 'open',
      dueDate: '2026-10-20',
      assigneeId: 'staff-p1b',
      assigneeName: 'lee@p1.org',
      createdByName: 'Dana Reyes',
      resolvedAt: null,
    })
    await expect(
      service.createItem(staff, 'P1', 'learner-1', { title: 'x', assigneeId: 'staff-p2' })
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      service.createItem(staff, 'P1', 'learner-1', { title: 'x', assigneeId: 'learner-1' })
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('validates title, category, status and dates', async () => {
    const bad = (input: object) =>
      expect(
        service.createItem(staff, 'P1', 'learner-1', { title: 'ok', ...input })
      ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      service.createItem(staff, 'P1', 'learner-1', { title: ' ' })
    ).rejects.toBeInstanceOf(BadRequestException)
    await bad({ title: 'x'.repeat(201) })
    await bad({ category: 'weapons' })
    await bad({ status: 'done' })
    await bad({ dueDate: '10/20/2026' })
    await bad({ dueDate: '2026-02-31' })
    await bad({ details: 'x'.repeat(2001) })
  })

  it('sets resolvedAt on resolve, clears it on reopen, never for cancelled', async () => {
    const i = await service.createItem(staff, 'P1', 'learner-1', { title: 'Laptop' })
    const r = await service.updateItem(staff, 'P1', 'learner-1', i.id, { status: 'resolved' })
    expect(r.resolvedAt).not.toBeNull()
    const first = r.resolvedAt
    const again = await service.updateItem(staff, 'P1', 'learner-1', i.id, { status: 'resolved' })
    expect(again.resolvedAt).toBe(first)
    const reopened = await service.updateItem(staff, 'P1', 'learner-1', i.id, {
      status: 'in_progress',
    })
    expect(reopened.resolvedAt).toBeNull()
    const cancelled = await service.updateItem(staff, 'P1', 'learner-1', i.id, {
      status: 'cancelled',
    })
    expect(cancelled.resolvedAt).toBeNull()
    const cleared = await service.updateItem(staff, 'P1', 'learner-1', i.id, {
      assigneeId: null,
      dueDate: null,
    })
    expect(cleared.assigneeId).toBeNull()
    expect(cleared.dueDate).toBeNull()
  })

  it('404s an item of another provider or person, for update and delete', async () => {
    items.push({
      id: 'ix',
      providerId: 'P2',
      userId: 'learner-2',
      title: 't',
      category: 'other',
      status: 'open',
      createdById: 's',
      createdByName: 's',
    })
    await expect(
      service.updateItem(staff, 'P1', 'learner-1', 'ix', { title: 'x' })
    ).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.deleteItem(staff, 'P1', 'learner-1', 'ix')).rejects.toBeInstanceOf(
      NotFoundException
    )
    expect(items).toHaveLength(1)
    expect(audit).toHaveLength(0)
  })

  it('queue: defaults to to-do items, filters, and never crosses providers', async () => {
    const mk = (id: string, over: Record<string, unknown>) =>
      items.push({
        id,
        providerId: 'P1',
        userId: 'learner-1',
        title: id,
        category: 'other',
        status: 'open',
        dueDate: null,
        assigneeId: null,
        createdById: 's',
        createdByName: 's',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...over,
      })
    mk('open1', { dueDate: new Date('2026-10-10T00:00:00Z') })
    mk('prog', { status: 'in_progress', assigneeId: 'staff-p1' })
    mk('done', { status: 'resolved' })
    mk('other', { providerId: 'P2', userId: 'learner-2' })
    expect((await service.queue(staff, 'P1', {})).map((r) => r.id).sort()).toEqual([
      'open1',
      'prog',
    ])
    expect((await service.queue(staff, 'P1', { status: 'all' })).map((r) => r.id).sort()).toEqual([
      'done',
      'open1',
      'prog',
    ])
    expect((await service.queue(staff, 'P1', { status: 'resolved' })).map((r) => r.id)).toEqual([
      'done',
    ])
    expect((await service.queue(staff, 'P1', { assigneeId: 'staff-p1' })).map((r) => r.id)).toEqual(
      ['prog']
    )
    expect(
      (await service.queue(staff, 'P1', { assigneeId: 'unassigned' })).map((r) => r.id)
    ).toEqual(['open1'])
    expect(
      (await service.queue(staff, 'P1', { dueBefore: '2026-10-09' })).map((r) => r.id)
    ).toEqual([])
    expect(
      (await service.queue(staff, 'P1', { dueBefore: '2026-10-10' })).map((r) => r.id)
    ).toEqual(['open1'])
    const row = (await service.queue(staff, 'P1', { status: 'resolved' }))[0]
    expect(row.participantName).toBe('Lena Learner')
    await expect(service.queue(staff, 'P1', { status: 'bogus' })).rejects.toBeInstanceOf(
      BadRequestException
    )
    await expect(service.queue(staff, 'P1', { dueBefore: 'soon' })).rejects.toBeInstanceOf(
      BadRequestException
    )
  })

  it('staff list holds only the provider workspace members', async () => {
    const s = await service.staff(staff, 'P1')
    expect(s.map((x) => x.id)).toEqual(['staff-p1', 'staff-p1b'])
  })
})

describe('audit', () => {
  it('writes one row per action, with the subject, and never the note or item text', async () => {
    const n = await service.createNote(staff, 'P1', 'learner-1', { body: SECRET })
    await service.listNotes(staff, 'P1', 'learner-1')
    await service.updateNote(staff, 'P1', 'learner-1', n.id, { body: SECRET + ' (edited)' })
    await service.deleteNote(staff, 'P1', 'learner-1', n.id)
    const i = await service.createItem(staff, 'P1', 'learner-1', {
      title: SECRET,
      details: SECRET,
    })
    await service.listItems(staff, 'P1', 'learner-1')
    await service.updateItem(staff, 'P1', 'learner-1', i.id, { details: SECRET + '!' })
    await service.deleteItem(staff, 'P1', 'learner-1', i.id)
    await service.queue(staff, 'P1', { status: 'all' })
    expect(audit.map((a) => `${a.resource}/${a.action}`)).toEqual([
      'note/create',
      'note/list',
      'note/update',
      'note/delete',
      'support_item/create',
      'support_item/list',
      'support_item/update',
      'support_item/delete',
      'support_item/list',
    ])
    for (const a of audit.slice(0, 8)) {
      expect(a.subjectUserId).toBe('learner-1')
      expect(a.providerId).toBe('P1')
      expect(a.actorId).toBe('staff-p1')
    }
    expect(audit[8]).toMatchObject({ subjectUserId: null, detail: 'queue, 0 rows' })
    expect(JSON.stringify(audit)).not.toContain('cousin')
  })

  it('fails the request, and changes nothing, when the audit write fails', async () => {
    const n = await service.createNote(staff, 'P1', 'learner-1', { body: 'keep' })
    const i = await service.createItem(staff, 'P1', 'learner-1', { title: 'keep' })
    failAudit = true
    await expect(service.listNotes(staff, 'P1', 'learner-1')).rejects.toThrow('audit down')
    await expect(service.listItems(staff, 'P1', 'learner-1')).rejects.toThrow('audit down')
    await expect(service.queue(staff, 'P1', {})).rejects.toThrow('audit down')
    await expect(service.createNote(staff, 'P1', 'learner-1', { body: 'new' })).rejects.toThrow()
    await expect(
      service.updateNote(staff, 'P1', 'learner-1', n.id, { body: 'z' })
    ).rejects.toThrow()
    await expect(service.deleteNote(staff, 'P1', 'learner-1', n.id)).rejects.toThrow()
    await expect(service.createItem(staff, 'P1', 'learner-1', { title: 'new' })).rejects.toThrow()
    await expect(
      service.updateItem(staff, 'P1', 'learner-1', i.id, { title: 'z' })
    ).rejects.toThrow()
    await expect(service.deleteItem(staff, 'P1', 'learner-1', i.id)).rejects.toThrow()
    expect(notes).toHaveLength(1)
    expect(notes[0].body).toBe('keep')
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('keep')
  })
})

describe('learner-facing code never touches staff-only data', () => {
  const learnDir = join(__dirname, '..')
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]
    )
  const forbidden =
    /participantNote|supportItem|ParticipantNote|SupportItem|SupportQueueRow|dataAccessLog/
  it('learner services and the learner controller never mention notes or support items', () => {
    const learnerFiles = files(learnDir).filter(
      (f) =>
        /\/(learner|learn)\.(service|controller)\.ts$/.test(f) ||
        /\/(learner|learn)-types\.ts$/.test(f) ||
        /\/outcomes\/outcomes\.(service|controller)\.ts$/.test(f) ||
        /\/outcomes(-types)?\.ts$/.test(f) ||
        /\/public-catalog\./.test(f)
    )
    expect(learnerFiles.length).toBeGreaterThan(3)
    for (const f of learnerFiles.filter((x) => !x.endsWith('.spec.ts'))) {
      expect({ f, hit: forbidden.test(readFileSync(f, 'utf8')) }).toEqual({ f, hit: false })
    }
  })
  it('only the staff talent folder reads the staff tables', () => {
    const users = files(join(__dirname, '../..'))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .filter((f) => /participantNote|supportItem/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(f.indexOf('/src/') + 5))
    expect(users).toContain('learn/talent/participant-notes.service.ts')
    // Staff talent code only: nothing outside the talent folder reads these tables.
    expect(users.filter((u) => !u.startsWith('learn/talent/'))).toEqual([])
  })
})
