import { Global, Module } from '@nestjs/common'
import { ClerkService } from './clerk.service'
import { AdminGuard } from './admin.guard'
import { AuthenticatedGuard } from './authenticated.guard'
import { InstitutionScope } from './scope'

@Global()
@Module({
  providers: [ClerkService, AdminGuard, AuthenticatedGuard, InstitutionScope],
  exports: [ClerkService, AdminGuard, AuthenticatedGuard, InstitutionScope],
})
export class AuthModule {}
