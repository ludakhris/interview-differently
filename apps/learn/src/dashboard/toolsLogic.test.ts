import { describe, expect, it } from 'vitest'
import {
  accessSummary,
  actionPhrase,
  changeLines,
  filterGroups,
  formatValue,
  groupWorkspaces,
  hiddenIds,
  hostOf,
  normalizeSelection,
  pickable,
  toggleWorkspace,
  truncate,
  type PickWs,
} from './toolsLogic'

const ws = (id: string, name: string, kind: string, parentId: string | null = null): PickWs => ({
  id,
  name,
  kind,
  parentId,
})
const all = [
  ws('a1', 'Zeta Agency', 'agency'),
  ws('a2', 'Alpha Agency', 'agency'),
  ws('p1', 'Brightside Training', 'provider', 'a2'),
  ws('p2', 'Coastal Careers', 'provider', 'a2'),
  ws('p3', 'Zed Works', 'provider', 'a1'),
  ws('p4', 'Loose Provider', 'provider'),
  ws('o1', 'Some College', 'academic', 'a2'),
]
const lookup = {
  workspaceName: (id: string) => all.find((w) => w.id === id)?.name ?? null,
  connectionName: (id: string) => (id === 'c1' ? 'Interview Differently' : null),
}

describe('workspace picker', () => {
  it('offers only agencies and providers', () => {
    expect(pickable(all).map((w) => w.id)).not.toContain('o1')
  })

  it('groups providers under their agency, A to Z, loose providers last', () => {
    const g = groupWorkspaces(pickable(all))
    expect(g.map((x) => x.agency?.id ?? null)).toEqual(['a2', 'a1', null])
    expect(g[0].providers.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(g[2].providers.map((p) => p.id)).toEqual(['p4'])
  })

  it('searches case-insensitively and keeps the agency when a provider matches', () => {
    const g = groupWorkspaces(pickable(all))
    const f = filterGroups(g, '  coastal ')
    expect(f).toHaveLength(1)
    expect(f[0].agency?.id).toBe('a2')
    expect(f[0].providers.map((p) => p.id)).toEqual(['p2'])
  })

  it('shows every provider of an agency that matches itself', () => {
    const f = filterGroups(groupWorkspaces(pickable(all)), 'ALPHA')
    expect(f[0].providers).toHaveLength(2)
  })

  it('returns nothing when nothing matches and everything for a blank search', () => {
    const g = groupWorkspaces(pickable(all))
    expect(filterGroups(g, 'nope')).toEqual([])
    expect(filterGroups(g, '   ')).toBe(g)
  })

  it('choosing an agency replaces its providers, and covered providers cannot be added', () => {
    const p = pickable(all)
    const agency = p.find((w) => w.id === 'a2')!
    expect(toggleWorkspace(['p1', 'p3'], agency, p)).toEqual(['p3', 'a2'])
    expect(toggleWorkspace(['a2'], p.find((w) => w.id === 'p2')!, p)).toEqual(['a2'])
    expect(toggleWorkspace(['a2'], agency, p)).toEqual([])
  })

  it('normalizes a stored list that selects a provider and its agency', () => {
    expect(normalizeSelection(['a2', 'p1', 'p3'], pickable(all))).toEqual(['a2', 'p3'])
  })

  it('finds ids the picker cannot show', () => {
    expect(hiddenIds(['p1', 'secret'], pickable(all))).toEqual(['secret'])
  })

  it('summarises availability', () => {
    expect(accessSummary([])).toBe('Every workspace')
    expect(accessSummary(['a'])).toBe('1 workspace')
    expect(accessSummary(['a', 'b', 'c'])).toBe('3 workspaces')
  })
})

describe('urls', () => {
  it('shows the host, or the text when it is not a URL', () => {
    expect(hostOf('https://tool.example.com/launch?x=1')).toBe('tool.example.com')
    expect(hostOf('not a url')).toBe('not a url')
  })
  it('truncates long text', () => {
    expect(truncate('abcdef', 4)).toBe('abc…')
    expect(truncate('abc', 4)).toBe('abc')
  })
})

describe('history wording', () => {
  it('words values for people', () => {
    expect(formatValue('enabled', false, lookup)).toBe('Off')
    expect(formatValue('retries', true, lookup)).toBe('Yes')
    expect(formatValue('kind', 'assessment', lookup)).toBe('Graded assessment')
    expect(formatValue('connectionId', 'c1', lookup)).toBe('Interview Differently')
    expect(formatValue('connectionId', 'c9', lookup)).toBe('c9')
    expect(formatValue('name', null, lookup)).toBe('none')
    expect(formatValue('workspaceIds', [], lookup)).toBe('Every workspace')
    expect(formatValue('workspaceIds', ['p1', 'gone'], lookup)).toBe(
      'Brightside Training, a workspace you cannot see'
    )
  })

  it('writes the action in words', () => {
    const base = { subject: 'tool', subjectName: 'X', changes: {} } as const
    expect(actionPhrase({ ...base, action: 'created' })).toBe('added tool X')
    expect(actionPhrase({ ...base, action: 'updated' })).toBe('changed tool X')
    expect(actionPhrase({ ...base, subject: 'connection', action: 'removed' })).toBe(
      'removed connection X'
    )
  })

  it('shows old and new for a change, only new for a create, only old for a removal', () => {
    const changes = {
      enabled: { from: true, to: false },
      loginUrl: { from: 'https://a', to: 'https://b' },
    }
    const upd = changeLines(
      { subject: 'tool', subjectName: 'X', action: 'updated', changes },
      lookup
    )
    expect(upd[0]).toEqual({ label: 'Status', from: 'On', to: 'Off' })
    expect(upd[1].label).toBe('Login URL')
    const add = changeLines(
      { subject: 'tool', subjectName: 'X', action: 'created', changes },
      lookup
    )
    expect(add[0].from).toBeNull()
    const del = changeLines(
      { subject: 'tool', subjectName: 'X', action: 'removed', changes },
      lookup
    )
    expect(del[0].to).toBeNull()
  })
})
