import type { LearnerAddedItem, LearnerOutlineItem } from '@id/types'
import { describe, expect, it } from 'vitest'
import { resumeItem } from './resume'

const item = (id: string, status: LearnerOutlineItem['status'] = 'not_started', skipped = false) =>
  ({
    id,
    title: id,
    status,
    skipped: skipped ? { skill: 's', pct: 100, n: 2, at: '' } : null,
  }) as LearnerOutlineItem
const added = (
  id: string,
  sourceItemId: string | null,
  status: LearnerOutlineItem['status'] = 'not_started'
) =>
  ({ ...item(id, status), reason: { skill: 's', pct: 40, n: 2, sourceItemId } }) as LearnerAddedItem

describe('resumeItem', () => {
  it('starts at the first item when nothing is begun', () => {
    const r = resumeItem({
      modules: [{ id: 'm', title: 'M', items: [item('a'), item('b')] }],
      added: [],
    })
    expect(r).toEqual({ item: expect.objectContaining({ id: 'a' }), started: false })
  })

  it('passes what is done or skipped, and takes added help right after the item that added it', () => {
    const r = resumeItem({
      modules: [
        {
          id: 'm',
          title: 'M',
          items: [item('a', 'completed'), item('b', 'not_started', true), item('c')],
        },
      ],
      added: [added('help', 'a')],
    })
    expect(r?.item.id).toBe('help')
    expect(r?.started).toBe(true)
  })

  it('picks up an item already started, and returns null when the path is finished', () => {
    expect(
      resumeItem({
        modules: [{ id: 'm', title: 'M', items: [item('a', 'in_progress')] }],
        added: [],
      })?.item.id
    ).toBe('a')
    expect(
      resumeItem({
        modules: [{ id: 'm', title: 'M', items: [item('a', 'completed')] }],
        added: [added('x', null, 'completed')],
      })
    ).toBeNull()
  })
})
