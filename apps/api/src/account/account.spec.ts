import { BadGatewayException } from '@nestjs/common'
import { AccountService } from './account.service'
import { RetentionService } from './retention.service'

function makePrisma(recordings: { mediaUrl: string }[], email: string | null = 'a@b.com') {
  const del = () => jest.fn().mockReturnValue('op')
  const prisma = {
    immersiveResponse: {
      findMany: jest.fn().mockResolvedValue(recordings),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ email }), deleteMany: del() },
    simulationResult: { deleteMany: del() },
    simulationAttempt: { deleteMany: del() },
    immersiveSession: { deleteMany: del() },
    assessmentAttempt: { deleteMany: del() },
    sqlQueryLog: { deleteMany: del() },
    usageEvent: { deleteMany: del() },
    consentRecord: { deleteMany: del() },
    scenarioRequest: { deleteMany: del() },
    $transaction: jest.fn().mockResolvedValue([]),
  }
  return prisma
}

describe('AccountService.eraseUserData', () => {
  it('deletes recordings, then every user table in one transaction', async () => {
    const prisma = makePrisma([
      { mediaUrl: 'responses/s/r1.webm' },
      { mediaUrl: 'responses/s/r2.webm' },
    ])
    const storage = { delete: jest.fn().mockResolvedValue(undefined) }
    await new AccountService(prisma as never, storage as never).eraseUserData('u1')
    expect(storage.delete).toHaveBeenCalledTimes(2)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    for (const t of [
      prisma.simulationResult,
      prisma.simulationAttempt,
      prisma.immersiveSession,
      prisma.assessmentAttempt,
      prisma.sqlQueryLog,
      prisma.usageEvent,
      prisma.consentRecord,
      prisma.scenarioRequest,
      prisma.user,
    ]) {
      expect(t.deleteMany).toHaveBeenCalled()
    }
  })

  it('aborts before touching the DB when a recording cannot be deleted', async () => {
    const prisma = makePrisma([{ mediaUrl: 'responses/s/r1.webm' }])
    const storage = { delete: jest.fn().mockRejectedValue(new Error('r2 down')) }
    await expect(
      new AccountService(prisma as never, storage as never).eraseUserData('u1')
    ).rejects.toThrow(BadGatewayException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('skips scenario-request cleanup when the user has no email', async () => {
    const prisma = makePrisma([], null)
    const storage = { delete: jest.fn() }
    await new AccountService(prisma as never, storage as never).eraseUserData('u1')
    expect(prisma.scenarioRequest.deleteMany).not.toHaveBeenCalled()
  })
})

describe('RetentionService.sweep', () => {
  it('deletes expired recordings and clears their key', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'r1', mediaUrl: 'k1' }])
      .mockResolvedValueOnce([])
    const update = jest.fn()
    const prisma = { immersiveResponse: { findMany, update } }
    const storage = { delete: jest.fn().mockResolvedValue(undefined) }
    const svc = new RetentionService(prisma as never, storage as never)
    expect(await svc.sweep()).toBe(1)
    expect(storage.delete).toHaveBeenCalledWith('k1')
    expect(update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { mediaUrl: null } })
  })

  it('keeps the DB key when storage deletion fails (so the next sweep retries)', async () => {
    const prisma = {
      immersiveResponse: {
        findMany: jest.fn().mockResolvedValue([{ id: 'r1', mediaUrl: 'k1' }]),
        update: jest.fn(),
      },
    }
    const storage = { delete: jest.fn().mockRejectedValue(new Error('down')) }
    const svc = new RetentionService(prisma as never, storage as never)
    expect(await svc.sweep()).toBe(0)
    expect(prisma.immersiveResponse.update).not.toHaveBeenCalled()
  })

  it('reads retention days from env with a 90-day default', () => {
    const svc = new RetentionService({} as never, {} as never)
    delete process.env.RECORDING_RETENTION_DAYS
    expect(svc.retentionDays()).toBe(90)
    process.env.RECORDING_RETENTION_DAYS = '30'
    expect(svc.retentionDays()).toBe(30)
    delete process.env.RECORDING_RETENTION_DAYS
  })
})
