import { Module } from '@nestjs/common'
import { HealthModule } from './health/health.module'
import { ScenariosModule } from './scenarios/scenarios.module'
import { PrismaModule } from './prisma/prisma.module'
import { ResultsModule } from './results/results.module'
import { PlatformConfigModule } from './platform-config/platform-config.module'
import { ImmersiveSessionsModule } from './immersive-sessions/immersive-sessions.module'
import { DidModule } from './did/did.module'

@Module({
  imports: [PrismaModule, HealthModule, ScenariosModule, ResultsModule, PlatformConfigModule, ImmersiveSessionsModule, DidModule],
})
export class AppModule {}
