import { Global, Module } from '@nestjs/common'
import { ClerkService } from './clerk.service'
import { AdminGuard } from './admin.guard'
import { AuthenticatedGuard } from './authenticated.guard'
import { LearnGuard } from './learn.guard'
import { InstitutionScope } from './scope'

@Global()
@Module({
  providers: [ClerkService, AdminGuard, AuthenticatedGuard, LearnGuard, InstitutionScope],
  exports: [ClerkService, AdminGuard, AuthenticatedGuard, LearnGuard, InstitutionScope],
})
export class AuthModule {}
