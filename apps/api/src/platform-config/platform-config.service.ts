import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface PublicConfig {
  aiFeedbackEnabled: boolean
}

@Injectable()
export class PlatformConfigService {
  constructor(private prisma: PrismaService) {}

  async getPublic(): Promise<PublicConfig> {
    const row = await this.prisma.platformConfig.findUnique({ where: { key: 'ai_feedback_enabled' } })
    return { aiFeedbackEnabled: row?.value === 'true' }
  }

  async set(key: string, value: string): Promise<void> {
    await this.prisma.platformConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })
  }
}
