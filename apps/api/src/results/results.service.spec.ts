import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
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
    ['future completedAt', { completedAt: new Date(Date.now() + 10 * 60_000).toISOString() }],
    ['missing id', { id: undefined }],
  ])('400s %s without touching the database', async (_n, over) => {
    const h = setup()
    await expect(h.svc.create(dto(over))).rejects.toBeInstanceOf(BadRequestException)
    expect(h.prisma.simulationResult.create).not.toHaveBeenCalled()
    expect(h.prisma.simulationResult.findUnique).not.toHaveBeenCalled()
  })

  it('allows a completedAt up to 5 minutes ahead', async () => {
    const h = setup()
    const at = new Date(Date.now() + 4 * 60_000).toISOString()
    await expect(h.svc.create(dto({ completedAt: at }))).resolves.toBeDefined()
  })
})

describe('ResultsService.create for an existing id', () => {
  it('returns the caller own row', async () => {
    const h = setup({ id: 'r1', userId: 'u1' })
    await expect(h.svc.create(dto())).resolves.toEqual({ id: 'r1', userId: 'u1' })
    expect(h.prisma.simulationResult.create).not.toHaveBeenCalled()
  })

  it.each([[false], [true]])("403s another user's row (lti %p)", async (lti) => {
    const h = setup({ id: 'r1', userId: 'someone-else' })
    await expect(h.svc.create(dto(), { lti })).rejects.toBeInstanceOf(ForbiddenException)
  })
})

describe('ResultsService.create for an LTI session', () => {
  const lti = { lti: true }

  it('accepts dimensions equal to the rubric and a choice count within the decisions', async () => {
    const h = setup()
    await expect(h.svc.create(dto(), lti)).resolves.toBeDefined()
    await expect(h.svc.create(dto({ id: 'r2', choiceSequence: ['a'] }), lti)).resolves.toBeDefined()
  })

  it.each([
    ['a missing dimension', { dimensionScores: [dim({ dimension: 'Clarity' })] }],
    [
      'an extra dimension',
      { dimensionScores: [dim(), dim({ dimension: 'Depth' }), dim({ dimension: 'Extra' })] },
    ],
    ['a renamed dimension', { dimensionScores: [dim(), dim({ dimension: 'Other' })] }],
    ['a repeated dimension', { dimensionScores: [dim(), dim()] }],
    ['no choices', { choiceSequence: [] }],
    ['more choices than decision nodes', { choiceSequence: ['a', 'b', 'c'] }],
  ])('400s %s', async (_n, over) => {
    const h = setup()
    await expect(h.svc.create(dto(over), lti)).rejects.toBeInstanceOf(BadRequestException)
    expect(h.prisma.simulationResult.create).not.toHaveBeenCalled()
  })

  it('404s an unknown scenario', async () => {
    const h = setup()
    h.prisma.scenario.findUnique.mockResolvedValue(null)
    await expect(h.svc.create(dto(), lti)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('does not apply the scenario checks to a normal caller', async () => {
    const h = setup()
    await expect(h.svc.create(dto({ choiceSequence: [] }))).resolves.toBeDefined()
    expect(h.prisma.scenario.findUnique).not.toHaveBeenCalled()
  })
})

describe('ResultsService.create for an LTI session on a scenario with sql nodes', () => {
  const lti = { lti: true }
  const withNodes = (nodes: { type: string }[]) => {
    const h = setup()
    h.prisma.scenario.findUnique.mockResolvedValue({
      ...scenarioRow,
      data: { ...scenarioRow.data, nodes },
    })
    return h
  }

  it('counts only decision nodes, so sql and quant nodes do not raise the limit', async () => {
    const h = withNodes([{ type: 'sql' }, { type: 'decision' }, { type: 'sql' }, { type: 'quant' }])
    await expect(h.svc.create(dto({ choiceSequence: ['a'] }), lti)).resolves.toBeDefined()
    await expect(
      h.svc.create(dto({ id: 'r2', choiceSequence: ['a', 'b'] }), lti)
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(h.svc.create(dto({ id: 'r3', choiceSequence: [] }), lti)).rejects.toBeInstanceOf(
      BadRequestException
    )
  })

  it('accepts an empty choiceSequence when the scenario has no decision nodes', async () => {
    const h = withNodes([{ type: 'sql' }, { type: 'sql' }, { type: 'feedback' }])
    await expect(h.svc.create(dto({ choiceSequence: [] }), lti)).resolves.toBeDefined()
    await expect(
      h.svc.create(dto({ id: 'r2', choiceSequence: ['a'] }), lti)
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
