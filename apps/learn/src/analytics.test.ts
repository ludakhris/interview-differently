import { describe, expect, it } from 'vitest'
import { beforeSend, scrubUrl } from './analytics'

const base = 'https://learndifferently.tech'

describe('scrubUrl', () => {
  it('drops the query string and hash', () => {
    expect(scrubUrl(`${base}/sign-in?redirect_url=%2Flms%2Ftalent%2Fuser_1#x`)).toBe(
      `${base}/sign-in`
    )
  })

  it('masks the learner id in a learner record', () => {
    expect(scrubUrl(`${base}/lms/cohorts/c1/learners/user_2abc`)).toBe(
      `${base}/lms/cohorts/c1/learners/:userId`
    )
  })

  it('masks the participant id on the talent page but not its fixed pages', () => {
    expect(scrubUrl(`${base}/lms/talent/user_2abc`)).toBe(`${base}/lms/talent/:userId`)
    expect(scrubUrl(`${base}/lms/talent/support`)).toBe(`${base}/lms/talent/support`)
    expect(scrubUrl(`${base}/lms/talent`)).toBe(`${base}/lms/talent`)
  })

  it('leaves other pages alone', () => {
    expect(scrubUrl(`${base}/lms/courses/abc`)).toBe(`${base}/lms/courses/abc`)
  })

  it('passes a non-URL through unchanged', () => {
    expect(scrubUrl('nope')).toBe('nope')
  })
})

describe('beforeSend', () => {
  it('keeps the event type and scrubs the url', () => {
    expect(beforeSend({ type: 'pageview', url: `${base}/lms/talent/u1?x=1` })).toEqual({
      type: 'pageview',
      url: `${base}/lms/talent/:userId`,
    })
  })
})
