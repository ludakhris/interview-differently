import { PGlite } from '@electric-sql/pglite'
import { RECORD_TOOL_RESULT_SQL } from './learner.service'

// The statement runs against a real Postgres (PGlite): one row per enrollment and item, as in the
// ItemProgress migration. PGlite has one connection, so this checks what each call does to the
// row; that two concurrent calls queue on the row lock is Postgres's ON CONFLICT guarantee.
// PGlite needs Node's VM modules, so this only runs with:
//   NODE_OPTIONS=--experimental-vm-modules npx jest record-tool-result-sql
const enabled = /experimental-vm-modules/.test(process.env.NODE_OPTIONS ?? '')
let db: PGlite

let n = 0
async function record(
  score: number,
  opts: {
    reportedAt?: string
    dimensions?: object
    cap?: number | null
    pass?: number | null
  } = {}
) {
  const data = {
    lastScore: score,
    at: '2026-10-06T12:00:00.000Z',
    ...(opts.reportedAt ? { reportedAt: opts.reportedAt } : {}),
    ...(opts.dimensions ? { dimensions: opts.dimensions } : {}),
  }
  const res = await db.query<{ attempts: number }>(RECORD_TOOL_RESULT_SQL, [
    `id-${n++}`,
    'e1',
    'i1',
    score,
    JSON.stringify(data),
    opts.reportedAt ?? null,
    opts.cap ?? null,
    opts.pass ?? null,
  ])
  return res.rows
}
const row = async () =>
  (
    await db.query<{
      score: number
      attempts: number
      status: string
      data: {
        lastScore: number
        reportedAt?: string
        recentReportedAt?: string[]
        dimensions?: object
      }
    }>('SELECT * FROM "ItemProgress"')
  ).rows[0]

const suite = enabled ? describe : describe.skip

suite('RECORD_TOOL_RESULT_SQL', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`CREATE TABLE "ItemProgress" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "enrollmentId" TEXT NOT NULL,
      "itemId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'not_started',
      "score" INTEGER,
      "attempts" INTEGER NOT NULL DEFAULT 0,
      "completedAt" TIMESTAMP(3),
      "data" JSONB,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );
    CREATE UNIQUE INDEX "ItemProgress_enrollmentId_itemId_key" ON "ItemProgress"("enrollmentId", "itemId");`)
  })
  afterAll(async () => {
    await db.close()
  })
  beforeEach(async () => {
    await db.exec('DELETE FROM "ItemProgress"')
  })

  it('inserts the first report as attempt 1', async () => {
    expect(await record(70, { reportedAt: 'a', dimensions: { C: 1 } })).toEqual([{ attempts: 1 }])
    expect(await row()).toMatchObject({
      score: 70,
      attempts: 1,
      status: 'completed',
      data: { lastScore: 70, reportedAt: 'a', recentReportedAt: ['a'], dimensions: { C: 1 } },
    })
  })

  it('keeps the best score and its dimensions when a lower attempt follows', async () => {
    await record(85, { reportedAt: 'a', dimensions: { C: 85 } })
    expect(await record(60, { reportedAt: 'b', dimensions: { C: 60 } })).toEqual([{ attempts: 2 }])
    const r = await row()
    expect(r.score).toBe(85)
    expect(r.data).toMatchObject({ lastScore: 60, dimensions: { C: 85 } })
    expect(r.data.recentReportedAt).toEqual(['a', 'b'])
  })

  it('takes the new score and dimensions when a later attempt is better', async () => {
    await record(60, { reportedAt: 'a', dimensions: { C: 60 } })
    await record(92, { reportedAt: 'b', dimensions: { C: 92 } })
    expect(await row()).toMatchObject({ score: 92, attempts: 2, data: { dimensions: { C: 92 } } })
  })

  it('does not count a repeat of a recorded reportedAt, even an older one', async () => {
    await record(60, { reportedAt: 'a' })
    await record(70, { reportedAt: 'b' })
    expect(await record(99, { reportedAt: 'a' })).toEqual([])
    expect(await record(99, { reportedAt: 'b' })).toEqual([])
    expect(await row()).toMatchObject({ score: 70, attempts: 2 })
  })

  it('counts a later real score after one that carried a future timestamp', async () => {
    await record(60, { reportedAt: '2099-01-01T00:00:00.000Z' })
    expect(await record(80, { reportedAt: '2026-10-06T12:00:00.000Z' })).toEqual([{ attempts: 2 }])
    expect((await row()).score).toBe(80)
  })

  it('counts every report that has no timestamp', async () => {
    await record(50)
    await record(55)
    expect(await row()).toMatchObject({ score: 55, attempts: 2 })
  })

  it('refuses a report once the cap is reached, leaving the row alone', async () => {
    await record(50, { reportedAt: 'a', cap: 1 })
    expect(await record(90, { reportedAt: 'b', cap: 1 })).toEqual([])
    expect(await row()).toMatchObject({ score: 50, attempts: 1 })
    expect(await record(90, { reportedAt: 'b', cap: 2 })).toEqual([{ attempts: 2 }])
  })

  it('leaves the item in progress below the pass mark, and completes it on a passing attempt', async () => {
    await record(40, { reportedAt: 'a', pass: 60 })
    expect(await row()).toMatchObject({ score: 40, attempts: 1, status: 'in_progress' })
    expect((await db.query('SELECT "completedAt" FROM "ItemProgress"')).rows[0]).toEqual({
      completedAt: null,
    })
    await record(75, { reportedAt: 'b', pass: 60 })
    expect(await row()).toMatchObject({ score: 75, attempts: 2, status: 'completed' })
  })

  it('stays completed once passed, even if a later attempt falls short', async () => {
    await record(80, { reportedAt: 'a', pass: 60 })
    const done = (await db.query<{ c: Date }>('SELECT "completedAt" AS c FROM "ItemProgress"'))
      .rows[0]
    await record(20, { reportedAt: 'b', pass: 60 })
    expect(await row()).toMatchObject({ score: 80, attempts: 2, status: 'completed' })
    expect(
      (await db.query<{ c: Date }>('SELECT "completedAt" AS c FROM "ItemProgress"')).rows[0]
    ).toEqual(done)
  })

  it('counts any score as done when there is no pass mark', async () => {
    await record(0, { reportedAt: 'a' })
    expect(await row()).toMatchObject({ score: 0, status: 'completed' })
  })

  it('keeps only the 10 most recent reportedAt values, in order', async () => {
    for (let i = 0; i < 12; i++) await record(10, { reportedAt: `t${i}` })
    const r = await row()
    expect(r.attempts).toBe(12)
    expect(r.data.recentReportedAt).toEqual(Array.from({ length: 10 }, (_, i) => `t${i + 2}`))
  })

  it('recognises a legacy row that only has reportedAt', async () => {
    await db.query(
      `INSERT INTO "ItemProgress" ("id","enrollmentId","itemId","status","score","attempts","data","updatedAt")
       VALUES ('old','e1','i1','completed',80,1,'{"lastScore":80,"reportedAt":"a"}',now())`
    )
    expect(await record(99, { reportedAt: 'a' })).toEqual([])
    expect(await record(70, { reportedAt: 'b' })).toEqual([{ attempts: 2 }])
    expect((await row()).data.recentReportedAt).toEqual(['a', 'b'])
  })
})
