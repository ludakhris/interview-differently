import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { LTI_STORE } from './lti-store'
import { PrismaLtiStore } from './lti-store.prisma'

/** The shared LTI single-use store (Postgres). Imported by both the platform and the tool module. */
@Module({
  imports: [PrismaModule],
  providers: [{ provide: LTI_STORE, useClass: PrismaLtiStore }],
  exports: [LTI_STORE],
})
export class LtiStoreModule {}
