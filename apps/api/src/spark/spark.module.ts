import { Global, Module } from '@nestjs/common'
import { SPARK_PORT } from '../core/spark-port'
import { PrismaModule } from '../prisma/prisma.module'
import { SparkPlayerController } from './spark-player.controller'
import { SparkPlayerGuard } from './spark-player.guard'
import { SparkService } from './spark.service'

/** Global so the LMS can inject the port by its token without importing anything from Spark. */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [SparkPlayerController],
  providers: [SparkService, SparkPlayerGuard, { provide: SPARK_PORT, useExisting: SparkService }],
  exports: [SPARK_PORT],
})
export class SparkModule {}
