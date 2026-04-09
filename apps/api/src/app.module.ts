import { Module } from '@nestjs/common'
import { HealthModule } from './health/health.module'
import { ScenariosModule } from './scenarios/scenarios.module'
import { PrismaModule } from './prisma/prisma.module'
import { ResultsModule } from './results/results.module'
import { PlatformConfigModule } from './platform-config/platform-config.module'

@Module({
  imports: [PrismaModule, HealthModule, ScenariosModule, ResultsModule, PlatformConfigModule],
})
export class AppModule {}
