import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { PrismaModule } from '../prisma/prisma.module'
import { DataAccessLogController } from './data-access-log.controller'
import { DataAccessLogService } from './data-access-log.service'
import { AccessInterceptor } from './access/access.interceptor'
import { AccessService } from './access/access.service'
import { LearnService } from './learn.service'
import { ProviderAccessService } from './provider-access.service'

/**
 * The checks every talent, attendance and activity feature goes through: LearnService (roles and
 * workspaces), ProviderAccessService (who may see a provider's participants) and the audit log.
 * Feature modules import this; none of them re-implements an access rule.
 */
@Module({
  imports: [PrismaModule],
  controllers: [DataAccessLogController],
  providers: [
    AccessService,
    { provide: APP_INTERCEPTOR, useClass: AccessInterceptor },
    LearnService,
    ProviderAccessService,
    DataAccessLogService,
  ],
  exports: [AccessService, LearnService, ProviderAccessService, DataAccessLogService],
})
export class LearnAccessModule {}
