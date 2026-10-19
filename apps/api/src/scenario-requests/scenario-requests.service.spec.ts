import { BadRequestException } from '@nestjs/common'
import { ScenarioRequestsService } from './scenario-requests.service'

const valid = {
  situation: 'A long enough description of the situation at hand.',
  hardestMoment: 'The hardest moment of the day.',
}

function setup() {
  delete process.env.RESEND_API_KEY
  const prisma = {
    scenarioRequest: {
      create: jest.fn(async () => ({ id: 'r1' })),
      update: jest.fn(async () => ({})),
    },
  }
  return { prisma, svc: new ScenarioRequestsService(prisma as never) }
}

describe('ScenarioRequestsService.submit input checks', () => {
  it.each([
    ['a number for situation', { ...valid, situation: 12345 }],
    ['an object for a context field', { ...valid, otherPeople: { a: 1 } }],
    ['a list for contactEmail', { ...valid, contactEmail: ['a@b.co'] }],
    ['a non-text honeypot', { ...valid, honeypot: 1 }],
    ['text for estimatedMinutes', { ...valid, estimatedMinutes: '30' }],
    ['a huge estimatedMinutes', { ...valid, estimatedMinutes: 1e12 }],
    ['an over-long contactEmail', { ...valid, contactEmail: `${'a'.repeat(300)}@b.co` }],
  ])('refuses %s with a 400 and writes nothing', async (_n, body) => {
    const { svc, prisma } = setup()
    await expect(svc.submit(body as never)).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.scenarioRequest.create).not.toHaveBeenCalled()
  })

  it('accepts a valid request', async () => {
    const { svc, prisma } = setup()
    await expect(svc.submit({ ...valid, estimatedMinutes: 30 })).resolves.toEqual({ id: 'r1' })
    expect(prisma.scenarioRequest.create).toHaveBeenCalled()
  })
})
