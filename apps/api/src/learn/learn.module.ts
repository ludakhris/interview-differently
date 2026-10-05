import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { CoursesController } from './courses.controller'
import { CoursesService } from './courses.service'
import { LearnController } from './learn.controller'
import { LearnService } from './learn.service'

@Module({
  imports: [PrismaModule],
  controllers: [LearnController, CoursesController],
  providers: [LearnService, CoursesService],
})
export class LearnModule {}
