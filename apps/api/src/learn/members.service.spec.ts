import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import type { ClerkService } from '../auth/clerk.service'
import type { PrismaService } from '../prisma/prisma.service'
import { AccessService } from './access/access.service'
import { ROLES, SYSTEM_ADMIN } from './access/permissions'
import { MembersService } from './members.service'

const WORKSPACES: Record<
  string,
  { id: string; name: string; kind: string; parentId: string | null }
> = {
  delaware: { id: 'agencyA', name: 'Delaware', kind: 'agency', parentId: null },
  harbor: { id: 'provA', name: 'Harbor', kind: 'provider', parentId: 'agencyA' },
  wilmington: { id: 'orgA', name: 'Wilmington', kind: 'organization', parentId: 'agencyA' },
}

let actorMemberships: { institutionId: string; role: string }[] = []

const prisma = {
  institution: {
    findFirst: jest.fn(async ({ where }: { where: { subdomain?: string; id?: string } }) => {
      const found = Object.entries(WORKSPACES).find(
        ([sub, w]) => sub === where.subdomain || w.id === where.id
      )
      return found ? found[1] : null
    }),
    findMany: jest.fn(async () => []),
  },
  membership: {
    findMany: jest.fn(async (args: { where: { userId?: string; institutionId?: string } }) => {
      if (args.where.userId)
        return actorMemberships.map((m) => ({
          ...m,
          cohortId: null,
          institution: {
            kind: Object.values(WORKSPACES).find((w) => w.id === m.institutionId)?.kind,
            parentId: Object.values(WORKSPACES).find((w) => w.id === m.institutionId)?.parentId,
            subdomain: null,
          },
        }))
      return [
        {
          id: 'mem1',
          userId: 'u9',
          role: 'instructor',
          user: { displayName: 'Ina', email: 'ina@example.test' },
          cohort: { id: 'c1', name: 'Fall' },
        },
      ]
    }),
    findFirst: jest.fn(),
    create: jest.fn(async ({ data }: { data: { role: string } }) => ({ id: 'new', ...data })),
    update: jest.fn(async ({ data }: { data: { role: string } }) => ({ id: 'old', ...data })),
    delete: jest.fn(),
  },
  cohort: { findFirst: jest.fn() },
  user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
  roleInvite: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
}
const clerk = { getVerifiedEmail: jest.fn(), getUserProfile: jest.fn() }
const service = new MembersService(
  prisma as unknown as PrismaService,
  new AccessService(prisma as unknown as PrismaService),
  clerk as unknown as ClerkService
)
const asAgencyAdmin = () => {
  actorMemberships = [{ institutionId: 'agencyA', role: ROLES.agencyAdmin }]
  return { userId: 'actor' }
}
const asProviderAdmin = () => {
  actorMemberships = [{ institutionId: 'provA', role: ROLES.providerAdmin }]
  return { userId: 'actor' }
}

beforeEach(() => {
  jest.clearAllMocks()
  actorMemberships = []
  prisma.user.findFirst.mockResolvedValue({
    id: 'u9',
    displayName: 'Ina',
    email: 'ina@example.test',
  })
  prisma.membership.findFirst.mockResolvedValue(null)
  prisma.cohort.findFirst.mockResolvedValue({ id: 'c1' })
  prisma.roleInvite.findMany.mockResolvedValue([])
})

describe('listing', () => {
  it('shows members and what the caller may give, to those who manage members', async () => {
    const out = await service.list(asAgencyAdmin(), 'harbor')
    expect(out.members).toEqual([
      expect.objectContaining({
        userId: 'u9',
        role: 'instructor',
        cohort: { id: 'c1', name: 'Fall' },
      }),
    ])
    expect(out.grantable).toContain(ROLES.providerAdmin)
  })

  it('refuses case managers, instructors and people with no role', async () => {
    for (const role of [ROLES.caseManager, ROLES.instructor]) {
      actorMemberships = [{ institutionId: 'provA', role }]
      await expect(service.list({ userId: 'actor' }, 'harbor')).rejects.toThrow(ForbiddenException)
    }
    actorMemberships = []
    await expect(service.list({ userId: 'actor' }, 'harbor')).rejects.toThrow(ForbiddenException)
  })

  it('lists nothing at a workspace that does not exist', async () => {
    await expect(service.list(asAgencyAdmin(), 'nowhere')).rejects.toThrow(ForbiddenException)
  })
})

