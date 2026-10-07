import { describe, expect, it } from 'vitest'
import {
  canReject,
  canToggle,
  describeChange,
  enableConfirmCopy,
  formatDate,
  platformStatus,
  rejectConfirmCopy,
  sortPlatforms,
} from '../ltiPlatforms'

describe('platformStatus', () => {
  it('labels registered platforms On or Off', () => {
    expect(platformStatus({ enabled: true, source: 'registered', approvedAt: 'x' })).toEqual({
      label: 'On',
      tone: 'on',
    })
    expect(platformStatus({ enabled: false, source: 'registered', approvedAt: 'x' })).toEqual({
      label: 'Off',
      tone: 'off',
    })
  })
  it('labels a never-approved platform Waiting for approval', () => {
    expect(platformStatus({ enabled: false, source: 'registered', approvedAt: null }).label).toBe(
      'Waiting for approval'
    )
  })
  it('labels the built-in platform Built in whatever its flag', () => {
    expect(platformStatus({ enabled: true, source: 'built-in', approvedAt: null }).label).toBe(
      'Built in'
    )
    expect(canToggle({ source: 'built-in' })).toBe(false)
    expect(canToggle({ source: 'registered' })).toBe(true)
  })
})

describe('enableConfirmCopy', () => {
  it('names the issuer being trusted', () => {
    const c = enableConfirmCopy({
      name: 'Canvas',
      issuer: 'https://canvas.example.edu',
      approvedAt: 'x',
    })
    expect(c.title).toContain('Canvas')
    expect(c.body).toContain('https://canvas.example.edu')
    expect(c.body).not.toContain('never been approved')
  })
  it('says so when the platform has never been approved', () => {
    const c = enableConfirmCopy({ name: 'Canvas', issuer: 'https://c.edu', approvedAt: null })
    expect(c.body).toContain('Canvas has never been approved')
  })
})

describe('sortPlatforms', () => {
  it('puts waiting platforms first and keeps the rest in order', () => {
    const r = (id: string, enabled: boolean, approvedAt: string | null) => ({
      id,
      enabled,
      approvedAt,
      source: 'registered' as const,
    })
    const out = sortPlatforms([
      r('a', true, 'x'),
      r('b', false, null),
      r('c', false, 'x'),
      r('d', false, null),
    ])
    expect(out.map((p) => p.id)).toEqual(['b', 'd', 'a', 'c'])
  })
})

describe('describeChange', () => {
  it('writes plain sentences', () => {
    expect(describeChange({ action: 'enabled', userName: 'Chow' })).toBe('Chow switched it on')
    expect(describeChange({ action: 'disabled', userName: 'Chow' })).toBe('Chow switched it off')
    expect(describeChange({ action: 'updated', userName: 'Chow' })).toBe('Chow changed its details')
    expect(describeChange({ action: 'created', userName: null })).toBe('It registered itself')
    expect(describeChange({ action: 'created', userName: 'Chow' })).toBe('Chow added it')
  })
  it('falls back to Someone when the name is missing', () => {
    expect(describeChange({ action: 'enabled', userName: null })).toBe('Someone switched it on')
    expect(describeChange({ action: 'disabled', userName: '  ' })).toBe('Someone switched it off')
  })
})

describe('formatDate', () => {
  it('formats and tolerates bad input', () => {
    expect(formatDate('2026-10-07T12:00:00Z')).toBe('7 Oct 2026')
    expect(formatDate('nope')).toBe('')
    expect(formatDate(null)).toBe('')
  })
})

describe('reject', () => {
  it('is offered only while waiting for approval', () => {
    expect(canReject({ enabled: false, source: 'registered', approvedAt: null })).toBe(true)
    expect(canReject({ enabled: false, source: 'registered', approvedAt: 'x' })).toBe(false)
    expect(canReject({ enabled: true, source: 'registered', approvedAt: 'x' })).toBe(false)
    expect(canReject({ enabled: true, source: 'built-in', approvedAt: null })).toBe(false)
  })
  it('has plain wording', () => {
    expect(rejectConfirmCopy({ name: 'Canvas' }).title).toBe('Reject Canvas?')
    expect(describeChange({ action: 'rejected', userName: 'Chow' })).toBe('Chow rejected it')
  })
})
