import { Module } from '@nestjs/common'
import { HealthModule } from './health/health.module'
import { ScenariosModule } from './scenarios/scenarios.module'

@Module({
  imports: [HealthModule, ScenariosModule],
})
export class AppModule {}
