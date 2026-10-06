import { describe, expect, it } from 'vitest'
import { interpretAssessmentComplete } from '../ltiService'

describe('interpretAssessmentComplete', () => {
  it('succeeds with the return link', () => {
    expect(interpretAssessmentComplete(200, { score: 80, returnUrl: 'https://ld.test/x' })).toEqual(
      { ok: true, returnUrl: 'https://ld.test/x' }
    )
  })
  it('treats 409 (already sent) as success, with or without a link', () => {
    expect(interpretAssessmentComplete(409, { returnUrl: 'https://ld.test/x' })).toEqual({
      ok: true,
      returnUrl: 'https://ld.test/x',
    })
    expect(interpretAssessmentComplete(409, null)).toEqual({ ok: true, returnUrl: null })
  })
  it('fails on errors and on a 200 without a usable link', () => {
    expect(interpretAssessmentComplete(500, null)).toEqual({ ok: false })
    expect(interpretAssessmentComplete(401, { returnUrl: 'https://ld.test/x' })).toEqual({
      ok: false,
    })
    expect(interpretAssessmentComplete(200, { score: 1 })).toEqual({ ok: false })
    expect(interpretAssessmentComplete(200, { returnUrl: 'javascript:alert(1)' })).toEqual({
      ok: false,
    })
  })
  it('drops a non-http return link on 409', () => {
    expect(interpretAssessmentComplete(409, { returnUrl: 'javascript:alert(1)' })).toEqual({
      ok: true,
      returnUrl: null,
    })
  })
})
