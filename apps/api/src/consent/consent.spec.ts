import { BadRequestException } from '@nestjs/common'
import { ConsentService } from './consent.service'
import { CONSENT_VERSIONS } from './consent.versions'

function make(rows: { kind: string; version: string; createdAt: Date }[] = []) {
  const upsert = jest.fn().mockResolvedValue({})
  const prisma = {
    consentRecord: {
      findMany: jest.fn().mockResolvedValue(rows),
      findUnique: jest.fn(),
      upsert,
    },
  }
  return { svc: new ConsentService(prisma as never), prisma, upsert }
}

describe('ConsentService', () => {
  it('reports only current-version acceptance', async () => {
    const { svc } = make([
      { kind: 'terms', version: CONSENT_VERSIONS.terms, createdAt: new Date() },
      { kind: 'privacy', version: '1999-01-01', createdAt: new Date() }, // stale
    ])
    const s = await svc.status('u1')
    expect(s.accepted.terms).toBe(CONSENT_VERSIONS.terms)
    expect(s.accepted.privacy).toBeNull()
    expect(s.accepted.recording).toBeNull()
  })

  it('rejects unknown kinds and stale versions', async () => {
    const { svc, upsert } = make()
    await expect(svc.accept('u1', 'nope', CONSENT_VERSIONS.terms)).rejects.toThrow(
      BadRequestException
    )
    await expect(svc.accept('u1', 'terms', '1999-01-01')).rejects.toThrow(BadRequestException)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('records acceptance of the current version', async () => {
    const { svc, upsert } = make()
    await svc.accept('u1', 'recording', CONSENT_VERSIONS.recording)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { userId: 'u1', kind: 'recording', version: CONSENT_VERSIONS.recording },
      })
    )
  })
})
