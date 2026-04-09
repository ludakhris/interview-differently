import { Module } from '@nestjs/common'
import { HealthModule } from './health/health.module'
import { ScenariosModule } from './scenarios/scenarios.module'
import { PrismaModule } from './prisma/prisma.module'

@Module({
  imports: [PrismaModule, HealthModule, ScenariosModule],
})
export class AppModule {}
