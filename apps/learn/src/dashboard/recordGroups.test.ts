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
  it('orders Course, then Skills, then Interview readiness', () => {
    const g = recordGroups(record)
    expect(g.map((x) => x.heading)).toEqual([null, 'Skills', 'Interview readiness'])
    expect(g.map((x) => x.rows.map((r) => r.label))).toEqual([
      ['Course'],
      ['Pre-assessment', 'Post-assessment', 'Change', 'Course target', 'Target score'],
      ['Practice interview (best)', 'Interview readiness'],
    ])
  })

  it('words the values from the record', () => {
    const rows = recordGroups(record).flatMap((x) => x.rows)
    const v = (l: string) => rows.find((r) => r.label === l)
    expect(v('Course')).toMatchObject({ value: 'In progress', yes: false })
    expect(v('Change')?.value).toBe('+30 % points')
    expect(v('Target score')).toMatchObject({ value: 'Reached', yes: true })
    expect(v('Interview readiness')).toMatchObject({ value: 'Keep practicing', yes: false })
  })

  it('has no practice list', () => {
    expect(JSON.stringify(recordGroups(record))).not.toMatch(/Practice and simulations/)
  })
})
