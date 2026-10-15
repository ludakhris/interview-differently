import { describe, expect, it } from 'vitest'
import { diffPaths } from './planDiff'

describe('diffPaths', () => {
  it('finds nothing to animate on the first look', () => {
    const d = diffPaths(null, { a: 'todo' })
    expect([...d.entered, ...d.skipped, ...d.changed]).toEqual([])
  })

  it('separates added, skipped and otherwise changed items', () => {
    const d = diffPaths(
      { a: 'todo', b: 'todo', c: 'todo' },
      { a: 'skipped', b: 'completed', c: 'todo', 'added:x': 'not_started' }
    )
    expect([...d.skipped]).toEqual(['a'])
    expect([...d.changed]).toEqual(['b'])
    expect([...d.entered]).toEqual(['added:x'])
  })
})
