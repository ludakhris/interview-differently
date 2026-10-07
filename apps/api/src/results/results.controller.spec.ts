import { MemoryLtiStore } from '../lti/lti-store'
import { ResultsController } from './results.controller'

function setup() {
  const results = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- typed so tests can read the 2nd arg
    create: jest.fn(async (d: object, _o?: object) => d),
    createAttempt: jest.fn(async (d: object) => d),
  }
  const ctrl = new ResultsController(results as never, {} as never, new MemoryLtiStore())
  return { ctrl, results }
}
const lti = (sub = 'u1') => ({ userId: sub, lti: { ref: 'S1' } }) as never
const body = { scenarioId: 'S1', track: 't' } as never

describe('ResultsController', () => {
  it('rate limits an LTI session to 20 a minute on createAttempt, per learner', async () => {
    const { ctrl } = setup()
    const call = (r: Parameters<ResultsController['create']>[0]) => ctrl.createAttempt(r, body)
    for (let i = 0; i < 20; i++) await call(lti())
    await expect(call(lti())).rejects.toMatchObject({ status: 429 })
    await expect(call(lti('u2'))).resolves.toBeDefined()
  })

  it('counts the two routes separately and never limits a normal user', async () => {
    const { ctrl } = setup()
    for (let i = 0; i < 20; i++) await ctrl.create(lti(), body)
    await expect(ctrl.createAttempt(lti(), body)).resolves.toBeDefined()
    for (let i = 0; i < 30; i++) await ctrl.create({ userId: 'u1' } as never, body)
  })
})
