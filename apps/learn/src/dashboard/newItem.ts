import type { CourseItemDto, CourseItemType } from '@id/types'

/**
 * The kinds of item the add menu offers.
 * `ask`: the item needs a link before it can exist, so the author is asked for it first.
 * `start`: the item cannot be created empty (a connected tool needs a real reference), so the add
 * action opens the editor on an unsaved draft instead and nothing is created until it is saved.
 */
export interface AddKind {
  type: CourseItemType
  label: string
  title: string
  ask?: string
  start?: { label?: 'pre'; config: Record<string, unknown> }
}

export const ADD_TYPES: AddKind[] = [
  { type: 'lesson', label: 'Lesson', title: 'New lesson' },
  { type: 'knowledge_check', label: 'Knowledge check', title: 'New knowledge check' },
  {
    type: 'tool',
    label: 'Interview Differently assessment',
    title: 'New assessment',
    start: { label: 'pre', config: { toolId: 'id-assessment' } },
  },
  { type: 'interview', label: 'Practice interview', title: 'Practice interview' },
  {
    type: 'tool',
    label: 'Connected tool',
    title: 'Connected tool',
    start: { config: { toolId: 'id-interview' } },
  },
  {
    type: 'video',
    label: 'YouTube video',
    title: 'New video',
    ask: 'Paste the YouTube link for this video',
  },
  {
    type: 'external_link',
    label: 'External course link',
    title: 'New external course',
    ask: 'Paste the link to the course (Udemy, Coursera, Khan Academy, edX, Microsoft Learn, Skillshop, Pluralsight or LinkedIn Learning)',
  },
]

/** The unsaved item the editor opens on for a kind that cannot exist without a real reference. Its id is empty: it has none yet. */
export const draftItem = (moduleId: string, kind: AddKind): CourseItemDto => ({
  id: '',
  moduleId,
  type: kind.type,
  title: kind.title,
  position: 0,
  label: kind.start?.label ?? null,
  config: { ...(kind.start?.config ?? {}) },
})
