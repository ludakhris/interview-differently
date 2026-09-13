import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { SqlRunnerModule } from '../sql-runner/sql-runner.module'
import { AssessmentsAdminController, AssessmentsMeController, InvitesMeController, InvitesPublicController } from './assessments.controller'
import { AssessmentsService } from './assessments.service'

@Module({
  imports: [PrismaModule, SqlRunnerModule],
  controllers: [AssessmentsAdminController, AssessmentsMeController, InvitesPublicController, InvitesMeController],
  providers: [AssessmentsService],
})
export class AssessmentsModule {}
