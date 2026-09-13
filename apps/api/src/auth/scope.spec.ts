import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { InstitutionScope, type AdminRequest } from './scope'
import type { PrismaService } from '../prisma/prisma.service'

const prisma = {
  cohort: { findUnique: jest.fn() },
  assessmentDelivery: { findUnique: jest.fn() },
} as unknown as PrismaService

const scope = new InstitutionScope(prisma)
const full: AdminRequest = { userId: 'u1', userRole: 'admin' }
const inst: AdminRequest = { userId: 'u2', userRole: 'institution-admin', institutionIds: ['i1'] }

describe('InstitutionScope', () => {
  beforeEach(() => jest.clearAllMocks())

  it('full admin sees everything and passes every check', async () => {
    expect(scope.visible(full)).toBeNull()
    expect(() => scope.assertInstitution(full, 'other')).not.toThrow()
    await expect(scope.assertCohort(full, 'c9')).resolves.toBeUndefined()
    expect((prisma.cohort.findUnique as jest.Mock).mock.calls).toHaveLength(0)
  })

  it('institution-admin is limited to their membership institutions', () => {
    expect(scope.visible(inst)).toEqual(['i1'])
    expect(() => scope.assertInstitution(inst, 'i1')).not.toThrow()
    expect(() => scope.assertInstitution(inst, 'i2')).toThrow(ForbiddenException)
  })

  it('cohort checks resolve the parent institution', async () => {
    ;(prisma.cohort.findUnique as jest.Mock).mockResolvedValueOnce({ institutionId: 'i1' })
    await expect(scope.assertCohort(inst, 'c1')).resolves.toBeUndefined()
    ;(prisma.cohort.findUnique as jest.Mock).mockResolvedValueOnce({ institutionId: 'i2' })
    await expect(scope.assertCohort(inst, 'c2')).rejects.toThrow(ForbiddenException)
    ;(prisma.cohort.findUnique as jest.Mock).mockResolvedValueOnce(null)
    await expect(scope.assertCohort(inst, 'c3')).rejects.toThrow(NotFoundException)
  })

  it('delivery checks resolve through the cohort', async () => {
    ;(prisma.assessmentDelivery.findUnique as jest.Mock).mockResolvedValueOnce({ cohort: { institutionId: 'i2' } })
    await expect(scope.assertDelivery(inst, 'd1')).rejects.toThrow(ForbiddenException)
  })

  describe('owned content', () => {
    const multi: AdminRequest = { userId: 'u3', userRole: 'institution-admin', institutionIds: ['i1', 'i2'] }

    it('platform content is readable by all, editable by full admins only', () => {
      expect(scope.contentWhere(full)).toBeUndefined()
      expect(scope.contentWhere(inst)).toEqual({ OR: [{ institutionId: null }, { institutionId: { in: ['i1'] } }] })
      expect(() => scope.assertReadable(inst, null)).not.toThrow()
      expect(() => scope.assertOwns(full, null)).not.toThrow()
      expect(() => scope.assertOwns(inst, null)).toThrow(ForbiddenException)
      expect(() => scope.assertOwns(inst, 'i1')).not.toThrow()
      expect(() => scope.assertOwns(inst, 'i2')).toThrow(ForbiddenException)
    })

    it('ownerFor: full admin defaults to platform, institution-admin to their only institution', () => {
      expect(scope.ownerFor(full, undefined)).toBeNull()
      expect(scope.ownerFor(full, 'i9')).toBe('i9')
      expect(scope.ownerFor(inst, undefined)).toBe('i1')
      expect(scope.ownerFor(inst, 'i1')).toBe('i1')
      expect(() => scope.ownerFor(inst, 'i2')).toThrow(ForbiddenException)
      expect(() => scope.ownerFor(multi, undefined)).toThrow(BadRequestException)
      expect(scope.ownerFor(multi, 'i2')).toBe('i2')
    })
  })
})