describe('what can be given at each kind of workspace', () => {
  it('offers only roles that can be held there', async () => {
    expect((await service.list(asAgencyAdmin(), 'delaware')).grantable.sort()).toEqual(
      [ROLES.agencyAdmin, ROLES.caseManager].sort()
    )
    expect((await service.list(asAgencyAdmin(), 'harbor')).grantable.sort()).toEqual(
      [ROLES.providerAdmin, ROLES.caseManager, ROLES.instructor].sort()
    )
    expect((await service.list(asAgencyAdmin(), 'wilmington')).grantable.sort()).toEqual(
      [ROLES.organizationAdmin, ROLES.caseManager, ROLES.instructor].sort()
    )
  })
})

describe('giving a role', () => {
  it('lets an agency admin make a provider admin for a provider that reports to them', async () => {
    const out = await service.grant(asAgencyAdmin(), 'harbor', {
      email: ' Ina@Example.test ',
      role: ROLES.providerAdmin,
    })
    expect(out).toMatchObject({ status: 'added', member: { role: ROLES.providerAdmin } })
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'ina@example.test', source: 'learn' } })
    )
    expect(prisma.membership.create).toHaveBeenCalledWith({
      data: { userId: 'u9', institutionId: 'provA', cohortId: null, role: ROLES.providerAdmin },
    })
  })

  it('uses the row a simultaneous grant made, instead of failing or making a second', async () => {
    prisma.membership.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'theirs' })
    prisma.membership.create.mockRejectedValueOnce(
      Object.assign(new Error('unique'), { code: 'P2002' })
    )
    await service.grant(asAgencyAdmin(), 'harbor', {
      email: 'ina@example.test',
      role: ROLES.caseManager,
    })
    expect(prisma.membership.update).toHaveBeenCalledWith({
      where: { id: 'theirs' },
      data: { role: ROLES.caseManager },
    })
  })

  it('changes the role of someone who already has one here', async () => {
    prisma.membership.findFirst.mockResolvedValue({ id: 'old' })
    await service.grant(asAgencyAdmin(), 'harbor', {
      email: 'ina@example.test',
      role: ROLES.caseManager,
    })
    expect(prisma.membership.update).toHaveBeenCalled()
    expect(prisma.membership.create).not.toHaveBeenCalled()
  })

  it('never lets a provider admin give the agency admin role, at their provider or anywhere', async () => {
    await expect(
      service.grant(asProviderAdmin(), 'harbor', { email: 'a@b.test', role: ROLES.agencyAdmin })
    ).rejects.toThrow(BadRequestException)
    await expect(
      service.grant(asProviderAdmin(), 'delaware', { email: 'a@b.test', role: ROLES.agencyAdmin })
    ).rejects.toThrow(ForbiddenException)
    expect(prisma.membership.create).not.toHaveBeenCalled()
  })

  it('refuses a role at the wrong kind of workspace', async () => {
    await expect(
      service.grant(asAgencyAdmin(), 'wilmington', { email: 'a@b.test', role: ROLES.providerAdmin })
    ).rejects.toThrow(BadRequestException)
    await expect(
      service.grant(asAgencyAdmin(), 'harbor', { email: 'a@b.test', role: ROLES.organizationAdmin })
    ).rejects.toThrow(BadRequestException)
    await expect(
      service.grant(asAgencyAdmin(), 'harbor', { email: 'a@b.test', role: ROLES.agencyAdmin })
    ).rejects.toThrow(BadRequestException)
  })

  it('needs a cohort of this workspace for an instructor, and only for an instructor', async () => {
    await expect(
      service.grant(asProviderAdmin(), 'harbor', { email: 'a@b.test', role: ROLES.instructor })
    ).rejects.toThrow(/cohort/)
    prisma.cohort.findFirst.mockResolvedValue(null)
    await expect(
      service.grant(asProviderAdmin(), 'harbor', {
        email: 'a@b.test',
        role: ROLES.instructor,
        cohortId: 'x',
      })
    ).rejects.toThrow(NotFoundException)
    prisma.cohort.findFirst.mockResolvedValue({ id: 'c1' })
    await service.grant(asProviderAdmin(), 'harbor', {
      email: 'a@b.test',
      role: ROLES.instructor,
      cohortId: 'c1',
    })
    expect(prisma.membership.create).toHaveBeenCalledWith({
      data: { userId: 'u9', institutionId: 'provA', cohortId: 'c1', role: ROLES.instructor },
    })
    await expect(
      service.grant(asProviderAdmin(), 'harbor', {
        email: 'a@b.test',
        role: ROLES.caseManager,
        cohortId: 'c1',
      })
    ).rejects.toThrow(/Only an instructor/)
  })

  it('keeps the role for an email with no account yet, as an invitation', async () => {
    prisma.user.findFirst.mockResolvedValue(null)
    prisma.roleInvite.findFirst.mockResolvedValue(null)
    prisma.roleInvite.create.mockResolvedValue({
      id: 'inv1',
      email: 'new@b.test',
      role: ROLES.caseManager,
      cohort: null,
      createdAt: new Date('2026-10-11T00:00:00Z'),
    })
    const out = await service.grant(asAgencyAdmin(), 'harbor', {
      email: ' New@B.test ',
      role: ROLES.caseManager,
    })
    expect(out).toMatchObject({
      status: 'invited',
      invite: { inviteId: 'inv1', email: 'new@b.test' },
    })
    expect(prisma.roleInvite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          email: 'new@b.test',
          institutionId: 'provA',
          cohortId: null,
          role: ROLES.caseManager,
          invitedById: 'actor',
        },
      })
    )
    expect(prisma.membership.create).not.toHaveBeenCalled()
  })

  it('applies the same rules to an invitation: role, workspace kind and cohort', async () => {
    prisma.user.findFirst.mockResolvedValue(null)
    await expect(
      service.grant(asProviderAdmin(), 'harbor', { email: 'a@b.test', role: ROLES.agencyAdmin })
    ).rejects.toThrow(BadRequestException)
    await expect(
      service.grant(asProviderAdmin(), 'harbor', { email: 'a@b.test', role: ROLES.instructor })
    ).rejects.toThrow(/cohort/)
    expect(prisma.roleInvite.create).not.toHaveBeenCalled()
  })

  it('changes the role of an existing invitation instead of making a second', async () => {
    prisma.user.findFirst.mockResolvedValue(null)
    prisma.roleInvite.findFirst.mockResolvedValue({ id: 'inv1' })
    prisma.roleInvite.update.mockResolvedValue({
      id: 'inv1',
      email: 'new@b.test',
      role: ROLES.providerAdmin,
      cohort: null,
      createdAt: new Date(),
    })
    await service.grant(asAgencyAdmin(), 'harbor', {
      email: 'new@b.test',
      role: ROLES.providerAdmin,
    })
    expect(prisma.roleInvite.update).toHaveBeenCalled()
    expect(prisma.roleInvite.create).not.toHaveBeenCalled()
  })

  it('will not let you change your own access', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'actor', displayName: 'Me', email: 'me@b.test' })
    await expect(
      service.grant(asAgencyAdmin(), 'harbor', { email: 'me@b.test', role: ROLES.caseManager })
    ).rejects.toThrow(ConflictException)
  })

  it('lets the platform administrator give any role at the right kind of place', async () => {
    const out = await service.grant({ userId: 'root', role: SYSTEM_ADMIN }, 'delaware', {
      email: 'a@b.test',
      role: ROLES.agencyAdmin,
    })
    expect(out).toMatchObject({ status: 'added', member: { role: ROLES.agencyAdmin } })
  })

  it('rejects an unknown role and a missing email', async () => {
    await expect(
      service.grant(asAgencyAdmin(), 'harbor', { email: 'a@b.test', role: 'boss' })
    ).rejects.toThrow(BadRequestException)
    await expect(
      service.grant(asAgencyAdmin(), 'harbor', { role: ROLES.caseManager })
    ).rejects.toThrow(/email/)
  })
})

