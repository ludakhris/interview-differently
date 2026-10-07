import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { ClerkService } from '../auth/clerk.service'
import { AdminUsersService } from './admin-users.service'
import { LEARN_ROLE_ORDER, LEARN_ROLES, LearnService } from './learn.service'

const searchUsers = jest.fn()
const getUserSummary = jest.fn()
const setRole = jest.fn()
const clerk = { searchUsers, getUserSummary, setRole } as unknown as ClerkService
const service = new AdminUsersService(clerk, new LearnService({} as never))

const SYSADMIN = LEARN_ROLES.systemAdmin
const target = { id: 'u2', email: 'ann@example.com', displayName: 'Ann', role: 'agency-admin' }

describe('AdminUsersService', () => {
  beforeEach(() => jest.clearAllMocks())

  it('offers every role LEARN_ROLES defines, least access first', () => {
    const roles = service.roles(SYSADMIN)
    expect([...roles].sort()).toEqual(Object.values<string>(LEARN_ROLES).sort())
    expect(roles).toEqual(LEARN_ROLE_ORDER)
    expect(roles[roles.length - 1]).toBe(SYSADMIN)
  })

  it('ranks every role in LEARN_ROLE_ORDER (add new roles there too)', () => {
    expect([...LEARN_ROLE_ORDER].sort()).toEqual(Object.values<string>(LEARN_ROLES).sort())
  })

  it('refuses everyone but system admins', async () => {
    for (const role of [undefined, 'agency-admin', 'provider-admin', 'case-manager']) {
      expect(() => service.roles(role)).toThrow(ForbiddenException)
      expect(() => service.search(role, 'a')).toThrow(ForbiddenException)
      await expect(service.setRole('u1', role, 'u2', 'agency-admin')).rejects.toThrow(
        ForbiddenException
      )
    }
    expect(setRole).not.toHaveBeenCalled()
  })

  it('searches the LearnDifferently instance with a trimmed query', async () => {
    searchUsers.mockResolvedValue([target])
    await expect(service.search(SYSADMIN, '  ann ')).resolves.toEqual([target])
    expect(searchUsers).toHaveBeenCalledWith('ann', 'learn')
  })

  it('sets a known role on the LearnDifferently instance', async () => {
    getUserSummary.mockResolvedValue(target)
    const out = await service.setRole('u1', SYSADMIN, 'u2', SYSADMIN)
    expect(setRole).toHaveBeenCalledWith('u2', SYSADMIN, 'learn')
    expect(out.role).toBe(SYSADMIN)
  })

  it('clears the role with null', async () => {
    getUserSummary.mockResolvedValue(target)
    await service.setRole('u1', SYSADMIN, 'u2', null)
    expect(setRole).toHaveBeenCalledWith('u2', null, 'learn')
  })

  it('rejects a role LEARN_ROLES does not define', async () => {
    await expect(service.setRole('u1', SYSADMIN, 'u2', 'admin')).rejects.toThrow(
      BadRequestException
    )
    expect(setRole).not.toHaveBeenCalled()
  })

  it('will not change the caller’s own role', async () => {
    await expect(service.setRole('u1', SYSADMIN, 'u1', null)).rejects.toThrow(/own role/)
    expect(setRole).not.toHaveBeenCalled()
  })

  it('404s for a user Clerk does not know', async () => {
    getUserSummary.mockResolvedValue(null)
    await expect(service.setRole('u1', SYSADMIN, 'nope', null)).rejects.toThrow(NotFoundException)
    expect(setRole).not.toHaveBeenCalled()
  })
})
