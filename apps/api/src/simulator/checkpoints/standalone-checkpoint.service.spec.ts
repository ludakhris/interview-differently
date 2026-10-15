import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common'
import { MemoryLtiStore } from '../../lti/lti-store'
import { tenantContext, withTenantContext } from '../../core/tenant-context'
import { AuthenticatedGuard } from '../../auth/authenticated.guard'
import { CheckpointChatService } from './checkpoint-chat.service'
import { parsePlacement, samePlacement } from './checkpoint-placement'
import { StandaloneCheckpointController } from './standalone-checkpoint.controller'
import {
  DEFAULT_SCENARIO,
  StandaloneCheckpointService,
  placementFromBank,
} from './standalone-checkpoint.service'
import { STANDALONE_COHORT_ID, STANDALONE_INSTITUTION_ID } from './standalone-cohort'

// The chat simulation in standalone Interview Differently (GitHub issue #90): the same chat as an LTI launch, on the
// standalone cohort, for banks the learner may use.

const sql = (id: string, from?: string) => ({
  id,
  type: 'sql',
  prompt: `Request ${id}`,
  referenceSql: `select '${id}'`,
  ordered: false,
  strictColumns: false,
  ...(from ? { from } : {}),
})
const mc = (id: string) => ({ id, type: 'mc', prompt: 'Pick', options: [], answer: 'A' })

const CHAT_BANK = {
  slug: 'orders',
  title: 'Orders desk',
  sections: [
    {
      id: 's1',
      number: 1,
      title: 'One',
      competency: 'Finding the right records',
      draw: null,
      questions: [sql('1.1', 'Dana · Support'), mc('1.2')],
    },
    { id: 's2', number: 2, title: 'Two', draw: null, questions: [sql('2.1'), sql('2.2', 'Sam')] },
  ],
}
const PLAIN_BANK = {
  slug: 'quiz',
  title: 'Plain quiz',
  sections: [{ id: 's1', number: 1, title: 'One', draw: null, questions: [sql('1.1'), mc('1.2')] }],
}

describe('placementFromBank', () => {
  it('asks every SQL question in order, one answer each, as a chat with the bank title (not a diagnostic)', () => {
    const p = placementFromBank(CHAT_BANK)
    expect(p).toEqual({
      bankSlug: 'orders',
      refs: ['1.1', '2.1', '2.2'],
      title: 'Orders desk',
      scenario: DEFAULT_SCENARIO,
      diagnostic: false,
      oneAnswer: true,
      practice: null,
    })
    // it survives being stored and read back, so a reopened simulation does not rewrite its delivery
    expect(parsePlacement(JSON.parse(JSON.stringify(p)))).toEqual(p)
    expect(samePlacement(JSON.parse(JSON.stringify(p)), p!)).toBe(true)
  })

  it('is no simulation when no SQL question has a sender', () => {
    expect(placementFromBank(PLAIN_BANK)).toBeNull()
    expect(placementFromBank({ slug: 'x', title: 'X', sections: null })).toBeNull()
  })

  it('stays within what a placement may name', () => {
    const many = Array.from({ length: 60 }, (_, i) => sql(`1.${i}`, 'Dana'))
    const p = placementFromBank({
      slug: 'big',
      title: 'T'.repeat(400),
      sections: [{ id: 's1', number: 1, title: 'One', draw: null, questions: many }],
    })
    expect(p?.refs).toHaveLength(50)
    expect(p?.title).toHaveLength(300)
  })
})

function setup(opts: { admin?: boolean; banks?: object[]; events?: object[] } = {}) {
  const banks = opts.banks ?? [CHAT_BANK, PLAIN_BANK]
  const seen: { institution?: unknown; cohort?: unknown } = {}
  const prisma = {
    assessment: {
      findMany: jest.fn(async () => banks),
      findFirst: jest.fn(
        async (args: { where: { slug: string } }) =>
          (banks as { slug: string }[]).find((b) => b.slug === args.where.slug) ?? null
      ),
      findUnique: jest.fn(async () => ({ id: 'as1' })),
    },
    assessmentDelivery: {
      findFirst: jest.fn(async (): Promise<unknown> => null),
      findUnique: jest.fn(),
      create: jest.fn(async () => ({ id: 'd1' })),
      update: jest.fn(async () => ({})),
    },
    practiceEvent: { findMany: jest.fn(async () => opts.events ?? []) },
    institution: {
      upsert: jest.fn(async (args: { where: { id: string } }) => {
        if (args.where.id === STANDALONE_INSTITUTION_ID) seen.institution = tenantContext()
        return {}
      }),
    },
    cohort: {
      upsert: jest.fn(async () => {
        seen.cohort = tenantContext()
        return {}
      }),
    },
  }
  const engine = {}
  const chat = new CheckpointChatService(prisma as never, engine as never)
  const ctx = {
    slot: { cohortId: STANDALONE_COHORT_ID, userId: 'u1', itemId: 'standalone:orders' },
  }
  const contextOf = jest.spyOn(chat, 'contextOf').mockResolvedValue(ctx as never)
  const view = jest.spyOn(chat, 'view').mockResolvedValue({ deliveryId: 'd1' } as never)
  const answer = jest.spyOn(chat, 'answer').mockResolvedValue({ correct: true } as never)
  const run = jest.spyOn(chat, 'run').mockResolvedValue({} as never)
  const help = jest.spyOn(chat, 'help').mockResolvedValue({} as never)
  const clerk = { isAdmin: jest.fn(async () => opts.admin === true) }
  const store = new MemoryLtiStore()
  const svc = new StandaloneCheckpointService(prisma as never, chat, clerk as never, store)
  return { svc, prisma, chat: { contextOf, view, answer, run, help }, seen, store }
}

