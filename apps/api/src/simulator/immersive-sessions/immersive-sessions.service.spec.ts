import { ImmersiveSessionsService } from './immersive-sessions.service'

function setup() {
  const prisma = {
    immersiveSession: {
      create: jest.fn((a: unknown) => ({ op: 'create', a })),
      updateMany: jest.fn((a: unknown) => ({ op: 'updateMany', a })),
    },
    $transaction: jest.fn(async (ops: unknown[]) => [{ count: 1 }, { id: 'new' }, ops.length]),
  }
  return { prisma, svc: new ImmersiveSessionsService(prisma as never, {} as never, {} as never) }
}

describe('ImmersiveSessionsService.createSession', () => {
  it("abandons the same user's other active sessions for the scenario in one transaction", async () => {
    const { prisma, svc } = setup()
    expect(await svc.createSession('S1', 'u1', true)).toEqual({ id: 'new' })
    expect(prisma.immersiveSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', scenarioId: 'S1', status: 'active' },
      data: { status: 'abandoned' },
    })
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('only creates when not asked to abandon others', async () => {
    const { prisma, svc } = setup()
    await svc.createSession('S1', 'u1')
    expect(prisma.immersiveSession.updateMany).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.immersiveSession.create).toHaveBeenCalledWith({
      data: { scenarioId: 'S1', userId: 'u1' },
    })
  })
})
