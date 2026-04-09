import { Module } from '@nestjs/common'
import { HealthModule } from './health/health.module'
import { ScenariosModule } from './scenarios/scenarios.module'
import { PrismaModule } from './prisma/prisma.module'
import { ResultsModule } from './results/results.module'

@Module({
  imports: [PrismaModule, HealthModule, ScenariosModule, ResultsModule],
})
export class AppModule {}
