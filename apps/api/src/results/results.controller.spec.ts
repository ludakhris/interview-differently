import { MemoryLtiStore } from '../lti/lti-store'
import { ResultsController } from './results.controller'

function setup() {
  const results = {
    create: jest.fn(async (d: object, _o?: object) => d),
    createAttempt: jest.fn(async (d: object) => d),
  }
  const ctrl = new ResultsController(results as any, {} as any, new MemoryLtiStore())
  return { ctrl, results }
}
const lti = (sub = 'u1') => ({ userId: sub, lti: { ref: 'S1' } }) as any
const body = { scenarioId: 'S1', track: 't' } as any

describe('ResultsController', () => {
  it('flags LTI callers to the service', async () => {
    const { ctrl, results } = setup()
    await ctrl.create(lti(), body)
    await ctrl.create({ userId: 'u1' } as any, body)
    expect(results.create.mock.calls.map((c) => c[1])).toEqual([{ lti: true }, { lti: false }])
  })

  it.each([
    ['create', (c: ResultsController, r: any) => c.create(r, body)],
    ['createAttempt', (c: ResultsController, r: any) => c.createAttempt(r, body)],
  ])('rate limits an LTI session to 20 a minute on %s, per learner', async (_n, call) => {
    const { ctrl } = setup()
    for (let i = 0; i < 20; i++) await call(ctrl, lti())
    await expect(call(ctrl, lti())).rejects.toMatchObject({ status: 429 })
    await expect(call(ctrl, lti('u2'))).resolves.toBeDefined()
  })

  it('counts the two routes separately and never limits a normal user', async () => {
    const { ctrl } = setup()
    for (let i = 0; i < 20; i++) await ctrl.create(lti(), body)
    await expect(ctrl.createAttempt(lti(), body)).resolves.toBeDefined()
    for (let i = 0; i < 30; i++) await ctrl.create({ userId: 'u1' } as any, body)
  })
})
