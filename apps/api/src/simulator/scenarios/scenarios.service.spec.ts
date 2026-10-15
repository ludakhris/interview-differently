import { NotFoundException } from '@nestjs/common'
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
