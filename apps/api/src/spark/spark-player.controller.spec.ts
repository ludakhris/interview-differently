import type { SparkPlayerRequest } from './spark-player.guard'
import { SparkPlayerController } from './spark-player.controller'
import type { SparkService } from './spark.service'

// The player's event route: a learner's link records, a reviewer's preview link records nothing.

const learner = { sub: 'learner-1', cohortId: 'c1', itemId: 'i1', useId: 'u1', exp: 9e9 }
const preview = { preview: true as const, sub: 'reviewer-1', lessonId: 'l1', exp: 9e9 }

function setup() {
  const spark = { recordEvent: jest.fn(async () => true) }
  return { spark, controller: new SparkPlayerController(spark as unknown as SparkService) }
}
const req = (sparkPlayer: SparkPlayerRequest['sparkPlayer']): SparkPlayerRequest => ({
  headers: {},
  sparkPlayer,
})

describe('SparkPlayerController.event', () => {
  it('records what a learner link sends', async () => {
    const { spark, controller } = setup()
    await controller.event(req(learner), { event: 'start', scene: 0 })
    expect(spark.recordEvent).toHaveBeenCalledWith(learner, { event: 'start', scene: 0 })
  })

  it('answers a preview link without recording anything, even for an unknown event', async () => {
    const { spark, controller } = setup()
    await expect(controller.event(req(preview), { event: 'finish', scene: 2 })).resolves.toBe(
      undefined
    )
    await expect(controller.event(req(preview), { event: 'nonsense' })).resolves.toBe(undefined)
    expect(spark.recordEvent).not.toHaveBeenCalled()
  })

  it('refuses an event a learner link sends that the player never sends', async () => {
    const { spark, controller } = setup()
    spark.recordEvent.mockResolvedValueOnce(false)
    await expect(controller.event(req(learner), { event: 'nonsense' })).rejects.toThrow(
      'Unknown lesson event'
    )
  })
})
