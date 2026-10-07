// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startHeartbeat, type Heartbeat } from './heartbeat'

const target = { cohortId: 'c1', itemId: 'i1' }
let send: ReturnType<typeof vi.fn>
let hb: Heartbeat | null = null
let state: DocumentVisibilityState = 'visible'

function start() {
  hb = startHeartbeat({ send: send as never })
  hb.setTarget(target)
  return hb
}
const input = (type = 'pointerdown') => document.dispatchEvent(new Event(type))
const setVisibility = (v: DocumentVisibilityState) => {
  state = v
  document.dispatchEvent(new Event('visibilitychange'))
}
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms)

beforeEach(() => {
  vi.useFakeTimers()
  state = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  send = vi.fn().mockResolvedValue(undefined)
})
afterEach(() => {
  hb?.stop()
  hb = null
  vi.useRealTimers()
})

describe('heartbeat', () => {
  it('sends nothing until the learner does something', async () => {
    start()
    await tick(5 * 60_000)
    expect(send).not.toHaveBeenCalled()
  })

  it('sends on first activity, then every 30 s while active', async () => {
    start()
    input()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenLastCalledWith(target, false)
    for (let i = 0; i < 4; i++) {
      await tick(15_000)
      input('keydown')
      await tick(15_000)
    }
    // first activity + one per 30 s over 120 s
    expect(send).toHaveBeenCalledTimes(5)
  })

  it('stops after 60 s without input and sends again on the next input', async () => {
    start()
    input()
    await tick(30_000)
    expect(send).toHaveBeenCalledTimes(2) // input at 0 is still recent at 30 s
    await tick(30_000)
    expect(send).toHaveBeenCalledTimes(3) // 60 s: still within the window
    await tick(30_000)
    expect(send).toHaveBeenCalledTimes(3) // 90 s: idle
    await tick(120_000)
    expect(send).toHaveBeenCalledTimes(3)
    input('scroll')
    expect(send).toHaveBeenCalledTimes(4)
  })

  it('sends nothing while hidden, and restarts from the next input once visible', async () => {
    start()
    input()
    await tick(0)
    send.mockClear()
    setVisibility('hidden')
    // hidden after activity: one last keepalive beat, then silence
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenLastCalledWith(target, true)
    await tick(10 * 60_000)
    expect(send).toHaveBeenCalledTimes(1)
    input() // input events while hidden do not count
    expect(send).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    await tick(60_000)
    expect(send).toHaveBeenCalledTimes(1) // visible but no input yet after returning... input at hidden time is stale
    input()
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('does not send a final beat when the page is hidden while idle', async () => {
    start()
    await tick(5 * 60_000)
    setVisibility('hidden')
    expect(send).not.toHaveBeenCalled()
  })

  it('pagehide after recent activity sends one keepalive beat; idle sends none', async () => {
    start()
    input()
    await tick(0)
    send.mockClear()
    window.dispatchEvent(new Event('pagehide'))
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenLastCalledWith(target, true)
    send.mockClear()
    window.dispatchEvent(new Event('pagehide')) // already left: nothing more
    expect(send).not.toHaveBeenCalled()
  })

  it('backs off after failures, doubling to a cap, and resets after a success', async () => {
    send.mockRejectedValue(new Error('down'))
    start()
    input() // beat 1 fails; next in 60 s
    await tick(0)
    const keepActive = async (ms: number) => {
      let left = ms
      while (left > 0) {
        const step = Math.min(left, 20_000)
        await tick(step)
        input()
        left -= step
      }
    }
    await keepActive(59_000)
    expect(send).toHaveBeenCalledTimes(1) // not at 30 s
    await keepActive(2_000)
    expect(send).toHaveBeenCalledTimes(2) // at 60 s
    await keepActive(117_000)
    expect(send).toHaveBeenCalledTimes(2) // next 120 s after the last
    await keepActive(4_000)
    expect(send).toHaveBeenCalledTimes(3)
    // After many failures the gap stops growing at 5 minutes.
    await keepActive(10 * 60_000)
    const n = send.mock.calls.length
    await keepActive(5 * 60_000)
    expect(send.mock.calls.length - n).toBeLessThanOrEqual(2)
    // A success returns to 30 s: once one beat gets through, the next ones are about 30 s apart.
    let clock = 0
    const times: number[] = []
    send.mockImplementation(async () => {
      times.push(clock)
    })
    for (let i = 0; i < 24; i++) {
      await keepActive(20_000)
      clock += 20_000
    }
    expect(times.length).toBeGreaterThanOrEqual(4)
    const gaps = times.slice(1).map((t, k) => t - times[k])
    expect(Math.max(...gaps)).toBeLessThanOrEqual(60_000)
  })

  it('never sends overlapping beats and survives a send that throws', async () => {
    let resolve!: () => void
    send.mockImplementationOnce(() => new Promise<void>((r) => (resolve = r)))
    start()
    input()
    input('keydown')
    expect(send).toHaveBeenCalledTimes(1)
    resolve()
    await tick(0)
    send.mockImplementation(() => {
      throw new Error('sync boom')
    })
    await tick(30_000)
    expect(() => input()).not.toThrow()
  })

  it('sends nothing without a target and after stop', async () => {
    hb = startHeartbeat({ send: send as never })
    await tick(60_000)
    input()
    await tick(60_000)
    expect(send).not.toHaveBeenCalled()
    hb.stop()
    hb.setTarget(target)
    input()
    await tick(60_000)
    window.dispatchEvent(new Event('pagehide'))
    expect(send).not.toHaveBeenCalled()
  })

  it('moving to another item while active beats for the new item', async () => {
    const h = start()
    input()
    await tick(0)
    send.mockClear()
    h.setTarget({ cohortId: 'c1', itemId: 'i2' })
    expect(send).toHaveBeenCalledWith({ cohortId: 'c1', itemId: 'i2' }, false)
    send.mockClear()
    h.setTarget({ cohortId: 'c1', itemId: 'i2' }) // same page again: nothing
    expect(send).not.toHaveBeenCalled()
    h.setTarget(null)
    await tick(60_000)
    expect(send).not.toHaveBeenCalled()
  })
})
