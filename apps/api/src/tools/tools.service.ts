import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ClerkService } from '../auth/clerk.service'
import { TOOL_KEYS, isToolKey, type ToolKey } from './tool-keys'

@Injectable()
export class ToolsService {
  constructor(
    private prisma: PrismaService,
    private clerk: ClerkService,
  ) {}

  /** Every known tool with its enabled state for one cohort (missing row = disabled). */
  async listForCohort(cohortId: string): Promise<{ toolKey: ToolKey; enabled: boolean }[]> {
    const cohort = await this.prisma.cohort.findUnique({ where: { id: cohortId }, include: { tools: true } })
    if (!cohort) throw new NotFoundException(`Cohort ${cohortId} not found`)
    return TOOL_KEYS.map((toolKey) => ({
      toolKey,
      enabled: cohort.tools.find((t) => t.toolKey === toolKey)?.enabled ?? false,
    }))
  }

  async setForCohort(cohortId: string, toolKey: string, enabled: boolean): Promise<void> {
    if (!isToolKey(toolKey)) throw new BadRequestException(`Unknown tool "${toolKey}"`)
    if (typeof enabled !== 'boolean') throw new BadRequestException('enabled must be a boolean')
    const cohort = await this.prisma.cohort.findUnique({ where: { id: cohortId } })
    if (!cohort) throw new NotFoundException(`Cohort ${cohortId} not found`)
    await this.prisma.cohortToolConfig.upsert({
      where: { cohortId_toolKey: { cohortId, toolKey } },
      update: { enabled },
      create: { cohortId, toolKey, enabled },
    })
  }

  /** Tools the user can open: all of them for admins, else the union across their cohorts. */
  async listForUser(userId: string): Promise<ToolKey[]> {
    if (await this.clerk.isAdmin(userId)) return [...TOOL_KEYS]
    const rows = await this.prisma.cohortToolConfig.findMany({
      where: { enabled: true, cohort: { memberships: { some: { userId } } } },
      select: { toolKey: true },
      distinct: ['toolKey'],
    })
    return rows.map((r) => r.toolKey).filter(isToolKey)
  }
}
