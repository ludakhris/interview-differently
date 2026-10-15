import 'reflect-metadata'
import { ForbiddenException } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import type { SimulatorStatus, SparkStatus, StatusPort } from '../core/status-port'
import { LearnGuard } from '../auth/learn.guard'
import { ACCESS_METADATA } from './access/access.decorator'
import { AccessService } from './access/access.service'
import { SYSTEM_ADMIN } from './access/permissions'
import { AdminStatusController } from './admin-status.controller'
import { AdminStatusService } from './admin-status.service'

// System status: a system admin sees how each product is doing, each through its own status port in core
// (GitHub issue #92).

const simulator: SimulatorStatus = {
  grading: {
    selfTest: {
      status: 'ok',
      reason: null,
      peakMb: 1_300,
      limitMb: 2_048,
      checkedAt: '2026-10-15T15:00:00.000Z',
    },
    failures: {
      windowHours: 24,
      count: 1,
      perHour: [...new Array<number>(18).fill(0), 1, 0, 0, 0, 0, 0],
      latest: [
        {
          at: '2026-10-15T09:30:00.000Z',
          reason: 'Grading is busy. Try again in a moment.',
          kind: 'busy',
        },
      ],
    },
    lastFailureAt: '2026-10-15T09:30:00.000Z',
  },
}

const spark: SparkStatus = {
  setup: { status: 'ok', problems: [] },
  player: { status: 'ok', reason: null, checkedAt: '2026-10-15T15:00:00.000Z' },
  lessons: {
    failures: { windowHours: 24, count: 0, perHour: new Array<number>(24).fill(0), latest: [] },
    lastFailureAt: null,
  },
}

function setup() {
  const simulatorPort = { status: jest.fn(async () => simulator) }
  const sparkPort = { status: jest.fn(async () => spark) }
  const service = new AdminStatusService(
    new AccessService({} as never),
    simulatorPort as unknown as StatusPort<SimulatorStatus>,
    sparkPort as unknown as StatusPort<SparkStatus>
  )
  return { service, simulatorPort, sparkPort }
}

describe('AdminStatusService', () => {
  it("gives a system admin each product's status, from its own port", async () => {
    const { service, simulatorPort, sparkPort } = setup()
    expect(await service.status(SYSTEM_ADMIN)).toEqual({ simulator, spark })
    expect(simulatorPort.status).toHaveBeenCalledTimes(1)
    expect(sparkPort.status).toHaveBeenCalledTimes(1)
  })

  it('refuses anyone else, without asking any product', async () => {
    const { service, simulatorPort, sparkPort } = setup()
    for (const role of [undefined, 'provider-admin', 'instructor', 'student'])
      await expect(service.status(role)).rejects.toBeInstanceOf(ForbiddenException)
    expect(simulatorPort.status).not.toHaveBeenCalled()
    expect(sparkPort.status).not.toHaveBeenCalled()
  })
})

describe('AdminStatusController', () => {
  it('is behind the Learn guard and open to platform admins only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminStatusController)).toEqual([LearnGuard])
    expect(Reflect.getMetadata('path', AdminStatusController)).toBe('learn/admin/status')
    expect(Reflect.getMetadata(ACCESS_METADATA, AdminStatusController.prototype.status)).toEqual({
      kind: 'action',
      action: 'platform.admin',
    })
  })
})
