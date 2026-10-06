import { describe, expect, it, vi } from 'vitest'
import {
  attemptLine,
  onPageRestore,
  parseAttempts,
  parseTimeLimit,
  timeLimitNote,
  toolConfig,
  toolCopy,
  toolItemLabel,
  toolLabelable,
  toolRefProblem,
} from './toolKinds'

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
    expect(toolCopy({ name: 'X', attemptsAllowed: 2 })).toEqual({
      intro:
        'This assessment runs in Interview Differently. You will go there, then come back here with your score.',
      start: 'Start the assessment',
    })
    expect(toolCopy({ name: 'Interview Differently', attemptsAllowed: null }).start).toBe(
      'Start in Interview Differently'
    )
  })

  it('parses the attempts field to 1-5, defaulting to 1', () => {
    expect(parseAttempts('3')).toBe(3)
    expect([
      parseAttempts(''),
      parseAttempts('0'),
      parseAttempts('6'),
      parseAttempts('2.5'),
    ]).toEqual([1, 1, 1, 1])
  })

  it('parses an optional time limit of 5-240 whole minutes', () => {
    expect(parseTimeLimit('')).toBeUndefined()
    expect(parseTimeLimit('45')).toBe(45)
    expect([parseTimeLimit('4'), parseTimeLimit('241'), parseTimeLimit('x')]).toEqual([
      undefined,
      undefined,
      undefined,
    ])
  })

  it('words the attempt line and the time limit note', () => {
    expect(attemptLine(0, 3, false)).toBe('Attempt 1 of 3')
    expect(attemptLine(1, 3, false)).toBe('Attempt 2 of 3')
    expect(attemptLine(1, 3, true)).toBe('Attempts used: 1 of 3')
    expect(attemptLine(3, 3, true)).toBe('Attempts used: 3 of 3')
    expect(timeLimitNote(30)).toBe('Time limit: 30 minutes')
    expect(timeLimitNote(null)).toBeNull()
  })
})

describe('toolRefProblem', () => {
  it('refuses an empty, blank or placeholder reference', () => {
    for (const ref of ['', '   ', 'assessment-slug', ' interview-id ']) {
      expect(toolRefProblem(ref)).toMatch(/reference/)
    }
  })
  it('accepts a real reference', () => {
    expect(toolRefProblem('cna-pre')).toBeNull()
    expect(toolRefProblem(' decision-sim ')).toBeNull()
  })
})

describe('toolConfig', () => {
  const f = {
    toolId: 'id-interview',
    ref: ' voice ',
    skill: '',
    attempts: '3',
    timeLimit: '30',
    countsAsInterview: false,
  }
  it('keeps the interview flag only when ticked on a non-assessment tool', () => {
    expect(toolConfig(f)).toEqual({ toolId: 'id-interview', ref: 'voice' })
    expect(toolConfig({ ...f, countsAsInterview: true })).toEqual({
      toolId: 'id-interview',
      ref: 'voice',
      countsAsInterview: true,
    })
  })
  it('keeps attempt rules, not the interview flag, for an assessment tool', () => {
    expect(
      toolConfig({ ...f, toolId: 'id-assessment', skill: 'sql', countsAsInterview: true })
    ).toEqual({
      toolId: 'id-assessment',
      ref: 'voice',
      skill: 'sql',
      maxAttempts: 3,
      timeLimitMinutes: 30,
    })
  })
})

describe('onPageRestore', () => {
  const pageshow = (persisted: boolean) =>
    Object.assign(new Event('pageshow'), { persisted }) as Event

  it('resets only when the page comes back from the back/forward cache', () => {
    const target = new EventTarget()
    const reset = vi.fn()
    onPageRestore(target, reset)
    target.dispatchEvent(pageshow(false))
    expect(reset).not.toHaveBeenCalled()
    target.dispatchEvent(pageshow(true))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('stops listening once cleaned up', () => {
    const target = new EventTarget()
    const reset = vi.fn()
    onPageRestore(target, reset)()
    target.dispatchEvent(pageshow(true))
    expect(reset).not.toHaveBeenCalled()
  })
})
