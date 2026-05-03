import { Global, Module } from '@nestjs/common'
import { ClerkService } from './clerk.service'
import { AdminGuard } from './admin.guard'
import { AuthenticatedGuard } from './authenticated.guard'

@Global()
@Module({
  providers: [ClerkService, AdminGuard, AuthenticatedGuard],
  exports: [ClerkService, AdminGuard, AuthenticatedGuard],
})
export class AuthModule {}
