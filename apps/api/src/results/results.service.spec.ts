import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { ResultsService } from './results.service'
import type { CreateResultDto } from './results.types'

const scenarioRow = {
  scenarioId: 'S1',
  data: {
    rubric: { dimensions: [{ name: 'Clarity' }, { name: 'Depth' }] },
    nodes: [{ type: 'narrative' }, { type: 'decision' }, { type: 'decision' }],
  },
}

function setup(existing: unknown = null) {
  const prisma = {
    simulationResult: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn(async (a: { data: object }) => ({ ...a.data })),
    },
    scenario: { findUnique: jest.fn().mockResolvedValue(scenarioRow) },
  }
  return { prisma, svc: new ResultsService(prisma as never, {} as never) }
}

const dto = (over: Partial<CreateResultDto> | Record<string, unknown> = {}): CreateResultDto => ({
  id: 'r1',
  userId: 'u1',
  scenarioId: 'S1',
  scenarioTitle: 'T',
  track: 'ops',
  completedAt: new Date().toISOString(),
  overallScore: 70,
  choiceSequence: ['a', 'b'],
  dimensionScores: [
    { dimension: 'Clarity', score: 80, quality: 'strong', feedback: 'f' },
    { dimension: 'Depth', score: 60, quality: 'proficient', feedback: 'f' },
  ],
  ...over,
})
const dim = (over = {}) => ({
  dimension: 'Clarity',
  score: 50,
  quality: 'q',
  feedback: 'f',
  ...over,
})

const savedCompletedAt = (h: ReturnType<typeof setup>) =>
  (h.prisma.simulationResult.create.mock.calls[0][0].data as { completedAt: Date }).completedAt

describe('ResultsService.create validation', () => {
  it('stores a valid result', async () => {
    const h = setup()
    await expect(h.svc.create(dto())).resolves.toMatchObject({ id: 'r1' })
  })

  it.each([
    ['fractional overallScore', { overallScore: 70.5 }],
    ['overallScore over 100', { overallScore: 101 }],
    ['negative overallScore', { overallScore: -1 }],
    ['string overallScore', { overallScore: '70' }],
    ['NaN overallScore', { overallScore: NaN }],
    ['no dimensions', { dimensionScores: [] }],
    ['dimensions not a list', { dimensionScores: 'x' }],
    [
      '13 dimensions',
      { dimensionScores: Array.from({ length: 13 }, (_, i) => dim({ dimension: `d${i}` })) },
    ],
    ['score over 100', { dimensionScores: [dim({ score: 101 })] }],
    ['infinite score', { dimensionScores: [dim({ score: Infinity })] }],
    ['empty dimension name', { dimensionScores: [dim({ dimension: '' })] }],
    ['non-string dimension name', { dimensionScores: [dim({ dimension: 5 })] }],
    ['null dimension entry', { dimensionScores: [null] }],
    ['61 choices', { choiceSequence: Array.from({ length: 61 }, () => 'a') }],
    ['non-array choices', { choiceSequence: 'ab' }],
    ['non-string choice', { choiceSequence: [1] }],
    ['long choice', { choiceSequence: ['x'.repeat(201)] }],
    ['bad completedAt', { completedAt: 'nope' }],
    ['missing completedAt', { completedAt: undefined }],
    ['missing id', { id: undefined }],
  ])('400s %s without touching the database', async (_n, over) => {
    const h = setup()
    await expect(h.svc.create(dto(over))).rejects.toBeInstanceOf(BadRequestException)
    expect(h.prisma.simulationResult.create).not.toHaveBeenCalled()
    expect(h.prisma.simulationResult.findUnique).not.toHaveBeenCalled()
  })

  it('clamps a completedAt in the future to the server time instead of rejecting it', async () => {
    const h = setup()
    const before = Date.now()
    await h.svc.create(dto({ completedAt: new Date(before + 3 * 3600_000).toISOString() }))
    const saved = savedCompletedAt(h)
    expect(saved.getTime()).toBeGreaterThanOrEqual(before)
    expect(saved.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('keeps a past completedAt as sent', async () => {
    const h = setup()
    const at = new Date(Date.now() - 60_000)
    await h.svc.create(dto({ completedAt: at.toISOString() }))
    const saved = savedCompletedAt(h)
    expect(saved).toEqual(at)
  })
})

describe('ResultsService.create for an existing id', () => {
  it('returns the caller own row', async () => {
    const h = setup({ id: 'r1', userId: 'u1' })
    await expect(h.svc.create(dto())).resolves.toEqual({ id: 'r1', userId: 'u1' })
    expect(h.prisma.simulationResult.create).not.toHaveBeenCalled()
  })

  it("403s another user's row", async () => {
    const h = setup({ id: 'r1', userId: 'someone-else' })
    await expect(h.svc.create(dto())).rejects.toBeInstanceOf(ForbiddenException)
  })
})
