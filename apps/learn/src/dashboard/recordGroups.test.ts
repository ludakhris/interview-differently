import type { ReadinessRecord } from '@id/types'
import { describe, expect, it } from 'vitest'
import { recordGroups } from './recordGroups'

const record: ReadinessRecord = {
  pre: 50,
  post: 80,
  gain: 30,
  targetScore: 75,
  reachedTarget: true,
  interviewBest: 60,
  readinessThreshold: 70,
  interviewReady: false,
  completed: false,
}

describe('recordGroups', () => {
  it('orders Course, then Skills, then one Interview readiness line', () => {
    const g = recordGroups(record)
    expect(g.map((x) => x.heading)).toEqual([null, 'Skills', null])
    expect(g.map((x) => x.rows.map((r) => r.label))).toEqual([
      ['Course'],
      ['Pre-assessment', 'Post-assessment', 'Change', 'Post-assessment goal (75%)'],
      ['Interview readiness (goal 70%)'],
    ])
  })

  it('words the values from the record', () => {
    const rows = recordGroups(record).flatMap((x) => x.rows)
    const v = (l: string) => rows.find((r) => r.label === l)
    expect(v('Course')).toMatchObject({ value: 'In progress', yes: false })
    expect(v('Change')?.value).toBe('+30 % points')
    expect(v('Post-assessment goal (75%)')).toMatchObject({ value: 'Reached', yes: true })
    expect(v('Interview readiness (goal 70%)')).toMatchObject({
      value: 'Keep practicing (60%)',
      yes: false,
    })
    const ready = recordGroups({ ...record, interviewBest: 82, interviewReady: true })
    expect(ready.flatMap((x) => x.rows).at(-1)).toMatchObject({
      value: 'Ready to interview (82%)',
      yes: true,
    })
    const none = recordGroups({ ...record, interviewBest: null, interviewReady: false })
    expect(none.flatMap((x) => x.rows).at(-1)?.value).toBe('Not yet scored')
  })

  it('leaves out the assessments the course does not have', () => {
    const rows = (hasPre: boolean, hasPost: boolean) =>
      recordGroups(record, { hasPre, hasPost })
        .flatMap((x) => x.rows)
        .map((r) => r.label)
    expect(rows(true, false)).toEqual([
      'Course',
      'Pre-assessment',
      'Interview readiness (goal 70%)',
    ])
    expect(recordGroups(record, { hasPre: false, hasPost: false }).map((x) => x.heading)).toEqual([
      null,
      null,
    ])
  })

  it('has no practice list', () => {
    expect(JSON.stringify(recordGroups(record))).not.toMatch(/Practice and simulations/)
  })
})
