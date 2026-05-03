import { Module } from '@nestjs/common'
import { DidController } from './did.controller'
import { DidService } from './did.service'

@Module({
  controllers: [DidController],
  providers: [DidService],
  exports: [DidService],
})
export class DidModule {}
