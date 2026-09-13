import { Module } from '@nestjs/common'
import { SqlRunnerService } from './sql-runner.service'

@Module({
  providers: [SqlRunnerService],
  exports: [SqlRunnerService],
})
export class SqlRunnerModule {}
