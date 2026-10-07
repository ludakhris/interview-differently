import { PGlite } from '@electric-sql/pglite'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import type { PrismaService } from '../../prisma/prisma.service'
import type { ProviderAccessService } from '../provider-access.service'
import { ActivityService } from './activity.service'

// The report queries run against a real Postgres (PGlite) with the columns of the migration.
// PGlite needs Node's VM modules, so this only runs with:
//   NODE_OPTIONS=--experimental-vm-modules npx jest activity-sql
const enabled = /experimental-vm-modules/.test(process.env.NODE_OPTIONS ?? '')
const d = enabled ? describe : describe.skip

let db: PGlite
let n = 0
const ins = (
  userId: string,
  enrollmentId: string,
  itemId: string | null,
  day: string,
  seconds: number,
  opts: { kind?: string; estimated?: boolean; start?: string; end?: string } = {}
) =>
  db.query(
    `INSERT INTO "ActivitySession" VALUES ($1,$2,$3,$4,$5,$6::date,$7::timestamp,$8::timestamp,$9,$10)`,
    [
      `s${n++}`,
      userId,
      enrollmentId,
      itemId,
      opts.kind ?? 'page',
      day,
      opts.start ?? `${day}T10:00:00Z`,
      opts.end ?? `${day}T10:30:00Z`,
      seconds,
      opts.estimated ?? false,
    ]
  )

const people = [
  { userId: 'u1', status: 'enrolled', user: { displayName: 'Ann', email: 'ann@x.org' } },
  { userId: 'u2', status: 'enrolled', user: { displayName: '=Bob', email: 'bob@x.org' } },
  { userId: 'u3', status: 'withdrawn', user: { displayName: 'Cy', email: null } },
  { userId: 'u4', status: 'withdrawn', user: { displayName: 'Dee', email: null } },
]
const prisma = {
  // PGlite reads a zoneless TIMESTAMP in the process zone; the API's driver reads it as UTC.
  $queryRawUnsafe: async (sql: string, ...p: unknown[]) =>
    (await db.query(sql, p)).rows.map((row) =>
      Object.fromEntries(
        Object.entries(row as object).map(([k, v]) => [
          k,
          v instanceof Date ? new Date(v.getTime() - v.getTimezoneOffset() * 60000) : v,
        ])
      )
    ),
  enrollment: { findMany: async () => people },
  user: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      people.find((p) => p.userId === where.id)?.user ?? null,
  },
}
const access = {
  assertCohortStaff: jest.fn(async () => ({})),
  assertLearnerOfCohort: jest.fn(async (u: string) => {
    if (!people.some((p) => p.userId === u)) throw new NotFoundException('Cohort not found')
    return 'E-' + u
  }),
}
const svc = new ActivityService(
  prisma as unknown as PrismaService,
  access as unknown as ProviderAccessService,
  {} as never
)

