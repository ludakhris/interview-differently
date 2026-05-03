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
import { InstitutionsModule } from './institutions/institutions.module'
import { CohortsModule } from './cohorts/cohorts.module'
import { MeModule } from './me/me.module'

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
    InstitutionsModule,
    CohortsModule,
    MeModule,
  ],
})
export class AppModule {}
