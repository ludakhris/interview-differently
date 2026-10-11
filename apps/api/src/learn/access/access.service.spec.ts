import { ForbiddenException } from '@nestjs/common'
import { wasAuthorized, withTenantContext } from '../../core/tenant-context'
import type { PrismaService } from '../../prisma/prisma.service'
import { AccessService } from './access.service'
import { allows, highestRole, PERMISSIONS, ROLE_ORDER, ROLES, SYSTEM_ADMIN } from './permissions'

type M = {
  institutionId: string
  cohortId?: string | null
  role: string | null
  kind?: string
}

const INSTITUTIONS: Record<string, { id: string; parentId: string | null; kind: string }> = {
  agencyA: { id: 'agencyA', parentId: null, kind: 'agency' },
  provA: { id: 'provA', parentId: 'agencyA', kind: 'provider' },
  orgA: { id: 'orgA', parentId: 'agencyA', kind: 'organization' },
  agencyB: { id: 'agencyB', parentId: null, kind: 'agency' },
  provB: { id: 'provB', parentId: 'agencyB', kind: 'provider' },
}

let memberships: M[] = []

const prisma = {
  membership: {
    findMany: jest.fn(async () =>
      memberships.map((m) => ({
        institutionId: m.institutionId,
        cohortId: m.cohortId ?? null,
        role: m.role,
        institution: {
          kind: m.kind ?? INSTITUTIONS[m.institutionId].kind,
          parentId: INSTITUTIONS[m.institutionId].parentId,
          subdomain: m.institutionId,
        },
      }))
    ),
  },
  institution: {
    findFirst: jest.fn(async ({ where }: { where: { subdomain?: string; id?: string } }) => {
      const key = where.subdomain ?? where.id
      return key && INSTITUTIONS[key] ? INSTITUTIONS[key] : null
    }),
    findMany: jest.fn(async ({ where }: { where: { parentId: { in: string[] } } }) =>
      Object.values(INSTITUTIONS).filter((i) => where.parentId.in.includes(i.parentId ?? ''))
    ),
  },
  cohort: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      const host = where.id === 'c-prov' ? 'provA' : where.id === 'c-org' ? 'orgA' : null
      return host ? { institutionId: host, institution: { parentId: 'agencyA' } } : null
    }),
  },
}

const access = new AccessService(prisma as unknown as PrismaService)
const me = (role?: string) => ({ userId: 'u1', role })

beforeEach(() => {
  memberships = []
})

describe('permissions', () => {
  it('rank every role, and no role is only in the table', () => {
    const used = new Set(Object.values(PERMISSIONS).flatMap((r) => [...r]))
    for (const r of used) expect(ROLE_ORDER).toContain(r)
    expect(Object.values(ROLES).sort()).toEqual([...ROLE_ORDER].sort())
  })

  it('gives organization admins the same actions as provider admins', () => {
    for (const action of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[])
      expect(allows([ROLES.organizationAdmin], action)).toBe(allows([ROLES.providerAdmin], action))
  })

  it('keeps participant records to provider and organization admins', () => {
    expect(allows([ROLES.agencyAdmin], 'participant.records')).toBe(false)
    expect(allows([ROLES.caseManager], 'participant.records')).toBe(false)
    expect(allows([ROLES.instructor], 'participant.records')).toBe(false)
    expect(allows([ROLES.providerAdmin], 'participant.records')).toBe(true)
  })

  it('lets only the platform administrator do platform administration', () => {
    for (const r of ROLE_ORDER) expect(allows([r], 'platform.admin')).toBe(false)
  })

  it('picks the highest role', () => {
    expect(highestRole([ROLES.instructor, ROLES.providerAdmin])).toBe(ROLES.providerAdmin)
    expect(highestRole([])).toBeUndefined()
  })
})

