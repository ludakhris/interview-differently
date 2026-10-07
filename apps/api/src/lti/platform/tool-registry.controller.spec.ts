import { ForbiddenException } from '@nestjs/common'
import { ToolRegistryController } from './tool-registry.controller'
import type { ToolRegistryService } from './tool-registry.service'

describe('ToolRegistryController', () => {
  const registry = {
    list: jest.fn(async () => ({ tools: [], connections: [] })),
    assertManage: (role?: string) => {
      if (role !== 'system-admin') throw new ForbiddenException('Only a system administrator')
    },
  }
  const controller = new ToolRegistryController(registry as unknown as ToolRegistryService)

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
})
