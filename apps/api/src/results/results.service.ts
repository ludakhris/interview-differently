import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AiFeedbackService, type AiFeedbackResult } from './ai-feedback.service'
import type { CreateResultDto, CompetencyProfile } from './results.types'

const MAX_DIMENSIONS = 12
const MAX_CHOICES = 60
const MAX_SHORT = 200
const MAX_FEEDBACK = 5000
const MAX_FUTURE_MS = 5 * 60 * 1000

const isString = (v: unknown, max: number, min = 0): v is string =>
  typeof v === 'string' && v.length >= min && v.length <= max
const isScore = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100

/**
 * Stopgap integrity checks on a client-submitted result (scores are still the client's; recomputing
 * them server-side is tracked separately). Throws a 400 for anything malformed.
 */
function validateResult(dto: CreateResultDto, nowMs: number): void {
  const bad = (what: string): never => {
    throw new BadRequestException(`Invalid result: ${what}`)
  }
  if (typeof dto !== 'object' || dto === null) bad('body')
  if (!isString(dto.id, MAX_SHORT, 1)) bad('id')
  if (!isString(dto.scenarioId, MAX_SHORT, 1)) bad('scenarioId')
  if (!isString(dto.scenarioTitle, MAX_SHORT)) bad('scenarioTitle')
  if (!isString(dto.track, MAX_SHORT)) bad('track')
  if (!Number.isInteger(dto.overallScore) || !isScore(dto.overallScore)) bad('overallScore')
  const dims = dto.dimensionScores
  if (!Array.isArray(dims) || dims.length === 0 || dims.length > MAX_DIMENSIONS)
    bad('dimensionScores')
  for (const d of dims) {
    if (typeof d !== 'object' || d === null) bad('dimensionScores')
    if (!isString(d.dimension, MAX_SHORT, 1)) bad('dimension name')
    if (!isScore(d.score)) bad('dimension score')
    if (!isString(d.quality, MAX_SHORT) || !isString(d.feedback, MAX_FEEDBACK))
      bad('dimension quality or feedback')
  }
  const choices = dto.choiceSequence
  if (
    !Array.isArray(choices) ||
    choices.length > MAX_CHOICES ||
    !choices.every((c) => isString(c, MAX_SHORT))
  )
    bad('choiceSequence')
  const at = typeof dto.completedAt === 'string' ? Date.parse(dto.completedAt) : NaN
  if (Number.isNaN(at) || at > nowMs + MAX_FUTURE_MS) bad('completedAt')
}

@Injectable()
export class ResultsService {
  constructor(
    private prisma: PrismaService,
    private aiFeedbackSvc: AiFeedbackService
  ) {}

  /**
   * Records that a user has begun a traditional simulation. One row per
   * play-page mount — analytics divides count(SimulationResult) by
   * count(SimulationAttempt) within the same scope to compute completion
   * rate. React StrictMode dedupe lives on the frontend (a useRef gate
   * in SimulationPage); the table itself is intentionally append-only.
   */
  async createAttempt(input: { userId: string; scenarioId: string; track: string }) {
    return this.prisma.simulationAttempt.create({
      data: {
        userId: input.userId,
        scenarioId: input.scenarioId,
        track: input.track,
      },
    })
  }

  /** `opts.lti`: also hold the result to the launched scenario's rubric and decision count. */
  async create(dto: CreateResultDto, opts: { lti?: boolean } = {}) {
    validateResult(dto, Date.now())
    if (opts.lti) await this.assertMatchesScenario(dto)
    const existing = await this.prisma.simulationResult.findUnique({ where: { id: dto.id } })
    if (existing) {
      if (existing.userId !== dto.userId) throw new ForbiddenException()
      return existing
    }

    return this.prisma.simulationResult.create({
      data: {
        id: dto.id,
        userId: dto.userId,
        scenarioId: dto.scenarioId,
        scenarioTitle: dto.scenarioTitle,
        track: dto.track,
        completedAt: new Date(dto.completedAt),
        overallScore: dto.overallScore,
        choiceSequence: dto.choiceSequence,
        dimensionScores: {
          create: dto.dimensionScores.map((d) => ({
            dimension: d.dimension,
            score: d.score,
            quality: d.quality,
            feedback: d.feedback,
          })),
        },
      },
    })
  }

