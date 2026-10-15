import { Inject, Injectable } from '@nestjs/common'
import {
  SIMULATOR_STATUS_PORT,
  SPARK_STATUS_PORT,
  type SimulatorStatus,
  type SparkStatus,
  type StatusPort,
} from '../core/status-port'
import { AccessService } from './access/access.service'
import type { SystemStatus } from './learn-types'

/**
 * System admin tool (GitHub issue #92): System status, how each product is doing. Each product answers for itself
 * through its status port in core (the Skill Simulator for grading, Spark for lessons); this gathers them and imports
 * neither.
 */
@Injectable()
export class AdminStatusService {
  constructor(
    private readonly access: AccessService,
    @Inject(SIMULATOR_STATUS_PORT) private readonly simulator: StatusPort<SimulatorStatus>,
    @Inject(SPARK_STATUS_PORT) private readonly spark: StatusPort<SparkStatus>
  ) {}

  async status(actorRole: string | undefined): Promise<SystemStatus> {
    this.access.requireSystemAdmin({ userId: '', role: actorRole })
    const [simulator, spark] = await Promise.all([this.simulator.status(), this.spark.status()])
    return { simulator, spark }
  }
}
