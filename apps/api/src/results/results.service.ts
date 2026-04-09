import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateResultDto, CompetencyProfile } from './results.types'

@Injectable()
export class ResultsService {
  constructor(private prisma: PrismaService) {}

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
}