describe('taking a role away', () => {
  it('removes a role the caller may give, at this workspace', async () => {
    prisma.membership.findFirst.mockResolvedValue({
      id: 'mem1',
      userId: 'u9',
      role: ROLES.caseManager,
    })
    await service.revoke(asProviderAdmin(), 'harbor', 'mem1')
    expect(prisma.membership.delete).toHaveBeenCalledWith({ where: { id: 'mem1' } })
  })

  it('keeps a person’s own cohort membership and only takes the role off it', async () => {
    prisma.membership.findFirst.mockResolvedValue({
      id: 'mem3',
      userId: 'u9',
      role: ROLES.instructor,
      cohortId: 'c1',
    })
    await service.revoke(asProviderAdmin(), 'harbor', 'mem3')
    expect(prisma.membership.update).toHaveBeenCalledWith({
      where: { id: 'mem3' },
      data: { role: null },
    })
    expect(prisma.membership.delete).not.toHaveBeenCalled()
  })

  it('refuses a role the caller could not give, and their own', async () => {
    prisma.membership.findFirst.mockResolvedValue({
      id: 'mem1',
      userId: 'u9',
      role: ROLES.agencyAdmin,
    })
    await expect(service.revoke(asProviderAdmin(), 'harbor', 'mem1')).rejects.toThrow(
      ForbiddenException
    )
    prisma.membership.findFirst.mockResolvedValue({
      id: 'mem2',
      userId: 'actor',
      role: ROLES.caseManager,
    })
    await expect(service.revoke(asProviderAdmin(), 'harbor', 'mem2')).rejects.toThrow(
      ConflictException
    )
    expect(prisma.membership.delete).not.toHaveBeenCalled()
  })

  it('404s for a membership that is not a role here', async () => {
    await expect(service.revoke(asProviderAdmin(), 'harbor', 'nope')).rejects.toThrow(
      NotFoundException
    )
  })
})

