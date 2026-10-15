import type { LessonScene } from '../core/lesson-types'
import { fitsTables, lessonPrompt, parseLesson, tablesIn, tablesUsed } from './lessons'

const scene = (kind: string, extra: object = {}) => ({
  heading: 'h',
  narration: 'n',
  kind,
  sub: 's',
  code: 'SELECT 1',
  highlight: [],
  columns: ['a'],
  rows: [['1']],
  highlightRows: [0, 9],
  leftLabel: '',
  left: 'x',
  rightLabel: '',
  right: 'y',
  items: ['one'],
  ...extra,
})

describe('parseLesson', () => {
  it('keeps well-formed scenes as typed visuals', () => {
    const out = parseLesson(
      JSON.stringify({ title: 'T', scenes: [scene('title'), scene('table'), scene('compare')] })
    )
    expect(out?.scenes.map((s) => s.visual.kind)).toEqual(['title', 'table', 'compare'])
    expect(out?.scenes[1].visual).toEqual({
      kind: 'table',
      columns: ['a'],
      rows: [['1']],
      highlightRows: [0],
    })
    expect(out?.scenes[2].visual).toMatchObject({ leftLabel: 'Before', rightLabel: 'After' })
  })

  it('refuses a storyboard with too few usable scenes', () => {
    expect(
      parseLesson(JSON.stringify({ title: 'T', scenes: [scene('title'), scene('video')] }))
    ).toBeNull()
    expect(parseLesson('nope')).toBeNull()
  })

  it('refuses a lesson that contains an answer key', () => {
    const raw = JSON.stringify({
      title: 'T',
      scenes: [
        scene('title'),
        scene('bullets'),
        scene('sql', { code: 'SELECT * FROM t\nWHERE x IS NULL' }),
      ],
    })
    expect(parseLesson(raw, ['select * from t where x is null;'])).toBeNull()
    expect(parseLesson(raw, ['select 2'])).not.toBeNull()
  })
})

describe('lessonPrompt', () => {
  it('fences the learner SQL as data and says when they passed', () => {
    const p = lessonPrompt({
      skillLabel: 'Filters',
      tables: 'customers (id)',
      level: 'never',
      misses: [{ prompt: 'p', sql: '', reason: null }],
    })
    expect(p).toContain('<learner_sql>\n(passed: had not learned this yet)\n</learner_sql>')
  })
})

describe('fitsTables', () => {
  const sql = (code: string): LessonScene => ({
    heading: 'h',
    narration: 'n',
    visual: { kind: 'sql', code, highlight: [] },
  })
  const schema = 'orders (id, customer_id, placed_at)\ncustomers (id, name)'

  it('reads the table names from the course schema', () => {
    expect(tablesIn(schema)).toEqual(new Set(['orders', 'customers']))
    expect(tablesIn('orders(id, customer_id)')).toEqual(new Set(['orders']))
  })

  it('fits when the SQL uses only the course tables, its own CTEs and functions', () => {
    const scenes: LessonScene[] = [
      sql('SELECT c.name FROM customers c JOIN public.orders o ON o.customer_id = c.id'),
      sql('SELECT * FROM (SELECT id FROM orders) AS t'),
      {
        heading: 'h',
        narration: 'n',
        visual: {
          kind: 'compare',
          leftLabel: 'Before',
          left: 'WITH recent AS (SELECT * FROM "orders") SELECT * FROM recent',
          rightLabel: 'After',
          right:
            'SELECT EXTRACT(YEAR FROM placed_at), TRIM(BOTH FROM name) FROM orders, customers c, generate_series(1, 3) WHERE id IS DISTINCT FROM 2',
        },
      },
      { heading: 'h', narration: 'n', visual: { kind: 'bullets', items: ['FROM somewhere'] } },
    ]
    expect([...tablesUsed(scenes)].sort()).toEqual(['customers', 'orders'])
    expect(fitsTables(scenes, schema)).toBe(true)
  })

  it('does not fit when the SQL names a table the course does not have', () => {
    expect(fitsTables([sql('SELECT * FROM orders JOIN products p ON true')], schema)).toBe(false)
    expect(fitsTables([sql('SELECT * FROM orders o, products p WHERE o.id = p.id')], schema)).toBe(
      false
    )
    expect(fitsTables([sql('INSERT INTO audit_log SELECT * FROM orders')], schema)).toBe(false)
    expect(fitsTables([sql('SELECT * FROM orders')], '')).toBe(false)
    expect(fitsTables([sql('SELECT 1')], '')).toBe(true)
  })
})
