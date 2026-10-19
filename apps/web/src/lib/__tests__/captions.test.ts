import { describe, expect, it } from 'vitest'
import { captionLines, captionsVtt } from '../captions'

describe('captions for an avatar clip', () => {
  it('splits the script into sentences and breaks long ones at words', () => {
    const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ') + '.'
    const lines = captionLines(`Hello there. How are you? ${long}`)
    expect(lines.slice(0, 2)).toEqual(['Hello there.', 'How are you?'])
    expect(lines.length).toBeGreaterThan(3)
    expect(lines.every((l) => l.length <= 90)).toBe(true)
    expect(lines.slice(2).join(' ')).toBe(long)
  })

  it('times the lines across the whole clip, ending at its duration', () => {
    const vtt = captionsVtt('One. Two two two.', 10)!
    expect(vtt.startsWith('WEBVTT\n\n00:00:00.000 --> ')).toBe(true)
    expect(vtt).toContain('--> 00:00:10.000 line:78%\nTwo two two.')
  })

  it('gives nothing for an empty script or an unknown duration', () => {
    expect(captionsVtt('  ', 10)).toBeNull()
    expect(captionsVtt('Hi.', NaN)).toBeNull()
  })
})
