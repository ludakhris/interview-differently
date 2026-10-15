import { Global, Module } from '@nestjs/common'
import { SPARK_PORT } from '../core/spark-port'
import { SPARK_STATUS_PORT } from '../core/status-port'
import { PrismaModule } from '../prisma/prisma.module'
import { LessonFailureLog } from './lesson-failure-log'
import { SparkHealthController } from './spark-health.controller'
import { SparkHealthService } from './spark-health.service'
import { SparkPlayerController } from './spark-player.controller'
import { SparkPlayerGuard } from './spark-player.guard'
import { SparkService } from './spark.service'

/** Global so the LMS can inject the ports by their tokens without importing anything from Spark. */
@Global()
@Module({
  imports: [PrismaModule],
  // GET /health/videos (GitHub issue #92)
  controllers: [SparkPlayerController, SparkHealthController],
  providers: [
    SparkService,
    SparkPlayerGuard,
    LessonFailureLog,
    SparkHealthService,
    { provide: SPARK_PORT, useExisting: SparkService },
    { provide: SPARK_STATUS_PORT, useExisting: SparkHealthService },
  ],
  exports: [SPARK_PORT, SPARK_STATUS_PORT],
})
export class SparkModule {}
