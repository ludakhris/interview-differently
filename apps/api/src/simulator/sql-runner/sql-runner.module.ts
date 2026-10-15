import { Global, Module } from '@nestjs/common'
import { SIMULATOR_STATUS_PORT } from '../../core/status-port'
import { GradingFailureLog } from './grading-failure-log'
import { GradingHealthController } from './grading-health.controller'
import { GradingHealthService } from './grading-health.service'
import { SqlRunnerService } from './sql-runner.service'

/** Global so the LMS can inject the Skill Simulator's status port by its token without importing anything from it. */
@Global()
@Module({
  // GET /health/grading (GitHub issue #92)
  controllers: [GradingHealthController],
  providers: [
    SqlRunnerService,
    GradingFailureLog,
    GradingHealthService,
    { provide: SIMULATOR_STATUS_PORT, useExisting: GradingHealthService },
  ],
  exports: [SqlRunnerService, SIMULATOR_STATUS_PORT],
})
export class SqlRunnerModule {}
