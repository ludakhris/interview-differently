import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AiFeedbackService, type AiFeedbackResult } from './ai-feedback.service'
import type { CreateResultDto, CompetencyProfile } from './results.types'

@Injectable()
export class ResultsService {
  constructor(
    private prisma: PrismaService,
    private aiFeedbackSvc: AiFeedbackService,
  ) {}

  async create(dto: CreateResultDto) {
    const existing = await this.prisma.simulationResult.findUnique({ where: { id: dto.id } })
    if (existing) return existing

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
      decisions,
    )

    await this.prisma.simulationResult.update({
      where: { id: resultId },
      data: { aiFeedback: aiFeedback as object },
    })

    return aiFeedback
  }
}
