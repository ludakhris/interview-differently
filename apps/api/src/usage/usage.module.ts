import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { UsageController } from './usage.controller'
import { UsageService } from './usage.service'

@Module({
  imports: [PrismaModule],
  controllers: [UsageController],
  providers: [UsageService],
})
export class UsageModule {}