d('activity reports on Postgres', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "displayName" TEXT, "email" TEXT);
      CREATE TABLE "Enrollment" ("id" TEXT PRIMARY KEY, "cohortId" TEXT, "userId" TEXT);
      CREATE TABLE "CourseItem" ("id" TEXT PRIMARY KEY, "title" TEXT);
      CREATE TABLE "ActivitySession" (
        "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "enrollmentId" TEXT NOT NULL, "itemId" TEXT,
        "kind" TEXT NOT NULL, "day" DATE NOT NULL, "startedAt" TIMESTAMP(3) NOT NULL,
        "lastSeenAt" TIMESTAMP(3) NOT NULL, "seconds" INTEGER NOT NULL DEFAULT 0,
        "estimated" BOOLEAN NOT NULL DEFAULT false);
      INSERT INTO "User" VALUES ('u1','Ann','ann@x.org'),('u2','=Bob','bob@x.org'),('u3','Cy',NULL),('u4','Dee',NULL);
      INSERT INTO "Enrollment" VALUES ('E1','C1','u1'),('E2','C1','u2'),('E3','C1','u3'),('E4','C1','u4'),('E9','C2','u1');
      INSERT INTO "CourseItem" VALUES ('i1','Intro'),('i2','Lab tool');
    `)
    await ins('u1', 'E1', 'i1', '2026-10-05', 600)
    await ins('u1', 'E1', 'i1', '2026-10-05', 300, {
      start: '2026-10-05T15:00:00Z',
      end: '2026-10-05T15:10:00Z',
    })
    await ins('u1', 'E1', 'i2', '2026-10-05', 1200, {
      kind: 'tool',
      estimated: true,
      start: '2026-10-05T11:00:00Z',
      end: '2026-10-05T11:20:00Z',
    })
    await ins('u1', 'E1', null, '2026-10-06', 120)
    await ins('u1', 'E1', 'i1', '2026-09-01', 999) // outside the range
    await ins('u2', 'E2', 'i1', '2026-10-06', 90)
    await ins('u2', 'E2', 'i1', '2026-10-07', 0) // opened once, no time
    await ins('u3', 'E3', 'i1', '2026-10-06', 60) // withdrawn, has time
    await ins('u1', 'E9', 'i1', '2026-10-06', 5000) // another cohort
    // 23:30 on Oct 7 in New York, already Oct 8 in UTC.
    await ins('u2', 'E2', 'i1', '2026-10-08', 300, {
      start: '2026-10-08T03:30:00Z',
      end: '2026-10-08T03:35:00Z',
    })
  })
  afterAll(async () => db?.close())

  const r = { from: '2026-10-04', to: '2026-10-07' }

  it('the cohort report sums rows, lists quiet days and averages', async () => {
    const rep = await svc.cohortReport('s', 'agency-admin', 'C1', r.from, r.to)
    expect(rep.tz).toBe('UTC')
    const ann = rep.learners.find((l) => l.userId === 'u1')!
    // Tool time and page time are the same kind of time: 600 + 300 + 1200 + 120.
    expect(ann.totalSeconds).toBe(2220)
    expect(ann.activeDays).toBe(2)
    expect(ann.averagePerActiveDaySeconds).toBe(1110)
    expect(ann.firstSeenAt).toBe('2026-10-05T10:00:00.000Z')
    expect(ann.lastSeenAt).toBe('2026-10-06T10:30:00.000Z')
    const bob = rep.learners.find((l) => l.userId === 'u2')!
    expect(bob.totalSeconds).toBe(90)
    expect(bob.activeDays).toBe(1)
    // Withdrawn with time is listed, withdrawn without is not.
    expect(rep.learners.map((l) => l.userId).sort()).toEqual(['u1', 'u2', 'u3'])
    expect(rep.totalSeconds).toBe(rep.learners.reduce((s, l) => s + l.totalSeconds, 0))
    expect(rep.totalSeconds).toBe(2220 + 90 + 60)
    expect(rep.days.map((x) => x.day)).toEqual([
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
    ])
    expect(rep.days.map((x) => x.seconds)).toEqual([0, 2100, 270, 0])
    expect(rep.days.map((x) => x.learners)).toEqual([0, 1, 3, 0])
    expect(rep.days.reduce((s, x) => s + x.seconds, 0)).toBe(rep.totalSeconds)
    expect(rep.items.reduce((s, x) => s + x.seconds, 0)).toBe(rep.totalSeconds)
    expect(rep.items[0]).toMatchObject({ title: 'Lab tool', seconds: 1200, learners: 1 })
    expect(rep.items.find((i) => i.itemId === null)?.title).toMatch(/Course pages/)
    // 2370 s over 3 learners, 3 active, 4 learner-days; learners per day [0,1,3,0] over 4 days.
    expect(rep.averages).toEqual({
      perLearnerSeconds: 790,
      perActiveLearnerSeconds: 790,
      perActiveDaySeconds: 593,
      activeLearners: 3,
      learnersPerDay: 1,
    })
  })

  it("a learner's report lists sessions and matches the cohort row", async () => {
    const rep = await svc.learnerReport('s', 'agency-admin', 'C1', 'u1', r.from, r.to)
    expect(rep.totalSeconds).toBe(2220)
    expect(rep.activeDays).toBe(2)
    expect(rep.averagePerActiveDaySeconds).toBe(1110)
    expect(rep.days.map((x) => x.day)).toEqual(['2026-10-05', '2026-10-06'])
    const day5 = rep.days[0]
    expect(day5).toMatchObject({ seconds: 2100, sessionCount: 3 })
    expect(day5.sessions.reduce((s, x) => s + x.seconds, 0)).toBe(day5.seconds)
    // Oldest first, each with a start (UTC) and a duration; the tool run is just an activity.
    expect(day5.sessions).toEqual([
      { startedAt: '2026-10-05T10:00:00.000Z', seconds: 600, itemId: 'i1', title: 'Intro' },
      { startedAt: '2026-10-05T11:00:00.000Z', seconds: 1200, itemId: 'i2', title: 'Lab tool' },
      { startedAt: '2026-10-05T15:00:00.000Z', seconds: 300, itemId: 'i1', title: 'Intro' },
    ])
    expect(day5.firstSeenAt).toBe('2026-10-05T10:00:00.000Z')
    expect(day5.lastSeenAt).toBe('2026-10-05T15:10:00.000Z')
    const cohort = await svc.cohortReport('s', 'agency-admin', 'C1', r.from, r.to)
    expect(cohort.learners.find((l) => l.userId === 'u1')!.totalSeconds).toBe(rep.totalSeconds)
  })

  it('days follow the viewer timezone: a 23:30 local session is on that local day', async () => {
    const ny = 'America/New_York'
    const rep = await svc.cohortReport('s', 'agency-admin', 'C1', r.from, r.to, ny)
    expect(rep.tz).toBe(ny)
    // The Oct 8 03:30 UTC session is Oct 7 23:30 in New York.
    expect(rep.days.map((x) => x.seconds)).toEqual([0, 2100, 270, 300])
    expect(rep.learners.find((l) => l.userId === 'u2')!).toMatchObject({
      totalSeconds: 390,
      activeDays: 2,
    })
    const bob = await svc.learnerReport('s', 'agency-admin', 'C1', 'u2', r.from, r.to, ny)
    expect(bob.days[1]).toMatchObject({ day: '2026-10-07', seconds: 300, sessionCount: 1 })
    expect(bob.days[1].sessions[0].startedAt).toBe('2026-10-08T03:30:00.000Z')
    // The same data in UTC: that session is on Oct 8, outside this range.
    const utc = await svc.learnerReport('s', 'agency-admin', 'C1', 'u2', r.from, r.to)
    expect(utc.totalSeconds).toBe(90)
    const wider = await svc.learnerReport('s', 'agency-admin', 'C1', 'u2', r.from, '2026-10-08')
    expect(wider.days.map((x) => x.day)).toEqual(['2026-10-06', '2026-10-08'])
    // East of UTC the other way: 03:30 UTC is 09:00 the same day in Kolkata.
    const kol = await svc.learnerReport('s', 'x', 'C1', 'u2', r.from, '2026-10-08', 'Asia/Kolkata')
    expect(kol.days.map((x) => x.day)).toEqual(['2026-10-06', '2026-10-08'])
  })

  it('a learner sees only their own report, scoped to the cohort', async () => {
    const own = await svc.ownReport('u2', 'C1', r.from, r.to)
    expect(own.userId).toBe('u2')
    expect(own.totalSeconds).toBe(90)
    await expect(svc.ownReport('nobody', 'C1', r.from, r.to)).rejects.toThrow(NotFoundException)
    // u1's 5000 s in cohort C2 never shows in C1.
    expect((await svc.ownReport('u1', 'C1', '2026-10-06', '2026-10-06')).totalSeconds).toBe(120)
  })

  it('the CSV has one row per session with UTC start and local date; formulas neutralized', async () => {
    const csv = await svc.cohortCsv('s', 'agency-admin', 'C1', r.from, r.to)
    const lines = csv.trim().split('\r\n')
    expect(csv.startsWith('\uFEFF')).toBe(true)
    lines[0] = lines[0].replace('\uFEFF', '')
    expect(lines[0]).toBe('learner,email,start_utc,date_local,item,minutes')
    expect(lines).toContain('Ann,ann@x.org,2026-10-05T10:00:00.000Z,2026-10-05,Intro,10.0')
    expect(lines).toContain('Ann,ann@x.org,2026-10-05T11:00:00.000Z,2026-10-05,Lab tool,20.0')
    expect(lines.some((l) => l.startsWith("'=Bob,"))).toBe(true)
    expect(lines).toHaveLength(1 + 6)
    const minutes = lines.slice(1).reduce((s, l) => s + Number(l.split(',').pop()), 0)
    expect(minutes).toBeCloseTo((2220 + 90 + 60) / 60, 1)
  })

  it('the CSV date_local follows the viewer timezone while start_utc stays UTC', async () => {
    const csv = await svc.cohortCsv('s', 'agency-admin', 'C1', r.from, r.to, 'America/New_York')
    expect(csv).toContain("'=Bob,bob@x.org,2026-10-08T03:30:00.000Z,2026-10-07,Intro,5.0")
  })

  it('staff guard runs first', async () => {
    access.assertCohortStaff.mockRejectedValueOnce(new ForbiddenException('no'))
    await expect(svc.cohortCsv('s', undefined, 'C1', undefined, undefined)).rejects.toThrow(
      ForbiddenException
    )
  })
})
