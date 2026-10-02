import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
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
import { AnalyticsModule } from './analytics/analytics.module'
import { DatasetsModule } from './datasets/datasets.module'
import { ToolsModule } from './tools/tools.module'
import { AssessmentsModule } from './assessments/assessments.module'
import { UsageModule } from './usage/usage.module'
import { ConsentModule } from './consent/consent.module'
import { AccountModule } from './account/account.module'
import { ErrorReportingFilter } from './common/error-reporting.filter'

@Module({
  imports: [
    // Global per-IP ceiling. Generous because a classroom shares one NAT'd IP;
    // tighter @Throttle limits sit on public and abuse-prone routes.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
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
    AnalyticsModule,
    DatasetsModule,
    ToolsModule,
    AssessmentsModule,
    UsageModule,
    ConsentModule,
    AccountModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ErrorReportingFilter },
  ],
})
export class AppModule {}
