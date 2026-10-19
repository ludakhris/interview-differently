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

describe('DatasetsService request bodies', () => {
  const fit = { ok: true, error: null, peakMb: 1, limitMb: 2_048 }

  it('refuses setupSql, slug, name or description of the wrong type with a 400', async () => {
    const { svc, runner } = setup(fit)
    await expect(svc.validate({ sql: 'x' } as never)).rejects.toThrow(BadRequestException)
    const base = { slug: 'ds', name: 'DS', setupSql: 'create table t(x int);' }
    for (const over of [
      { slug: 5 },
      { name: ['DS'] },
      { name: 'x'.repeat(501) },
      { description: { a: 1 } },
      { setupSql: 7 },
    ])
      await expect(svc.create({ ...base, ...over } as never, null)).rejects.toThrow(
        BadRequestException
      )
    expect(runner.introspect).not.toHaveBeenCalled()
  })

  it('refuses cohortIds that are not a list of ids with a 400', async () => {
    const prisma = { dataset: { findUnique: jest.fn() }, $transaction: jest.fn() }
    const svc = new DatasetsService(prisma as never, {} as never, {} as never)
    await expect(svc.setCohorts('d1', 'c1' as never, null)).rejects.toThrow(BadRequestException)
    await expect(svc.setCohorts('d1', [1] as never, null)).rejects.toThrow(BadRequestException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
