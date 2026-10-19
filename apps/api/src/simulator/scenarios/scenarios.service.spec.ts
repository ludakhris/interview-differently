import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ScenariosService } from './scenarios.service'

const svc = (row: unknown) =>
  new ScenariosService({ scenario: { findUnique: jest.fn().mockResolvedValue(row) } } as never)

describe('ScenariosService.findForLti', () => {
  it('returns a published scenario of any owner', async () => {
    const row = { scenarioId: 'S1', status: 'published', data: { title: 'T' }, institution: null }
    await expect(svc(row).findForLti('S1')).resolves.toMatchObject({ title: 'T' })
  })

  it.each([['draft'], ['archived'], [undefined]])('404s status %p', async (status) => {
    const row = { scenarioId: 'S1', status, data: {}, institution: null }
    await expect(svc(row).findForLti('S1')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('404s an unknown scenario', async () => {
    await expect(svc(null).findForLti('S1')).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('ScenariosService request bodies', () => {
  it('refuses a scenario body the API cannot read with a 400', async () => {
    const prisma = { scenario: { create: jest.fn(), update: jest.fn() } }
    const s = new ScenariosService(prisma as never)
    const bad = (p: Promise<unknown>) => expect(p).rejects.toBeInstanceOf(BadRequestException)
    await bad(s.create([] as never, null))
    await bad(s.create({ scenarioId: 5 }, null))
    await bad(s.create({ scenarioId: 'x'.repeat(201) }, null))
    await bad(s.create({ scenarioId: 'S1', builderMeta: 'draft' }, null))
    await bad(s.update('S1', { builderMeta: { status: 'live' } }))
    expect(prisma.scenario.create).not.toHaveBeenCalled()
    expect(prisma.scenario.update).not.toHaveBeenCalled()
  })
})