describe('invitations', () => {
  it('are listed with the members, and withdrawn by someone who could have given them', async () => {
    prisma.roleInvite.findMany.mockResolvedValue([
      {
        id: 'inv1',
        email: 'a@b.test',
        role: ROLES.caseManager,
        createdAt: new Date(),
        cohort: null,
      },
    ])
    const out = await service.list(asProviderAdmin(), 'harbor')
    expect(out.invites).toEqual([expect.objectContaining({ inviteId: 'inv1', email: 'a@b.test' })])
    prisma.roleInvite.findFirst.mockResolvedValue({ id: 'inv1', role: ROLES.caseManager })
    await service.revokeInvite(asProviderAdmin(), 'harbor', 'inv1')
    expect(prisma.roleInvite.delete).toHaveBeenCalledWith({ where: { id: 'inv1' } })
    prisma.roleInvite.findFirst.mockResolvedValue({ id: 'inv2', role: ROLES.agencyAdmin })
    await expect(service.revokeInvite(asProviderAdmin(), 'harbor', 'inv2')).rejects.toThrow(
      ForbiddenException
    )
  })

  describe('claimed when the person first opens the app', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(null)
      prisma.user.create.mockResolvedValue({})
      clerk.getUserProfile.mockResolvedValue({ displayName: 'Nia' })
    })

    it('asks nothing of Clerk while there are no invitations at all', async () => {
      prisma.roleInvite.count.mockResolvedValue(0)
      await service.claimFor('u-new')
      expect(clerk.getVerifiedEmail).not.toHaveBeenCalled()
    })

    it('does nothing for an address Clerk has not verified', async () => {
      prisma.roleInvite.count.mockResolvedValue(3)
      clerk.getVerifiedEmail.mockResolvedValue(null)
      await service.claimFor('u-new')
      expect(prisma.roleInvite.findMany).not.toHaveBeenCalled()
      expect(prisma.membership.create).not.toHaveBeenCalled()
    })

    it('turns the invitations for the verified address into roles, makes the account row, and removes them', async () => {
      prisma.roleInvite.count.mockResolvedValue(2)
      clerk.getVerifiedEmail.mockResolvedValue('new@b.test')
      prisma.roleInvite.findMany.mockResolvedValue([
        { id: 'i1', institutionId: 'provA', cohortId: null, role: ROLES.providerAdmin },
        { id: 'i2', institutionId: 'orgA', cohortId: 'c1', role: ROLES.instructor },
      ])
      await service.claimFor('u-new')
      expect(prisma.roleInvite.findMany).toHaveBeenCalledWith({ where: { email: 'new@b.test' } })
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { id: 'u-new', source: 'learn', email: 'new@b.test', displayName: 'Nia' },
      })
      expect(prisma.membership.create).toHaveBeenCalledWith({
        data: {
          userId: 'u-new',
          institutionId: 'provA',
          cohortId: null,
          role: ROLES.providerAdmin,
        },
      })
      expect(prisma.membership.create).toHaveBeenCalledWith({
        data: { userId: 'u-new', institutionId: 'orgA', cohortId: 'c1', role: ROLES.instructor },
      })
      expect(prisma.roleInvite.deleteMany).toHaveBeenCalledWith({ where: { id: 'i1' } })
      expect(prisma.roleInvite.deleteMany).toHaveBeenCalledWith({ where: { id: 'i2' } })
    })

    it('does nothing when the address has no invitation', async () => {
      prisma.roleInvite.count.mockResolvedValue(2)
      clerk.getVerifiedEmail.mockResolvedValue('other@b.test')
      prisma.roleInvite.findMany.mockResolvedValue([])
      await service.claimFor('u-other')
      expect(prisma.user.create).not.toHaveBeenCalled()
      expect(prisma.membership.create).not.toHaveBeenCalled()
    })
  })
})
