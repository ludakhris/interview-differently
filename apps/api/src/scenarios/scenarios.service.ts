import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TRACK_META } from './track-meta'
type Scenario = Record<string, unknown>

@Injectable()
export class ScenariosService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const rows = await this.prisma.scenario.findMany({
      orderBy: { createdAt: 'asc' },
    })
    const scenarios = rows.map((r) => r.data as unknown as Scenario)
    return { scenarios, trackMeta: TRACK_META }
  }

  async findOne(id: string): Promise<Scenario> {
    const row = await this.prisma.scenario.findUnique({ where: { scenarioId: id } })
    if (!row) throw new NotFoundException(`Scenario ${id} not found`)
    return row.data as unknown as Scenario
  }

  async create(scenario: Scenario): Promise<Scenario> {
    const row = await this.prisma.scenario.create({
      data: {
        scenarioId: scenario.scenarioId,
        status: scenario.builderMeta?.status ?? 'draft',
        data: scenario as object,
      },
    })
    return row.data as unknown as Scenario
  }

  async update(id: string, scenario: Scenario): Promise<Scenario> {
    await this.findOne(id) // throws if not found
    const updated = {
      ...scenario,
      builderMeta: {
        ...scenario.builderMeta,
        lastEditedAt: new Date().toISOString(),
      },
    }
    const row = await this.prisma.scenario.update({
      where: { scenarioId: id },
      data: {
        status: updated.builderMeta?.status ?? 'draft',
        data: updated as object,
      },
    })
    return row.data as unknown as Scenario
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id) // throws if not found
    await this.prisma.scenario.delete({ where: { scenarioId: id } })
  }

  async publish(id: string): Promise<Scenario> {
    const scenario = await this.findOne(id)
    const published = {
      ...scenario,
      builderMeta: {
        ...scenario.builderMeta,
        status: 'published' as const,
        lastEditedAt: new Date().toISOString(),
      },
    }
    const row = await this.prisma.scenario.update({
      where: { scenarioId: id },
      data: { status: 'published', data: published as object },
    })
    return row.data as unknown as Scenario
  }
}
