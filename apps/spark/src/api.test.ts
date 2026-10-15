import { afterEach, describe, expect, it, vi } from 'vitest'
import { postEventWithRetry } from './api'

const reply = (status: number) =>
  new Response(status === 204 ? null : JSON.stringify({ message: 'nope' }), { status })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('postEventWithRetry', () => {
  it('tries a second time when the first try fails', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(reply(204))
    vi.stubGlobal('fetch', fetch)
    await expect(postEventWithRetry('tok', { event: 'finish', scene: 2 })).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer spark.tok' },
      body: JSON.stringify({ event: 'finish', scene: 2 }),
    })
  })

  it('rejects when the server refuses both tries', async () => {
    const fetch = vi.fn(async () => reply(500))
    vi.stubGlobal('fetch', fetch)
    await expect(postEventWithRetry('tok', { event: 'finish' })).rejects.toThrow('nope')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
