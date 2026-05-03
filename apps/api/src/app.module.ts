import { Module } from '@nestjs/common'
import { HealthModule } from './health/health.module'
import { ScenariosModule } from './scenarios/scenarios.module'
import { PrismaModule } from './prisma/prisma.module'
import { ResultsModule } from './results/results.module'
import { PlatformConfigModule } from './platform-config/platform-config.module'
import { ImmersiveSessionsModule } from './immersive-sessions/immersive-sessions.module'
import { DidModule } from './did/did.module'
import { ScenarioMediaModule } from './scenario-media/scenario-media.module'
import { ScenarioRequestsModule } from './scenario-requests/scenario-requests.module'
import { StorageModule } from './storage/storage.module'
import { AuthModule } from './auth/auth.module'

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    StorageModule,
    ScenariosModule,
    ResultsModule,
    PlatformConfigModule,
    ImmersiveSessionsModule,
    DidModule,
    ScenarioMediaModule,
    ScenarioRequestsModule,
  ],
})
export class AppModule {}
