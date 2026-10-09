import { Global, Module } from '@nestjs/common'
import { SIMULATOR_FEED } from '../core/simulator-feed'
import { AssessmentsModule } from '../assessments/assessments.module'
import { ToolsModule } from '../tools/tools.module'
import { SimulatorFeedService } from './simulator-feed.service'

/** Global so the LMS can inject the feed by its token without importing anything from the Simulator. */
@Global()
@Module({
  imports: [AssessmentsModule, ToolsModule],
  providers: [{ provide: SIMULATOR_FEED, useClass: SimulatorFeedService }],
  exports: [SIMULATOR_FEED],
})
export class SimulatorFeedModule {}
