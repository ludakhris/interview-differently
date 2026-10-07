import { describe, expect, it, vi } from 'vitest'
import {
  attemptLine,
  onPageRestore,
  parseAttempts,
  parseTimeLimit,
  timeLimitNote,
  toolConfig,
  readyCopy,
  resultCopy,
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

  it('words an assessment around its attempt, its clock and the score coming back', () => {
    const c = readyCopy({ name: 'X', attemptsAllowed: 2, timeLimitMinutes: 30 }, 1)
    expect(c.start).toBe('Start the assessment')
    expect(c.points.map((p) => p.title)).toEqual([
      'Attempt 2 of 2',
      '30 minutes',
      'Your score comes back here',
    ])
    expect(
      readyCopy({ name: 'X', attemptsAllowed: 3, timeLimitMinutes: null }, 9).points[0].title
    ).toBe('Attempt 3 of 3')
    expect(
      readyCopy({ name: 'X', attemptsAllowed: 3, timeLimitMinutes: null }, 0).points[1].title
    ).toBe('No time limit')
  })

  it('words a lab as a retryable simulation', () => {
    const c = readyCopy(
      { name: 'Interview Differently', attemptsAllowed: null, timeLimitMinutes: null },
      4
    )
    expect(c.start).toBe('Start the simulation')
    expect(c.heading).toBe('Ready to try it?')
    expect(c.points[1].title).toBe('Retry as often as you like')
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

describe('resultCopy', () => {
  it('cheers by band and handles a missing score', () => {
    expect(resultCopy(92).heading).toBe('Nailed it!')
    expect(resultCopy(80).heading).toBe('Nailed it!')
    expect(resultCopy(65).heading).toBe('Solid work')
    expect(resultCopy(49).heading).toBe('Good start')
    expect(resultCopy(0).heading).toBe('Good start')
    expect(resultCopy(null).heading).toBe('Attempt recorded')
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
