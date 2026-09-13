import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { SqlRunnerModule } from '../sql-runner/sql-runner.module'
import { DatasetsAdminController, DatasetsMeController } from './datasets.controller'
import { DatasetsService } from './datasets.service'

@Module({
  imports: [PrismaModule, SqlRunnerModule],
  controllers: [DatasetsAdminController, DatasetsMeController],
  providers: [DatasetsService],
})
export class DatasetsModule {}
