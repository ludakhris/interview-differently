import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { LearnController } from './learn.controller'
import { LearnService } from './learn.service'

@Module({
  imports: [PrismaModule],
  controllers: [LearnController],
  providers: [LearnService],
})
export class LearnModule {}
