import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { DidModule } from '../did/did.module'
import { StorageModule } from '../storage/storage.module'
import { ScenarioMediaController } from './scenario-media.controller'
import { ScenarioMediaService } from './scenario-media.service'

@Module({
  imports: [PrismaModule, DidModule, StorageModule],
  controllers: [ScenarioMediaController],
  providers: [ScenarioMediaService],
})
export class ScenarioMediaModule {}
