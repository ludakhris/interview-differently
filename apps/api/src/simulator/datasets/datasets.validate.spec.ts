import { BadRequestException } from '@nestjs/common'
import { DatasetsService } from './datasets.service'
import type { DatasetFit, SqlRunnerService } from '../sql-runner/sql-runner.service'

// A dataset must load in a grading process with room for queries before it is saved (GitHub issue #92).
function setup(fit: DatasetFit) {
  const runner = {
    introspect: jest.fn(async () => [{ table: 't', columns: [], rowCount: 0 }]),
    measure: jest.fn(async () => fit),
  }
  return {
    svc: new DatasetsService({} as never, {} as never, runner as unknown as SqlRunnerService),
    runner,
  }
}

describe('DatasetsService.validate', () => {
  it('accepts a dataset that leaves room for queries', async () => {
    const { svc, runner } = setup({ ok: true, error: null, peakMb: 1_300, limitMb: 2_048 })
    expect(await svc.validate('create table t(x int);')).toHaveLength(1)
    expect(runner.measure).toHaveBeenCalledWith('create table t(x int);')
  })

  it('refuses a dataset that would leave less than the headroom', async () => {
    const { svc } = setup({ ok: true, error: null, peakMb: 1_700, limitMb: 2_048 })
    await expect(svc.validate('big')).rejects.toThrow(
      'The dataset is too large to grade on: it needs about 1700 MB, and grading allows 1536 MB. Make it smaller.'
    )
  })

  it('refuses a dataset that would not load in a grading process', async () => {
    const { svc } = setup({
      ok: false,
      error: 'The practice database could not be loaded.',
      peakMb: null,
      limitMb: 2_048,
    })
    await expect(svc.validate('x')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('accepts a dataset when memory cannot be read here', async () => {
    const { svc } = setup({ ok: true, error: null, peakMb: null, limitMb: 2_048 })
    expect(await svc.validate('x')).toHaveLength(1)
  })
})
