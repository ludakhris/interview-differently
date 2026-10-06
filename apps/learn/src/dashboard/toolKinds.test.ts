import { describe, expect, it } from 'vitest'
import { toolCopy, toolItemLabel, toolLabelable } from './toolKinds'

describe('toolKinds', () => {
  it('only the assessment tool is labelable', () => {
    expect(toolLabelable('id-assessment')).toBe(true)
    expect(toolLabelable('id-interview')).toBe(false)
    expect(toolLabelable('nope')).toBe(false)
  })

  it('saves a pre/post label only for a labelable tool', () => {
    expect(toolItemLabel('id-assessment', 'post')).toBe('post')
    expect(toolItemLabel('id-interview', 'post')).toBeNull()
  })

  it('uses assessment wording when the tool has no retries', () => {
    expect(toolCopy({ name: 'X', retries: false })).toEqual({
      intro:
        'This assessment runs in Interview Differently. You will go there, then come back here with your score.',
      start: 'Start the assessment',
    })
    expect(toolCopy({ name: 'Interview Differently', retries: true }).start).toBe(
      'Start in Interview Differently'
    )
  })
})