describe('authorize', () => {
  it('lets the platform administrator do everything, anywhere', async () => {
    await access.authorize(me(SYSTEM_ADMIN), 'platform.admin', { workspace: 'provA' })
    await access.authorize(me(SYSTEM_ADMIN), 'course.manage', { workspace: 'provB' })
  })

  it('refuses platform administration to everyone else', async () => {
    memberships = [{ institutionId: 'agencyA', role: ROLES.agencyAdmin }]
    await expect(
      access.authorize(me(), 'platform.admin', { workspace: 'agencyA' })
    ).rejects.toThrow('Insufficient role')
  })

  it('uses the role held at the workspace, and no other', async () => {
    memberships = [{ institutionId: 'provA', role: ROLES.providerAdmin }]
    await access.authorize(me(), 'course.manage', { workspace: 'provA' })
    await access.authorize(me(), 'participant.records', { institutionId: 'provA' })
    await expect(access.authorize(me(), 'course.manage', { workspace: 'provB' })).rejects.toThrow(
      'No access to this workspace'
    )
    await expect(access.authorize(me(), 'course.manage', { workspace: 'orgA' })).rejects.toThrow(
      'No access to this workspace'
    )
  })

  it('says the role is not enough when the person is in the workspace', async () => {
    memberships = [{ institutionId: 'provA', role: ROLES.caseManager }]
    await access.authorize(me(), 'outcomes.read', { workspace: 'provA' })
    await expect(access.authorize(me(), 'course.manage', { workspace: 'provA' })).rejects.toThrow(
      'Insufficient role'
    )
  })

  it('covers what reports to an agency for an agency admin only', async () => {
    memberships = [{ institutionId: 'agencyA', role: ROLES.agencyAdmin }]
    await access.authorize(me(), 'cohort.manage', { workspace: 'provA' })
    await access.authorize(me(), 'cohort.manage', { workspace: 'orgA' })
    await expect(access.authorize(me(), 'cohort.manage', { workspace: 'provB' })).rejects.toThrow(
      ForbiddenException
    )
    // a case manager at the agency does not reach down
    memberships = [{ institutionId: 'agencyA', role: ROLES.caseManager }]
    await expect(access.authorize(me(), 'outcomes.read', { workspace: 'provA' })).rejects.toThrow(
      ForbiddenException
    )
  })

  it('keeps agency admins out of participant records', async () => {
    memberships = [{ institutionId: 'agencyA', role: ROLES.agencyAdmin }]
    await expect(
      access.authorize(me(), 'participant.records', { institutionId: 'provA' })
    ).rejects.toThrow('Insufficient role')
  })

  it('answers an unknown workspace like one the person may not open', async () => {
    memberships = [{ institutionId: 'provA', role: ROLES.providerAdmin }]
    await expect(
      access.authorize(me(), 'workspace.open', { workspace: 'nowhere' })
    ).rejects.toThrow('No access to this workspace')
  })

  it('refuses a role that could never do this before looking anything up, so ids are not probed', async () => {
    memberships = [{ institutionId: 'provA', role: ROLES.caseManager }]
    prisma.cohort.findUnique.mockClear()
    await expect(access.authorize(me(), 'cohort.manage', { cohortId: 'nope' })).rejects.toThrow(
      'Insufficient role'
    )
    await expect(access.authorize(me(), 'cohort.manage', { cohortId: 'c-prov' })).rejects.toThrow(
      'Insufficient role'
    )
    expect(prisma.cohort.findUnique).not.toHaveBeenCalled()
    memberships = []
    await expect(access.authorize(me(), 'cohort.read', { cohortId: 'nope' })).rejects.toThrow(
      'Insufficient role'
    )
  })

  it('keeps participant records to providers and organizations, not colleges or agencies', async () => {
    memberships = [{ institutionId: 'provA', role: ROLES.organizationAdmin }]
    INSTITUTIONS.provA.kind = 'academic'
    try {
      await expect(
        access.authorize(me(), 'participant.records', { institutionId: 'provA' })
      ).rejects.toThrow('No access to this provider')
      await access.authorize(me(), 'course.manage', { institutionId: 'provA' })
    } finally {
      INSTITUTIONS.provA.kind = 'provider'
    }
  })

  it('does not make an instructor workspace-wide when their cohort is gone', async () => {
    memberships = [{ institutionId: 'provA', cohortId: null, role: ROLES.instructor }]
    await expect(access.authorize(me(), 'workspace.open', { workspace: 'provA' })).rejects.toThrow(
      ForbiddenException
    )
    await expect(access.authorize(me(), 'cohort.staff', { cohortId: 'c-prov' })).rejects.toThrow(
      ForbiddenException
    )
    expect(await access.workspaceRoles(me())).toEqual([])
  })

  it('lets an instructor open and list a workspace but not do cohort work there without naming the cohort', async () => {
    memberships = [{ institutionId: 'provA', cohortId: 'c-prov', role: ROLES.instructor }]
    await access.authorize(me(), 'cohort.read', { workspace: 'provA' })
    await access.authorize(me(), 'gradebook.read', { workspace: 'provA' })
    await expect(access.authorize(me(), 'cohort.staff', { workspace: 'provA' })).rejects.toThrow(
      'Insufficient role'
    )
  })

  it('gives an instructor their own cohort and nothing wider', async () => {
    memberships = [{ institutionId: 'provA', cohortId: 'c-prov', role: ROLES.instructor }]
    await access.authorize(me(), 'cohort.staff', { cohortId: 'c-prov' })
    await access.authorize(me(), 'gradebook.read', { cohortId: 'c-prov' })
    await access.authorize(me(), 'workspace.open', { workspace: 'provA' })
    await expect(access.authorize(me(), 'cohort.manage', { cohortId: 'c-prov' })).rejects.toThrow(
      'Insufficient role'
    )
    await expect(access.authorize(me(), 'cohort.staff', { cohortId: 'c-org' })).rejects.toThrow(
      ForbiddenException
    )
    await expect(access.authorize(me(), 'workspace.open', { workspace: 'orgA' })).rejects.toThrow(
      ForbiddenException
    )
  })

  it('ignores a learner’s own membership', async () => {
    memberships = [{ institutionId: 'provA', cohortId: 'c-prov', role: null }]
    await expect(access.authorize(me(), 'cohort.staff', { cohortId: 'c-prov' })).rejects.toThrow(
      ForbiddenException
    )
  })

  it('records the check for the interceptor', async () => {
    memberships = [{ institutionId: 'provA', role: ROLES.providerAdmin }]
    await withTenantContext(async () => {
      expect(wasAuthorized('course.manage')).toBe(false)
      await access.authorize(me(), 'course.manage', { workspace: 'provA' })
      expect(wasAuthorized('course.manage')).toBe(true)
      expect(wasAuthorized('cohort.manage')).toBe(false)
    })
  })

  it('records nothing when refused', async () => {
    await withTenantContext(async () => {
      await access.authorize(me(), 'course.manage', { workspace: 'provA' }).catch(() => undefined)
      expect(wasAuthorized('course.manage')).toBe(false)
    })
  })
})