const visible = {
  OR: [{ institutionId: null }, { institution: { memberships: { some: { userId: 'u1' } } } }],
}

describe('the list', () => {
  it("shows the learner's chat banks (platform-wide or their institution's), with how far they got", async () => {
    const { svc, prisma } = setup({
      events: [
        { itemId: 'standalone:orders', ref: '1.1', correct: false },
        { itemId: 'standalone:orders', ref: '1.1', correct: true },
        { itemId: 'standalone:orders', ref: '2.1', correct: false },
      ],
    })
    expect(await svc.list('u1')).toEqual([
      {
        bankSlug: 'orders',
        title: 'Orders desk',
        requests: 3,
        answered: 2,
        done: false,
        scorePct: null,
        // per skill from the latest answers: the competency name, else the section title
        competencies: [
          { name: 'Finding the right records', score: 100 },
          { name: 'Two', score: 0 },
        ],
      },
    ])
    expect(prisma.assessment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { datasetId: { not: null }, ...visible } })
    )
    expect(prisma.practiceEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          cohortId: STANDALONE_COHORT_ID,
          userId: 'u1',
          kind: 'answer',
          itemId: { in: ['standalone:orders'] },
        },
      })
    )
  })

  it('is done with a score once every request has an answer', async () => {
    const { svc } = setup({
      events: ['1.1', '2.1', '2.2'].map((ref, i) => ({
        itemId: 'standalone:orders',
        ref,
        correct: i < 2,
      })),
    })
    expect((await svc.list('u1'))[0]).toMatchObject({
      answered: 3,
      done: true,
      scorePct: 67,
      competencies: [
        { name: 'Finding the right records', score: 100 },
        { name: 'Two', score: 50 },
      ],
    })
  })

  it('shows a platform admin every bank', async () => {
    const { svc, prisma } = setup({ admin: true })
    await svc.list('u1')
    expect(prisma.assessment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { datasetId: { not: null } } })
    )
  })
})

describe('starting a simulation', () => {
  it('records on the standalone cohort (made by a migration, never here), with the placement built from the bank', async () => {
    const { svc, prisma } = setup()
    // a signed-in learner, as AuthenticatedGuard leaves the context
    const out = await withTenantContext(() => svc.start('u1', { bankSlug: 'orders' }), {
      userId: 'u1',
    })
    expect(out).toEqual({ deliveryId: 'd1' })
    expect(prisma.institution.upsert).not.toHaveBeenCalled()
    expect(prisma.cohort.upsert).not.toHaveBeenCalled()
    expect(prisma.assessmentDelivery.create).toHaveBeenCalledWith({
      data: {
        assessmentId: 'as1',
        cohortId: STANDALONE_COHORT_ID,
        label: 'standalone:orders',
        config: placementFromBank(CHAT_BANK),
      },
      select: { id: true },
    })
    // a second start reuses the delivery and makes nothing
    prisma.assessmentDelivery.findFirst.mockResolvedValue({
      id: 'd1',
      config: placementFromBank(CHAT_BANK),
    })
    await svc.start('u1', { bankSlug: 'orders' })
    expect(prisma.assessmentDelivery.create).toHaveBeenCalledTimes(1)
    expect(prisma.assessmentDelivery.update).not.toHaveBeenCalled()
    // a delivery stored before one answer per request is brought up to date when the simulation is opened
    prisma.assessmentDelivery.findFirst.mockResolvedValue({
      id: 'd1',
      config: { ...placementFromBank(CHAT_BANK), oneAnswer: undefined },
    })
    await svc.start('u1', { bankSlug: 'orders' })
    expect(prisma.assessmentDelivery.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { config: placementFromBank(CHAT_BANK) },
    })
    expect(prisma.cohort.upsert).not.toHaveBeenCalled()
  })

  it('refuses a bank the learner may not use, one that is not a chat, and a missing slug', async () => {
    const { svc, prisma } = setup()
    await expect(svc.start('u1', { bankSlug: 'quiz' })).rejects.toThrow(NotFoundException)
    await expect(svc.start('u1', { bankSlug: 'elsewhere' })).rejects.toThrow(NotFoundException)
    await expect(svc.start('u1', {})).rejects.toThrow(BadRequestException)
    await expect(svc.start('u1', { bankSlug: 'x'.repeat(301) })).rejects.toThrow(
      BadRequestException
    )
    expect(prisma.assessment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'quiz', datasetId: { not: null }, ...visible } })
    )
    expect(prisma.assessmentDelivery.create).not.toHaveBeenCalled()
    expect(prisma.cohort.upsert).not.toHaveBeenCalled()
  })
})

