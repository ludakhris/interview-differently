import { ForbiddenException } from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service'
import { LearnService } from './learn.service'

const findMany = jest.fn()
const prisma = { institution: { findMany } } as unknown as PrismaService
const service = new LearnService(prisma)

const delaware = {
  id: 'a1',
  name: 'Delaware DoL',
  kind: 'agency',
  subdomain: 'delaware',
  parentId: null,
}

describe('LearnService workspaces', () => {
  beforeEach(() => jest.clearAllMocks())

  it('gives agency admins every agency and the institutions under one', async () => {
    findMany.mockResolvedValue([delaware])
    await expect(service.workspaces('u1', 'agency-admin')).resolves.toEqual([delaware])
    expect(findMany.mock.calls[0][0].where).toEqual({
      subdomain: { not: null },
      OR: [{ kind: 'agency' }, { parent: { kind: 'agency' } }],
    })
  })

  it('limits everyone else to institutions they are a member of', async () => {
    findMany.mockResolvedValue([])
    await service.workspaces('u2', 'provider-admin')
    expect(findMany.mock.calls[0][0].where).toEqual({
      subdomain: { not: null },
      memberships: { some: { userId: 'u2' } },
    })
  })

  it('allows a workspace in the list and rejects one that is not', async () => {
    findMany.mockResolvedValue([delaware])
    await expect(service.assertWorkspace('u1', 'agency-admin', 'delaware')).resolves.toBeUndefined()
    await expect(service.assertWorkspace('u1', 'agency-admin', 'other')).rejects.toThrow(
      ForbiddenException
    )
  })
})
