import { BadRequestException } from '@nestjs/common'
import { InstitutionsService } from './institutions.service'

function setup() {
  const prisma = {
    institution: {
      create: jest.fn(async (a: { data: object }) => a.data),
      update: jest.fn(async (a: { data: object }) => a.data),
      findUnique: jest.fn().mockResolvedValue({ id: 'standalone' }),
      upsert: jest.fn().mockResolvedValue({ id: 'standalone' }),
    },
  }
  return { prisma, svc: new InstitutionsService(prisma as never) }
}

describe('InstitutionsService input checks', () => {
  it.each([
    ['a number for name', { name: 42 }],
    ['a missing name', {}],
    ['an over-long name', { name: 'x'.repeat(501) }],
    ['an object for emailDomain', { name: 'Harbor', emailDomain: { a: 1 } }],
  ])('refuses %s on create with a 400', async (_n, body) => {
    const { svc, prisma } = setup()
    await expect(svc.create(body as never)).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.institution.create).not.toHaveBeenCalled()
  })

  it('refuses a non-text name on update with a 400', async () => {
    const { svc, prisma } = setup()
    await expect(svc.update('i1', { name: ['x'] } as never)).rejects.toBeInstanceOf(
      BadRequestException
    )
    expect(prisma.institution.update).not.toHaveBeenCalled()
  })

  it('still updates a valid name and domain', async () => {
    const { svc, prisma } = setup()
    await svc.update('i1', { name: ' Harbor ', emailDomain: '@Example.edu' })
    expect(prisma.institution.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { name: 'Harbor', emailDomain: 'example.edu' },
    })
  })
})
