import { BadRequestException } from '@nestjs/common'
import {
  cohortStatus,
  endsAtFor,
  newJoinKey,
  validateCohortFields,
  validateEmail,
} from './cohort-config'

describe('newJoinKey', () => {
  it('makes an 8-character code without look-alike characters', () => {
    for (let i = 0; i < 200; i++) {
      const k = newJoinKey()
      expect(k).toMatch(/^[A-HJKMNP-Z2-9]{8}$/)
    }
  })
})

describe('endsAtFor and cohortStatus', () => {
  const start = new Date('2026-10-05T00:00:00Z')
  it('ends a whole number of weeks after the start', () => {
    expect(endsAtFor(start, 16).toISOString()).toBe('2027-01-25T00:00:00.000Z')
  })

  it('is upcoming before the start, running between, completed after the end', () => {
    const end = endsAtFor(start, 4)
    expect(cohortStatus(start, end, new Date('2026-10-01T00:00:00Z'))).toBe('upcoming')
    expect(cohortStatus(start, end, new Date('2026-10-10T00:00:00Z'))).toBe('running')
    expect(cohortStatus(start, end, new Date('2026-11-02T00:00:00Z'))).toBe('completed')
  })
})

describe('validateCohortFields', () => {
  it('needs a course, a name and a real start date on create', () => {
    expect(
      validateCohortFields({ courseId: 'c1', name: ' Fall A ', startsAt: '2026-11-03' }, false)
    ).toEqual({
      courseId: 'c1',
      name: 'Fall A',
      startsAt: new Date('2026-11-03T00:00:00Z'),
    })
    expect(() => validateCohortFields({ name: 'x', startsAt: '2026-11-03' }, false)).toThrow(
      BadRequestException
    )
    expect(() => validateCohortFields({ courseId: 'c1', startsAt: '2026-11-03' }, false)).toThrow(
      BadRequestException
    )
    expect(() =>
      validateCohortFields({ courseId: 'c1', name: 'x', startsAt: '11/03/2026' }, false)
    ).toThrow(BadRequestException)
    expect(() =>
      validateCohortFields({ courseId: 'c1', name: 'x', startsAt: '2026-02-31' }, false)
    ).toThrow(BadRequestException)
  })

  it('lets an update leave fields out', () => {
    expect(validateCohortFields({ name: 'New name' }, true)).toEqual({ name: 'New name' })
  })
})

describe('validateEmail', () => {
  it('lowercases and trims, and rejects junk', () => {
    expect(validateEmail('  Ann@Example.COM ')).toBe('ann@example.com')
    expect(() => validateEmail('not an email')).toThrow(BadRequestException)
    expect(() => validateEmail(undefined)).toThrow(BadRequestException)
  })
})