describe('the chat', () => {
  const standalone = {
    label: 'standalone:orders',
    config: placementFromBank(CHAT_BANK),
    assessment: CHAT_BANK,
  }

  it("runs the learner's own slot on the standalone cohort through the same chat service", async () => {
    const { svc, prisma, chat } = setup()
    prisma.assessmentDelivery.findFirst.mockResolvedValue(standalone)
    await svc.view('u1', 'd1')
    expect(prisma.assessmentDelivery.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'd1', cohortId: STANDALONE_COHORT_ID, assessment: visible },
      })
    )
    // the slot, with the placement made from the bank as it is now (as the list and start make it)
    expect(chat.view).toHaveBeenCalledWith({
      slot: { cohortId: STANDALONE_COHORT_ID, userId: 'u1', itemId: 'standalone:orders' },
      deliveryId: 'd1',
      placement: placementFromBank(CHAT_BANK),
    })
    expect(prisma.assessmentDelivery.update).not.toHaveBeenCalled()
    await svc.answer('u1', 'd1', { ref: '1.1', sql: 'select 1', extra: 'x' })
    expect(chat.answer).toHaveBeenCalledWith(expect.anything(), {
      ref: '1.1',
      sql: 'select 1',
      pass: undefined,
    })
    await svc.run('u1', 'd1', { ref: '1.1', sql: 'select 1' })
    await svc.help('u1', 'd1', { ref: '1.1', sql: '', kind: 'hint' })
    expect(chat.help).toHaveBeenCalledWith(expect.anything(), { ref: '1.1', sql: '', kind: 'hint' })
  })

  it("refuses another cohort's delivery (a course's), a course delivery on the cohort, and a bank they lost", async () => {
    const { svc, prisma, chat } = setup()
    prisma.assessmentDelivery.findFirst.mockResolvedValue(null)
    await expect(svc.view('u1', 'course-delivery')).rejects.toThrow(NotFoundException)
    prisma.assessmentDelivery.findFirst.mockResolvedValue({ ...standalone, label: 'lti:item-1' })
    await expect(svc.answer('u1', 'd1', { ref: '1.1', sql: 'x' })).rejects.toThrow(
      NotFoundException
    )
    expect(chat.contextOf).not.toHaveBeenCalled()
    expect(chat.answer).not.toHaveBeenCalled()
  })

  it('follows the bank when it changed since the delivery was stored, so the page and the list agree', async () => {
    const { svc, prisma, chat } = setup()
    const stale = { ...placementFromBank(CHAT_BANK)!, refs: ['1.1'], title: 'Old title' }
    prisma.assessmentDelivery.findFirst.mockResolvedValue({ ...standalone, config: stale })
    for (const call of [
      () => svc.view('u1', 'd1'),
      () => svc.answer('u1', 'd1', { ref: '2.2', sql: 'select 1' }),
      () => svc.run('u1', 'd1', { ref: '2.2', sql: 'select 1' }),
      () => svc.help('u1', 'd1', { ref: '2.2', sql: '', kind: 'hint' }),
    ])
      await call()
    for (const fn of [chat.view, chat.answer, chat.run, chat.help])
      expect((fn.mock.calls[0] as unknown[])[0]).toMatchObject({
        placement: { refs: ['1.1', '2.1', '2.2'], title: 'Orders desk' },
      })
    expect(prisma.assessmentDelivery.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { config: placementFromBank(CHAT_BANK) },
    })
    expect(chat.contextOf).not.toHaveBeenCalled()
  })

  it('refuses a delivery whose bank is no longer a chat', async () => {
    const { svc, prisma, chat } = setup()
    prisma.assessmentDelivery.findFirst.mockResolvedValue({
      ...standalone,
      label: 'standalone:quiz',
      assessment: PLAIN_BANK,
    })
    await expect(svc.view('u1', 'd1')).rejects.toThrow(NotFoundException)
    expect(chat.view).not.toHaveBeenCalled()
  })

  it('limits each learner per minute', async () => {
    const { svc, prisma } = setup()
    prisma.assessmentDelivery.findFirst.mockResolvedValue(standalone)
    for (let i = 0; i < 20; i++) await svc.help('u1', 'd1', { ref: '1.1', sql: '', kind: 'hint' })
    await expect(svc.help('u1', 'd1', { ref: '1.1', sql: '', kind: 'hint' })).rejects.toThrow(
      HttpException
    )
    await expect(svc.help('u2', 'd1', { ref: '1.1', sql: '', kind: 'hint' })).resolves.toBeDefined()
  })
})

describe('the routes', () => {
  it('take a signed-in Clerk learner only, never an LTI session', () => {
    const guards = Reflect.getMetadata('__guards__', StandaloneCheckpointController) as unknown[]
    expect(guards).toEqual([AuthenticatedGuard])
    expect(Reflect.getMetadata('path', StandaloneCheckpointController)).toBe('me/checkpoints')
  })
})
