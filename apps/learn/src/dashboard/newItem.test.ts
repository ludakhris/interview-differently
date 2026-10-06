import { describe, expect, it } from 'vitest'
import { ADD_TYPES, draftItem } from './newItem'
import { toolRefProblem } from './toolKinds'

describe('add menu', () => {
  const tools = ADD_TYPES.filter((k) => k.start)

  it('offers the assessment and the connected tool as drafts', () => {
    expect(tools.map((k) => k.label)).toEqual([
      'Interview Differently assessment',
      'Connected tool',
    ])
  })

  it('never starts a draft with a reference, so nothing placeholder can be saved', () => {
    for (const k of tools) {
      const d = draftItem('m1', k)
      expect(d.config.ref).toBeUndefined()
      expect(toolRefProblem(String(d.config.ref ?? ''))).not.toBeNull()
    }
  })

  it('opens a draft with no id, the module it belongs to and the right default label', () => {
    const [assessment, tool] = tools.map((k) => draftItem('m1', k))
    expect(assessment).toMatchObject({ id: '', moduleId: 'm1', type: 'tool', label: 'pre' })
    expect(assessment.config).toEqual({ toolId: 'id-assessment' })
    expect(tool).toMatchObject({ id: '', type: 'tool', label: null })
    expect(tool.config).toEqual({ toolId: 'id-interview' })
  })

  it('leaves the other kinds to be created straight away', () => {
    for (const k of ADD_TYPES.filter((x) => !x.start)) expect(k.start).toBeUndefined()
    expect(ADD_TYPES.map((k) => k.type)).toEqual(
      expect.arrayContaining(['lesson', 'knowledge_check', 'interview', 'video', 'external_link'])
    )
  })
})