describe('workspaceRoles and instructorCohortsIn', () => {
  it('lists an agency admin’s agency and what reports to it, each with the role', async () => {
    memberships = [{ institutionId: 'agencyA', role: ROLES.agencyAdmin }]
    const list = await access.workspaceRoles(me())
    expect(list.map((w) => w.institutionId).sort()).toEqual(['agencyA', 'orgA', 'provA'])
    expect(list.every((w) => w.role === ROLES.agencyAdmin)).toBe(true)
  })

  it('lists only where someone holds a role', async () => {
    memberships = [
      { institutionId: 'provA', role: ROLES.providerAdmin },
      { institutionId: 'orgA', cohortId: 'c-org', role: null },
    ]
    expect(await access.workspaceRoles(me())).toEqual([
      { institutionId: 'provA', role: ROLES.providerAdmin },
    ])
  })

  it('lists the workspace of an instructor', async () => {
    memberships = [{ institutionId: 'orgA', cohortId: 'c-org', role: ROLES.instructor }]
    expect(await access.workspaceRoles(me())).toEqual([
      { institutionId: 'orgA', role: ROLES.instructor },
    ])
  })

  it('narrows an instructor to their cohorts, and nobody else', async () => {
    memberships = [{ institutionId: 'orgA', cohortId: 'c-org', role: ROLES.instructor }]
    expect(await access.instructorCohortsIn(me(), 'orgA')).toEqual(['c-org'])
    memberships = [{ institutionId: 'orgA', role: ROLES.organizationAdmin }]
    expect(await access.instructorCohortsIn(me(), 'orgA')).toBeNull()
    expect(await access.instructorCohortsIn(me(SYSTEM_ADMIN), 'orgA')).toBeNull()
  })

  it('narrows to their cohorts someone who is an instructor and also a role that cannot read cohorts', async () => {
    memberships = [
      { institutionId: 'orgA', role: ROLES.caseManager },
      { institutionId: 'orgA', cohortId: 'c-org', role: ROLES.instructor },
    ]
    expect(await access.instructorCohortsIn(me(), 'orgA')).toEqual(['c-org'])
  })

  it('narrows to their cohorts someone who is an instructor and also holds a role that cannot read cohorts', async () => {
    memberships = [
      { institutionId: 'orgA', role: ROLES.caseManager },
      { institutionId: 'orgA', cohortId: 'c-org', role: ROLES.instructor },
    ]
    expect(await access.instructorCohortsIn(me(), 'orgA')).toEqual(['c-org'])
  })
})
