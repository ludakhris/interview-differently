import { Module } from '@nestjs/common'
import { StorageModule } from '../storage/storage.module'
import { AccountController } from './account.controller'
import { AccountService } from './account.service'
import { ClerkWebhookController } from './clerk-webhook.controller'
import { RetentionService } from './retention.service'

@Module({
  imports: [StorageModule],
  controllers: [AccountController, ClerkWebhookController],
  providers: [AccountService, RetentionService],
})
export class AccountModule {}
