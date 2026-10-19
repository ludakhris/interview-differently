import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/** The switches an admin may set; each holds 'true' or 'false'. */
const SWITCHES = ['ai_feedback_enabled']

export interface PublicConfig {
  aiFeedbackEnabled: boolean
}

@Injectable()
export class PlatformConfigService {
  constructor(private prisma: PrismaService) {}

  async getPublic(): Promise<PublicConfig> {
    const row = await this.prisma.platformConfig.findUnique({
      where: { key: 'ai_feedback_enabled' },
    })
    return { aiFeedbackEnabled: row?.value === 'true' }
  }

  async set(key: unknown, value: unknown): Promise<void> {
    if (typeof key !== 'string' || !SWITCHES.includes(key))
      throw new BadRequestException(`key must be one of: ${SWITCHES.join(', ')}`)
    if (value !== 'true' && value !== 'false')
      throw new BadRequestException("value must be 'true' or 'false'")
    await this.prisma.platformConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })
  }
}
