import { BadRequestException } from '@nestjs/common'
import { PlatformConfigService } from './platform-config.service'

function setup() {
  const prisma = { platformConfig: { upsert: jest.fn(), findUnique: jest.fn() } }
  return { prisma, svc: new PlatformConfigService(prisma as never) }
}

describe('PlatformConfigService.set', () => {
  it.each([
    ['an unknown key', 'anything', 'true'],
    ['a non-text key', 5, 'true'],
    ['a non-boolean value', 'ai_feedback_enabled', 'yes'],
    ['a value of the wrong type', 'ai_feedback_enabled', true],
  ])('refuses %s with a 400', async (_n, key, value) => {
    const { svc, prisma } = setup()
    await expect(svc.set(key, value)).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.platformConfig.upsert).not.toHaveBeenCalled()
  })

  it('saves a known switch', async () => {
    const { svc, prisma } = setup()
    await svc.set('ai_feedback_enabled', 'false')
    expect(prisma.platformConfig.upsert).toHaveBeenCalledWith({
      where: { key: 'ai_feedback_enabled' },
      update: { value: 'false' },
      create: { key: 'ai_feedback_enabled', value: 'false' },
    })
  })
})
