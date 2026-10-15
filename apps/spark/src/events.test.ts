import { describe, expect, it, vi } from 'vitest'
import { eventSender } from './events'

const finish = { event: 'finish', scene: 2, voice: 'browser' } as const

describe('eventSender', () => {
  it('tells the LMS page only after the server has stored the finish', async () => {
    let store: () => void = () => undefined
    const post = vi.fn(() => new Promise<void>((resolve) => (store = resolve)))
    const tell = vi.fn()
    const done = eventSender(post, tell).finish(finish)
    await Promise.resolve()
    expect(post).toHaveBeenCalledWith(finish)
    expect(tell).not.toHaveBeenCalled()
    store()
    expect(await done).toBe(true)
    expect(tell).toHaveBeenCalledTimes(1)
  })

  it('stores the scene events still on their way before the finish', async () => {
    const order: string[] = []
    let storeScene: () => void = () => undefined
    const post = vi.fn((input: { event: string }) =>
      input.event === 'scene'
        ? new Promise<void>((resolve) => (storeScene = resolve)).then(() => {
            order.push('scene')
          })
        : Promise.resolve().then(() => {
            order.push(input.event)
          })
    )
    const sender = eventSender(post, () => order.push('told'))
    sender.send({ event: 'scene', scene: 2 })
    const done = sender.finish(finish)
    await Promise.resolve()
    expect(post).toHaveBeenCalledTimes(1)
    storeScene()
    await done
    expect(order).toEqual(['scene', 'finish', 'told'])
  })

  it('never tells the LMS page when the finish could not be stored, and a lost scene does not block it', async () => {
    const tell = vi.fn()
    const post = vi.fn(async (input: { event: string }) => {
      if (input.event === 'scene') throw new Error('offline')
      throw new Error('server error')
    })
    const sender = eventSender(post, tell)
    sender.send({ event: 'scene', scene: 0 })
    expect(await sender.finish(finish)).toBe(false)
    expect(tell).not.toHaveBeenCalled()
  })
})