  private async assertMatchesScenario(dto: CreateResultDto) {
    const row = await this.prisma.scenario.findUnique({ where: { scenarioId: dto.scenarioId } })
    if (!row) throw new NotFoundException(`Scenario ${dto.scenarioId} not found`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = row.data as any
    const names: string[] = (data?.rubric?.dimensions ?? []).map((d: { name: string }) => d.name)
    const given = dto.dimensionScores.map((d) => d.dimension)
    if (
      given.length !== names.length ||
      new Set(given).size !== given.length ||
      !names.every((n) => given.includes(n))
    )
      throw new BadRequestException('Invalid result: dimensions do not match the scenario rubric')
    const decisions = (data?.nodes ?? []).filter((n: { type?: string }) => n.type === 'decision')
    if (dto.choiceSequence.length < 1 || dto.choiceSequence.length > decisions.length)
      throw new BadRequestException('Invalid result: choiceSequence does not fit the scenario')
  }

  async getById(id: string) {
    const result = await this.prisma.simulationResult.findUnique({
      where: { id },
      include: { dimensionScores: true },
    })
    if (!result) throw new NotFoundException(`Result ${id} not found`)
    return result
  }

  async getProfile(userId: string): Promise<CompetencyProfile> {
    const results = await this.prisma.simulationResult.findMany({
      where: { userId },
      orderBy: { completedAt: 'desc' },
      include: { dimensionScores: true },
    })

    const dimensionMap = new Map<string, number[]>()
    for (const result of results) {
      for (const ds of result.dimensionScores) {
        if (!dimensionMap.has(ds.dimension)) dimensionMap.set(ds.dimension, [])
        dimensionMap.get(ds.dimension)!.push(ds.score)
      }
    }

    const dimensionAverages = Array.from(dimensionMap.entries()).map(([dimension, scores]) => ({
      dimension,
      averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    }))

    const history = results.map((r) => ({
      id: r.id,
      scenarioId: r.scenarioId,
      scenarioTitle: r.scenarioTitle,
      track: r.track,
      overallScore: r.overallScore,
      completedAt: r.completedAt.toISOString(),
    }))

    return { dimensionAverages, history }
  }

  async getOrGenerateAiFeedback(resultId: string): Promise<AiFeedbackResult> {
    const result = await this.prisma.simulationResult.findUnique({
      where: { id: resultId },
      include: { dimensionScores: true },
    })
    if (!result) throw new NotFoundException(`Result ${resultId} not found`)

    if (result.aiFeedback) {
      return result.aiFeedback as unknown as AiFeedbackResult
    }

    const scenarioRow = await this.prisma.scenario.findUnique({
      where: { scenarioId: result.scenarioId },
    })
    if (!scenarioRow) throw new NotFoundException(`Scenario ${result.scenarioId} not found`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scenario = scenarioRow.data as any

    // Reconstruct decisions: decision nodes in encounter order, zipped with choiceSequence
    // NOTE: Assumes linear scenarios where all decision nodes are encountered in node array order
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decisionNodes = scenario.nodes.filter((n: any) => n.type === 'decision')
    const decisions = result.choiceSequence.map((chosenId: string, i: number) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const node = decisionNodes[i] as any
      return {
        narrative: node?.narrative ?? '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        choices: (node?.choices ?? []).map((c: any) => ({ id: c.id, text: c.text })),
        chosenId,
      }
    })

    const aiFeedback = await this.aiFeedbackSvc.generateFeedback(
      scenario.rubric.dimensions,
      result.dimensionScores,
      decisions
    )

    await this.prisma.simulationResult.update({
      where: { id: resultId },
      data: { aiFeedback: aiFeedback as object },
    })

    return aiFeedback
  }
}
