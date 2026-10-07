import { describe, expect, it } from 'vitest'
import { filterWorkspaces, kindOf, textMatch } from './workspaceFilter'

const w = (id: string, name: string, kind: string, parentId: string | null = null) => ({
  id,
  name,
  kind,
  subdomain: name.toLowerCase().replace(/\s+/g, ''),
  parentId,
  parentName: parentId === 'a1' ? 'Delaware Department of Labor' : null,
})
const list = [
  w('a1', 'Delaware Department of Labor', 'agency'),
  w('p1', 'Lantern Hill Tech Academy', 'provider', 'a1'),
  w('o1', 'Harbor Point', 'organization', 'a1'),
  w('o2', 'Delaware State University', 'academic', 'a1'),
  w('x1', 'Independent Co', 'provider'),
]
const names = (r: ReturnType<typeof filterWorkspaces>) => ({
  trees: r.trees.map((t) => [t.agency.id, t.kids.map((k) => k.id)]),
  standalone: r.standalone.map((s) => s.id),
})

describe('workspace search', () => {
  it('shows everything for a blank search', () => {
    const r = filterWorkspaces(list, '  ', 'all')
    expect(names(r)).toEqual({
      trees: [['a1', ['p1', 'o1', 'o2']]],
      standalone: ['x1'],
    })
    expect(r.shown).toBe(5)
  })

  it('finds by name, case and word order aside, and keeps the agency for context', () => {
    expect(names(filterWorkspaces(list, 'TECH lantern', 'all'))).toEqual({
      trees: [['a1', ['p1']]],
      standalone: [],
    })
  })

  it('shows all of an agency when the agency itself matches', () => {
    expect(names(filterWorkspaces(list, 'labor', 'all')).trees).toEqual([
      ['a1', ['p1', 'o1', 'o2']],
    ])
  })

  it('searches by type word and by the agency a workspace reports to', () => {
    expect(textMatch(list[2], 'organization')).toBe(true)
    expect(textMatch(list[1], 'delaware department')).toBe(true)
    expect(textMatch(list[4], 'delaware')).toBe(false)
  })

  it('filters by type, counting colleges as organizations', () => {
    expect(names(filterWorkspaces(list, '', 'organization')).trees).toEqual([['a1', ['o1', 'o2']]])
    expect(names(filterWorkspaces(list, '', 'provider'))).toEqual({
      trees: [['a1', ['p1']]],
      standalone: ['x1'],
    })
    expect(kindOf('academic')).toBe('organization')
  })

  it('shows only the agency for the agency type, and nothing when nothing matches', () => {
    const r = filterWorkspaces(list, '', 'agency')
    expect(names(r)).toEqual({ trees: [['a1', []]], standalone: [] })
    expect(r.shown).toBe(1)
    expect(filterWorkspaces(list, 'zzz', 'all').shown).toBe(0)
  })
})
