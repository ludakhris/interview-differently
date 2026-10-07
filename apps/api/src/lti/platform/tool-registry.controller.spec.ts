import { ForbiddenException } from '@nestjs/common'
import { ToolRegistryController } from './tool-registry.controller'
import type { RegistrationService } from './registration.service'
import type { ToolRegistryService } from './tool-registry.service'

describe('ToolRegistryController', () => {
  const registration = { start: jest.fn(async () => ({ url: 'https://acme.example/r?x=1' })) }
  const registry = {
    list: jest.fn(async () => ({ tools: [], connections: [] })),
    whoIs: jest.fn(async () => ({ userId: 'u', userName: 'Boss' })),
    assertManage: (role?: string) => {
      if (role !== 'system-admin') throw new ForbiddenException('Only a system administrator')
    },
  }
  const controller = new ToolRegistryController(
    registry as unknown as ToolRegistryService,
    registration as unknown as RegistrationService
  )

  it('lists tools for a system administrator, with their connection settings', async () => {
    await expect(controller.list({ userId: 'u', userRole: 'system-admin' })).resolves.toEqual({
      tools: [],
      connections: [],
      canManage: true,
    })
  })

  it('shows nothing to anyone else: agency and provider admins, staff, learners', async () => {
    for (const userRole of ['agency-admin', 'provider-admin', 'case-manager', 'student', undefined])
      await expect(controller.list({ userId: 'u', userRole })).rejects.toThrow(ForbiddenException)
  })

  it('starts a registration for the signed-in admin and returns the link to open', async () => {
    await expect(
      controller.startRegistration(
        { userId: 'u', userRole: 'system-admin' },
        { initiationUrl: 'https://acme.example/r' }
      )
    ).resolves.toEqual({ url: 'https://acme.example/r?x=1' })
    expect(registration.start).toHaveBeenCalledWith(
      'system-admin',
      { userId: 'u', userName: 'Boss' },
      'https://acme.example/r'
    )
  })
})
