import { describe, expect, it, vi } from 'vitest'
import { isFramed, postToParent, type FrameWindow } from './frame'

function framed(referrer: string) {
  const postMessage = vi.fn()
  const win: FrameWindow = { parent: { postMessage }, document: { referrer } }
  return { win, postMessage }
}

describe('postToParent', () => {
  it('posts to the embedding page’s origin when in a frame', () => {
    const { win, postMessage } = framed('https://delaware.learndifferently.tech/lms/courses/x')
    expect(isFramed(win)).toBe(true)
    expect(postToParent(win, { subject: 'spark.lesson.finished' })).toBe(true)
    expect(postMessage).toHaveBeenCalledWith(
      { subject: 'spark.lesson.finished' },
      'https://delaware.learndifferently.tech'
    )
  })

  it('posts to any origin when the browser did not say who embeds it', () => {
    const { win, postMessage } = framed('')
    postToParent(win, { subject: 'spark.lesson.resize', height: 512 })
    expect(postMessage).toHaveBeenCalledWith({ subject: 'spark.lesson.resize', height: 512 }, '*')
  })

  it('does nothing when the player is not in a frame', () => {
    const postMessage = vi.fn()
    const win = { document: { referrer: '' }, postMessage } as unknown as FrameWindow & {
      parent: unknown
    }
    win.parent = win
    expect(isFramed(win)).toBe(false)
    expect(postToParent(win, { subject: 'spark.lesson.finished' })).toBe(false)
    expect(postMessage).not.toHaveBeenCalled()
  })
})
