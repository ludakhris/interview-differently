import { boundRows, MAX_CELL_CHARS, MAX_RESULT_CHARS, toJsonSafe } from './sql-exec'

describe('toJsonSafe', () => {
  it('turns values JSON cannot carry into text, so a result can cross the process boundary', () => {
    expect(toJsonSafe(9007199254740993n)).toBe('9007199254740993')
    expect(toJsonSafe(Number.NaN)).toBe('NaN')
    expect(toJsonSafe(Infinity)).toBe('Infinity')
    expect(toJsonSafe(new Uint8Array([1, 255]))).toBe('\\x01ff')
    expect(toJsonSafe(new Date('2026-10-07T00:00:00Z'))).toBe('2026-10-07T00:00:00.000Z')
  })
  it('goes inside arrays and objects, and leaves ordinary values alone', () => {
    expect(toJsonSafe([1n, { a: 2n, b: 'x', c: null, d: true, e: 1.5 }])).toEqual([
      '1',
      { a: '2', b: 'x', c: null, d: true, e: 1.5 },
    ])
    expect(() => JSON.stringify(toJsonSafe({ big: 10n ** 30n }))).not.toThrow()
  })
})

describe('boundRows', () => {
  const col = ['a']
  it('keeps a normal result whole', () => {
    expect(boundRows([{ a: 1 }, { a: 2n }], col)).toEqual({ rows: [[1], ['2']], truncated: false })
  })
  it('keeps at most 5000 rows and says so', () => {
    const r = boundRows(
      Array.from({ length: 5001 }, (_, i) => ({ a: i })),
      col
    )
    expect(r.rows).toHaveLength(5000)
    expect(r.truncated).toBe(true)
  })
  it('cuts a huge text cell and marks the result truncated', () => {
    const r = boundRows([{ a: 'x'.repeat(MAX_CELL_CHARS * 3) }], col)
    expect(String(r.rows[0][0])).toHaveLength(MAX_CELL_CHARS)
    expect(r.truncated).toBe(true)
  })
  it('stops adding rows once the whole result is too big, rather than building a giant message', () => {
    const cell = 'y'.repeat(MAX_CELL_CHARS - 1)
    const rows = Array.from({ length: Math.ceil(MAX_RESULT_CHARS / MAX_CELL_CHARS) + 50 }, () => ({
      a: cell,
    }))
    const r = boundRows(rows, col)
    expect(r.truncated).toBe(true)
    expect(JSON.stringify(r.rows).length).toBeLessThanOrEqual(MAX_RESULT_CHARS + 100)
    expect(r.rows.length).toBeLessThan(rows.length)
  })
})
