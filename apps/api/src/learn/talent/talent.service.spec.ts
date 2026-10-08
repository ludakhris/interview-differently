import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { PrismaService } from '../../prisma/prisma.service'
import { DataAccessLogService } from '../data-access-log.service'
import { LearnService } from '../learn.service'
import type { LearnerService } from '../learner.service'
import { ProviderAccessService } from '../provider-access.service'
import { LocalDiskPrivateStorage } from '../../storage/local-disk-storage'
import { TalentService, toProfileDto } from './talent.service'

const PREV = 7770001
const TARGET = 7770002
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)

interface Edu {
  level: string
  fieldOfStudy: string | null
  school: string | null
  graduationYear: number | null
}
type Row = Record<string, unknown> & { userId: string; educations: Edu[] }
interface Enrolled {
  userId: string
  providerId: string
  cohortId: string
  hostId: string
  status?: string
}

// Cohorts: C1 is P1's program at host H1 and REQUIRES the profile (refresh every 6 months);
// C2 is P2's at H1; C3 is P1's at an agency host A1.
const COHORTS: Record<
  string,
  { providerId: string; hostId: string; requires: boolean; months: number | null }
> = {
  C1: { providerId: 'P1', hostId: 'H1', requires: true, months: 6 },
  C2: { providerId: 'P2', hostId: 'H1', requires: false, months: null },
  C3: { providerId: 'P1', hostId: 'A1', requires: false, months: null },
}
/** Evaluates institutionCohortWhere against a fixture enrollment: a provider's course, or a hosting organization. */
const inScope = (
  e: { providerId: string; hostId: string },
  cohort: { OR: ({ course: { providerId: string } } | { institutionId: string })[] }
) =>
  cohort.OR.some((c) =>
    'course' in c
      ? e.providerId === c.course.providerId
      : e.hostId === c.institutionId && INSTITUTIONS[e.hostId]?.kind === 'organization'
  )
const INSTITUTIONS: Record<string, { name: string; kind: string }> = {
  P1: { name: 'Prov P1', kind: 'provider' },
  P2: { name: 'Prov P2', kind: 'provider' },
  H1: { name: 'Harbor', kind: 'organization' },
  A1: { name: 'Agency', kind: 'agency' },
}

const state = {
  profiles: [] as Row[],
  shares: [] as { userId: string; institutionId: string; allowEmployers: boolean }[],
  logs: [] as Record<string, unknown>[],
  failLog: false,
  enrolled: [] as Enrolled[],
  users: {
    L1: { displayName: 'Ada Lovelace', email: 'ada@x.org' },
    L2: { displayName: 'Grace Hopper', email: 'grace@x.org' },
    L3: { displayName: '=HYPERLINK("http://evil")', email: 'l3@x.org' },
    L4: { displayName: 'Withdrawn Wes', email: 'wes@x.org' },
    L5: { displayName: 'No Profile', email: 'np@x.org' },
  } as Record<string, { displayName: string; email: string }>,
}

const edu = (level: string, over: Partial<Edu> = {}): Edu => ({
  level,
  fieldOfStudy: null,
  school: null,
  graduationYear: null,
  ...over,
})
const base = (userId: string, over: Record<string, unknown> = {}): Row => ({
  userId,
  resumeKey: null,
  resumeName: null,
  resumeSize: null,
  resumeUploadedAt: null,
  yearsExperience: null,
  industries: [],
  previousCompensation: null,
  targetCompensation: null,
  targetRoles: [],
  availableFrom: null,
  completedAt: null,
  updatedAt: daysAgo(10),
  educations: [],
  ...over,
})

/** The row as a query would return it: only the selected keys, with the education count. */
function pick(row: Row, select?: Record<string, unknown>) {
  const full: Record<string, unknown> = { ...row, _count: { educations: row.educations.length } }
  if (!select) return full
  const out: Record<string, unknown> = {}
  for (const [k, on] of Object.entries(select)) if (on) out[k] = full[k]
  return out
}

const prisma = {
  user: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
      state.users[where.id] ? { id: where.id, ...state.users[where.id] } : null
    ),
  },
  enrollment: {
    findFirst: jest.fn(async ({ where }) =>
      state.enrolled.find((e) => e.userId === where.userId && inScope(e, where.cohort))
        ? { id: 'e' }
        : null
    ),
    findMany: jest.fn(async ({ where }) => {
      let rows = state.enrolled
      if (where.cohort?.OR) rows = rows.filter((e) => inScope(e, where.cohort))
      if (where.cohort?.requiresProfile) rows = rows.filter((e) => COHORTS[e.cohortId].requires)
      if (typeof where.userId === 'string') rows = rows.filter((e) => e.userId === where.userId)
      if (where.userId?.in) rows = rows.filter((e) => where.userId.in.includes(e.userId))
      if (where.status?.not)
        rows = rows.filter((e) => (e.status ?? 'enrolled') !== where.status.not)
      const q = where.user?.OR?.[0]?.displayName?.contains?.toLowerCase()
      if (q)
        rows = rows.filter(
          (e) =>
            state.users[e.userId].displayName.toLowerCase().includes(q) ||
            state.users[e.userId].email.toLowerCase().includes(q)
        )
      return rows.map((e) => {
        const c = COHORTS[e.cohortId]
        return {
          userId: e.userId,
          status: e.status ?? 'enrolled',
          user: state.users[e.userId],
          cohort: {
            id: e.cohortId,
            name: `Cohort ${e.cohortId}`,
            requiresProfile: c.requires,
            profileRefreshMonths: c.months,
            institution: { id: c.hostId, ...INSTITUTIONS[c.hostId] },
            course: {
              title: 'Data',
              provider: { id: c.providerId, ...INSTITUTIONS[c.providerId] },
            },
          },
        }
      })
    }),
  },
  membership: {
    findFirst: jest.fn(async ({ where }) =>
      where.cohortId === null &&
      ((where.userId === 'staff-p1' && where.institutionId === 'P1') ||
        (where.userId === 'staff-h1' && where.institutionId === 'H1'))
        ? { id: 'm' }
        : null
    ),
  },
  talentProfile: {
    findUnique: jest.fn(async ({ where, select }) => {
      const r = state.profiles.find((p) => p.userId === where.userId)
      return r ? pick(r, select) : null
    }),
    findMany: jest.fn(async ({ where, select }) =>
      state.profiles.filter((p) => where.userId.in.includes(p.userId)).map((p) => pick(p, select))
    ),
    upsert: jest.fn(async ({ where, create, update }) => {
      const cur = state.profiles.find((p) => p.userId === where.userId)
      const apply = (row: Row, data: Record<string, unknown>) => {
        const { educations, ...rest } = data as { educations?: Record<string, unknown> } & Record<
          string,
          unknown
        >
        Object.assign(row, rest)
        if (educations) {
          const made = (educations.create as (Edu & { position: number })[] | undefined) ?? []
          row.educations = made.map((e) => ({
            level: e.level,
            fieldOfStudy: e.fieldOfStudy,
            school: e.school,
            graduationYear: e.graduationYear,
          }))
        }
        return row
      }
      if (cur) return apply(cur, update)
      const row = apply(base(create.userId), create)
      state.profiles.push(row)
      return row
    }),
    update: jest.fn(async ({ where, data }) =>
      Object.assign(state.profiles.find((p) => p.userId === where.userId)!, data)
    ),
  },
  profileShare: {
    findUnique: jest.fn(async ({ where }) => {
      const k = where.userId_institutionId
      return (
        state.shares.find((s) => s.userId === k.userId && s.institutionId === k.institutionId) ??
        null
      )
    }),
    findMany: jest.fn(async ({ where }) =>
      state.shares.filter(
        (s) =>
          (where.institutionId === undefined || s.institutionId === where.institutionId) &&
          (where.userId === undefined ||
            (typeof where.userId === 'string'
              ? s.userId === where.userId
              : where.userId.in.includes(s.userId)))
      )
    ),
    upsert: jest.fn(async ({ where, create, update }) => {
      const k = where.userId_institutionId
      const cur = state.shares.find(
        (s) => s.userId === k.userId && s.institutionId === k.institutionId
      )
      if (cur) return Object.assign(cur, update)
      state.shares.push({ ...create })
      return create
    }),
    deleteMany: jest.fn(async ({ where }) => {
      state.shares = state.shares.filter(
        (s) => !(s.userId === where.userId && where.institutionId.in.includes(s.institutionId))
      )
    }),
  },
  supportItem: { groupBy: jest.fn(async () => []) },
  participantNote: { groupBy: jest.fn(async () => []) },
  dataAccessLog: {
    create: jest.fn(async ({ data }) => {
      if (state.failLog) throw new Error('db down')
      state.logs.push(data)
    }),
  },
  $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
}
// The audit service looks the actor up by user id.
prisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
  state.users[where.id]
    ? { id: where.id, ...state.users[where.id] }
    : where.id === 'ghost'
      ? null
      : { id: where.id, displayName: 'Staff Person', email: 's@x.org' }
)

const storage = {
  upload: jest.fn(async () => undefined),
  delete: jest.fn(async () => undefined),
  getSignedUrl: jest.fn(async (key: string, s: number) => `https://signed.test/${key}?exp=${s}`),
}
const learner = { syncProfileState: jest.fn(async () => undefined) }

const db = prisma as unknown as PrismaService
const access = new ProviderAccessService(db, new LearnService(db))
const audit = new DataAccessLogService(db, access)
const service = new TalentService(
  db,
  access,
  audit,
  storage as never,
  learner as unknown as LearnerService
)

const staff = { userId: 'staff-p1', role: 'provider-admin' }
const PDF = {
  originalname: 'cv.pdf',
  mimetype: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4 x'),
}

beforeEach(() => {
  jest.clearAllMocks()
  state.enrolled = [
    { userId: 'L1', providerId: 'P1', cohortId: 'C1', hostId: 'H1' },
    { userId: 'L2', providerId: 'P2', cohortId: 'C2', hostId: 'H1' },
    { userId: 'L3', providerId: 'P1', cohortId: 'C1', hostId: 'H1' },
    { userId: 'L4', providerId: 'P1', cohortId: 'C1', hostId: 'H1', status: 'withdrawn' },
    { userId: 'L5', providerId: 'P1', cohortId: 'C3', hostId: 'A1' },
  ]
  state.profiles = [
    // L1: complete, saved 10 days ago, shared with P1 and its employers.
    base('L1', {
      resumeKey: 'talent/resumes/L1/abc-cv.pdf',
      resumeName: 'cv.pdf',
      resumeSize: 10,
      educations: [
        edu('associate', { school: 'Harbor CC' }),
        edu('bachelor', { school: '=cmd|x' }),
      ],
      yearsExperience: 5,
      industries: ['Aerospace'],
      targetRoles: ['Analyst'],
      previousCompensation: PREV,
      targetCompensation: TARGET,
      completedAt: new Date('2026-10-02T00:00:00Z'),
    }),
    // L3: complete, stale (saved 400 days ago), NOT shared with anyone.
    base('L3', {
      resumeKey: 'talent/resumes/L3/old-cv.pdf',
      resumeName: 'old-cv.pdf',
      resumeSize: 10,
      educations: [edu('master')],
      yearsExperience: 2,
      industries: ['Retail'],
      targetRoles: ['Clerk'],
      previousCompensation: 4242,
      completedAt: daysAgo(400),
      updatedAt: daysAgo(400),
    }),
    // L4 (withdrawn): shared with P1.
    base('L4', {
      resumeKey: 'talent/resumes/L4/cv.pdf',
      resumeName: 'cv.pdf',
      educations: [edu('bachelor')],
      yearsExperience: 1,
      industries: ['Logistics'],
      targetRoles: ['Clerk'],
    }),
    // L2 has a profile and shared it with P2 only.
    base('L2', {
      educations: [edu('doctorate')],
      yearsExperience: 9,
      industries: ['Aerospace'],
      previousCompensation: 99,
    }),
  ]
  state.shares = [
    { userId: 'L1', institutionId: 'P1', allowEmployers: true },
    { userId: 'L4', institutionId: 'P1', allowEmployers: false },
    { userId: 'L2', institutionId: 'P2', allowEmployers: true },
  ]
  state.logs = []
  state.failLog = false
})

describe('learner side: GET /me/profile', () => {
  it('is empty before the first save, with the organizations and requirements already known', async () => {
    const s = await service.myProfile('L5')
    expect(s.profile).toEqual(toProfileDto(null))
    expect(s.profile.complete).toBe(false)
    expect(s.requirements).toEqual([]) // L5 is in C3, which does not require it
    // Only a provider or organization can be shown the profile: the agency host is not offered.
    expect(s.organizations.map((o) => o.institutionId)).toEqual(['P1'])
  })
  it('lists the program and the host, flags required ones, and reflects current sharing', async () => {
    const s = await service.myProfile('L1')
    expect(s.organizations).toEqual([
      {
        institutionId: 'H1',
        name: 'Harbor',
        kind: 'organization',
        why: 'your cohort host',
        required: true,
        shared: false,
        allowEmployers: false,
      },
      {
        institutionId: 'P1',
        name: 'Prov P1',
        kind: 'provider',
        why: 'your program',
        required: true,
        shared: true,
        allowEmployers: true,
      },
    ])
  })
  it('is computed per person: the same profile whichever provider asks', async () => {
    const s = await service.myProfile('L1')
    expect(s.profile.complete).toBe(true)
    expect(s.profile.educations.map((e) => e.level)).toEqual(['associate', 'bachelor'])
    expect(s.profile.resume?.name).toBe('cv.pdf')
    expect(JSON.stringify(s)).not.toContain('talent/resumes')
    expect(s.profile.previousCompensation).toBe(PREV)
  })
  it('says satisfied, due date, and stale per requirement', async () => {
    const fresh = (await service.myProfile('L1')).requirements
    expect(fresh).toEqual([
      expect.objectContaining({
        cohortId: 'C1',
        cohortName: 'Cohort C1',
        providerName: 'Prov P1',
        refreshMonths: 6,
        satisfied: true,
      }),
    ])
    expect(new Date(fresh[0].dueBy as string).getTime()).toBeGreaterThan(Date.now())
    const stale = (await service.myProfile('L3')).requirements
    expect(stale[0].satisfied).toBe(false)
    expect(new Date(stale[0].dueBy as string).getTime()).toBeLessThan(Date.now())
    // No profile: not satisfied and nothing is due yet.
    state.profiles = []
    const none = (await service.myProfile('L1')).requirements[0]
    expect(none.satisfied).toBe(false)
    expect(none.dueBy).toBeNull()
  })
  it('a withdrawn learner is not held to the requirement but can still be seen by the org', async () => {
    const s = await service.myProfile('L4')
    expect(s.requirements).toEqual([])
    expect(s.organizations.find((o) => o.institutionId === 'P1')).toMatchObject({
      required: false,
      shared: true,
    })
  })
})

describe('learner side: PUT /me/profile', () => {
  const complete = {
    yearsExperience: 0,
    industries: ['IT'],
    targetRoles: ['Tech'],
    educations: [{ level: 'associate' }],
  }
  it('refuses a user with no account row and writes nothing', async () => {
    await expect(service.saveProfile('ghost', complete)).rejects.toThrow(ForbiddenException)
    expect(prisma.talentProfile.upsert).not.toHaveBeenCalled()
  })
  it('always writes the caller own profile, never one named in the body', async () => {
    await service.saveProfile('L5', { ...complete, userId: 'L1' })
    expect(state.profiles.find((p) => p.userId === 'L5')?.targetRoles).toEqual(['Tech'])
    expect(state.profiles.find((p) => p.userId === 'L1')?.targetRoles).toEqual(['Analyst'])
  })
  it('computes complete: it is false until the rule is met, and no flag is needed or read', async () => {
    const a = await service.saveProfile('L5', { yearsExperience: 3, complete: true })
    expect(a.profile.complete).toBe(false)
    expect(a.profile.completedAt).toBeNull()
    const b = await service.saveProfile('L5', { targetRoles: ['Tech'] })
    expect(b.profile.complete).toBe(false) // still no education
    const b2 = await service.saveProfile('L5', { educations: [{ level: 'associate' }] })
    expect(b2.profile.complete).toBe(false) // a job alone is not enough: no industry yet
    expect(b2.profile.completedAt).toBeNull()
    const c = await service.saveProfile('L5', { industries: ['IT'] })
    expect(c.profile.complete).toBe(false) // all the fields, but no resume yet
    expect(c.profile.completedAt).toBeNull()
    await service.uploadResume('L5', PDF)
    const d = (await service.myProfile('L5')).profile
    expect(d.complete).toBe(true)
    expect(d.completedAt).not.toBeNull()
  })
  it('a save with every field but no resume is not complete; with a resume it is', async () => {
    const noResume = await service.saveProfile('L5', complete)
    expect(noResume.profile.complete).toBe(false)
    expect(noResume.requirements).toEqual([]) // L5's cohort does not require it
    await service.uploadResume('L5', PDF)
    expect((await service.saveProfile('L5', complete)).profile.complete).toBe(true)
  })
  it('keeps completedAt when a later edit makes it incomplete, and the profile reads incomplete', async () => {
    await service.uploadResume('L5', PDF)
    const first = (await service.saveProfile('L5', complete)).profile
    expect(first.complete).toBe(true)
    const later = (await service.saveProfile('L5', { educations: [] })).profile
    expect(later.complete).toBe(false)
    expect(later.completedAt).toBe(first.completedAt)
  })
  it('settles the learner courses after every save (completion and mirrors)', async () => {
    await service.saveProfile('L5', complete)
    expect(learner.syncProfileState).toHaveBeenCalledWith('L5')
  })
  it('saves several education entries in order and replaces them on the next save', async () => {
    await service.saveProfile('L5', {
      educations: [
        { level: 'associate', school: 'Harbor CC', graduationYear: 2015 },
        { level: 'bachelor', fieldOfStudy: 'Biology' },
        { level: 'master' },
      ],
    })
    expect(state.profiles.find((p) => p.userId === 'L5')?.educations).toEqual([
      { level: 'associate', school: 'Harbor CC', graduationYear: 2015, fieldOfStudy: null },
      { level: 'bachelor', fieldOfStudy: 'Biology', school: null, graduationYear: null },
      { level: 'master', fieldOfStudy: null, school: null, graduationYear: null },
    ])
    await service.saveProfile('L5', { educations: [{ level: 'doctorate' }] })
    expect(state.profiles.find((p) => p.userId === 'L5')?.educations).toHaveLength(1)
    // A save that leaves educations out leaves them as they are.
    await service.saveProfile('L5', { yearsExperience: 1 })
    expect(state.profiles.find((p) => p.userId === 'L5')?.educations).toHaveLength(1)
  })
  it('a save is a refresh: updatedAt moves even when nothing changed', async () => {
    const before = state.profiles.find((p) => p.userId === 'L1')!.updatedAt
    await service.saveProfile('L1', { yearsExperience: 5 })
    expect(
      (state.profiles.find((p) => p.userId === 'L1')!.updatedAt as Date) > (before as Date)
    ).toBe(true)
  })

  describe('shares', () => {
    it('only organizations from the learner own list can be shared: an unknown id is a 400 and nothing is written', async () => {
      for (const id of ['P2', 'A1', 'nope']) {
        await expect(
          service.saveProfile('L1', { shares: [{ institutionId: id, allowEmployers: false }] })
        ).rejects.toThrow(BadRequestException)
      }
      expect(prisma.talentProfile.upsert).not.toHaveBeenCalled()
      expect(prisma.profileShare.upsert).not.toHaveBeenCalled()
      expect(state.shares).toHaveLength(3)
    })
    it('the list is the complete set: listed organizations are shared, the rest of the options are not', async () => {
      await service.saveProfile('L1', { shares: [{ institutionId: 'H1', allowEmployers: false }] })
      expect(
        state.shares
          .filter((s) => s.userId === 'L1')
          .map((s) => [s.institutionId, s.allowEmployers])
      ).toEqual([['H1', false]])
      // The choice about an organization is not touched by anyone else's row.
      expect(state.shares.some((s) => s.userId === 'L2')).toBe(true)
    })
    it('changes allowEmployers in place, and a save without shares leaves them as they are', async () => {
      await service.saveProfile('L1', {
        shares: [
          { institutionId: 'P1', allowEmployers: false },
          { institutionId: 'H1', allowEmployers: true },
        ],
      })
      const mine = Object.fromEntries(
        state.shares
          .filter((s) => s.userId === 'L1')
          .map((s) => [s.institutionId, s.allowEmployers])
      )
      expect(mine).toEqual({ P1: false, H1: true })
      await service.saveProfile('L1', { yearsExperience: 6 })
      expect(state.shares.filter((s) => s.userId === 'L1')).toHaveLength(2)
    })
    it('sharing nothing removes every choice', async () => {
      await service.saveProfile('L1', { shares: [] })
      expect(state.shares.filter((s) => s.userId === 'L1')).toEqual([])
    })
  })
})

describe('resume upload', () => {
  it('rejects a fake pdf, a wrong type and an oversize file, storing nothing', async () => {
    const fake = { ...PDF, buffer: Buffer.from('MZ not a pdf') }
    await expect(service.uploadResume('L1', fake)).rejects.toThrow(BadRequestException)
    await expect(service.uploadResume('L1', { ...PDF, mimetype: 'text/html' })).rejects.toThrow(
      BadRequestException
    )
    const big = {
      ...PDF,
      buffer: Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(5 * 1024 * 1024)]),
    }
    await expect(service.uploadResume('L1', big)).rejects.toThrow(/too large/)
    await expect(service.uploadResume('L1', undefined)).rejects.toThrow(BadRequestException)
    expect(storage.upload).not.toHaveBeenCalled()
  })
  it('refuses a user with no account row', async () => {
    await expect(service.uploadResume('ghost', PDF)).rejects.toThrow(ForbiddenException)
    expect(storage.upload).not.toHaveBeenCalled()
  })
  it('fails closed in production when storage is the unauthenticated local disk', async () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const local = new TalentService(
      db,
      access,
      audit,
      new LocalDiskPrivateStorage() as never,
      learner as unknown as LearnerService
    )
    try {
      await expect(local.uploadResume('L1', PDF)).rejects.toThrow(ServiceUnavailableException)
      await expect(local.myResumeLink('L1')).rejects.toThrow(ServiceUnavailableException)
      await expect(local.staffResumeLink(staff, 'P1', 'L1')).rejects.toThrow(
        ServiceUnavailableException
      )
      expect(state.logs).toHaveLength(0)
      // Real private storage is fine in production.
      await expect(service.myResumeLink('L1')).resolves.toBeTruthy()
    } finally {
      process.env.NODE_ENV = prev
    }
  })
  it('asks storage for a forced download of the resume', async () => {
    await service.myResumeLink('L1')
    expect(storage.getSignedUrl).toHaveBeenCalledWith(expect.any(String), 300, {
      downloadName: 'cv.pdf',
    })
  })
  it('stores under the person private key (no provider), replaces the old object, never returns the key', async () => {
    const dto = await service.uploadResume('L1', PDF)
    const [key, , type] = storage.upload.mock.calls[0] as unknown as [string, Buffer, string]
    expect(key).toMatch(/^talent\/resumes\/L1\/[0-9a-f-]{36}-cv\.pdf$/)
    expect(type).toBe('application/pdf')
    expect(storage.delete).toHaveBeenCalledWith('talent/resumes/L1/abc-cv.pdf')
    expect(JSON.stringify(dto)).not.toContain('talent/resumes')
  })
  it('keeps the new resume when deleting the old object fails', async () => {
    storage.delete.mockRejectedValueOnce(new Error('r2 down'))
    const dto = await service.uploadResume('L1', PDF)
    expect(dto.resume?.name).toBe('cv.pdf')
  })
  it('removes the new object if the row cannot be saved', async () => {
    prisma.talentProfile.upsert.mockRejectedValueOnce(new Error('db'))
    await expect(service.uploadResume('L1', PDF)).rejects.toThrow('db')
    expect(storage.delete).toHaveBeenCalledTimes(1)
    expect((storage.delete.mock.calls[0] as unknown[])[0]).not.toBe('talent/resumes/L1/abc-cv.pdf')
  })
  it('deletes a resume and its object; 404 for a link without one', async () => {
    const dto = await service.deleteResume('L1')
    expect(dto.resume).toBeNull()
    expect(storage.delete).toHaveBeenCalledWith('talent/resumes/L1/abc-cv.pdf')
    await expect(service.myResumeLink('L1')).rejects.toThrow(NotFoundException)
  })
  it('flips complete both ways with the resume, and settles the courses each time', async () => {
    // L5 has every other field; the resume is the last piece.
    state.profiles.push(
      base('L5', {
        educations: [edu('master')],
        yearsExperience: 1,
        industries: ['x'],
        targetRoles: ['x'],
      })
    )
    expect((await service.myProfile('L5')).profile.complete).toBe(false)
    const up = await service.uploadResume('L5', PDF)
    expect(up.complete).toBe(true)
    expect(up.completedAt).not.toBeNull()
    expect(learner.syncProfileState).toHaveBeenCalledTimes(1)
    expect(learner.syncProfileState).toHaveBeenLastCalledWith('L5')
    const down = await service.deleteResume('L5')
    expect(down.resume).toBeNull()
    expect(down.complete).toBe(false)
    expect(down.completedAt).toBe(up.completedAt) // first completion is kept
    expect(learner.syncProfileState).toHaveBeenCalledTimes(2)
  })
  it('the requirement is not satisfied until a resume exists, then is', async () => {
    state.profiles = [
      base('L1', {
        educations: [edu('master')],
        yearsExperience: 1,
        industries: ['x'],
        targetRoles: ['x'],
        updatedAt: new Date(),
      }),
    ]
    expect((await service.myProfile('L1')).requirements[0].satisfied).toBe(false)
    await service.uploadResume('L1', PDF)
    expect((await service.myProfile('L1')).requirements[0].satisfied).toBe(true)
    await service.deleteResume('L1')
    expect((await service.myProfile('L1')).requirements[0].satisfied).toBe(false)
  })
  it('staff see the same definition: no resume, not complete', async () => {
    state.profiles.find((p) => p.userId === 'L3')!.resumeKey = null
    expect(await service.staffProfile(staff, 'P1', 'L3')).toMatchObject({
      status: 'not_shared',
      complete: false,
    })
  })
  it('gives a 300 second signed link', async () => {
    const link = await service.myResumeLink('L1')
    expect(link.expiresInSeconds).toBe(300)
    expect(storage.getSignedUrl).toHaveBeenCalledWith('talent/resumes/L1/abc-cv.pdf', 300, {
      downloadName: 'cv.pdf',
    })
  })
})

describe('staff access', () => {
  const calls: [string, () => Promise<unknown>][] = [
    ['search', () => service.searchParticipants(who, 'P1', {})],
    ['header', () => service.participantHeader(who, 'P1', 'L1')],
    ['profile', () => service.staffProfile(who, 'P1', 'L1')],
    ['compensation', () => service.staffCompensation(who, 'P1', 'L1')],
    ['resume', () => service.staffResumeLink(who, 'P1', 'L1')],
    ['export', () => service.exportCsv(who, 'P1', {}, true)],
  ]
  let who: { userId: string; role: string | undefined } = staff
  it.each([
    ['a learner', { userId: 'L1', role: undefined }],
    ['a case manager', { userId: 'staff-p1', role: 'case-manager' }],
    ['an agency admin', { userId: 'staff-p1', role: 'agency-admin' }],
    ['staff of another provider', { userId: 'staff-p2', role: 'provider-admin' }],
    [
      'an organization admin without the provider membership',
      { userId: 'org-1', role: 'provider-admin' },
    ],
  ])('refuses %s on every staff call, with no audit row', async (_n, actor) => {
    who = actor
    for (const [, call] of calls) await expect(call()).rejects.toThrow(ForbiddenException)
    expect(state.logs).toEqual([])
    who = staff
  })
  it('404s a person who is not a participant of the provider', async () => {
    await expect(service.participantHeader(staff, 'P1', 'L2')).rejects.toThrow(NotFoundException)
    await expect(service.staffProfile(staff, 'P1', 'L2')).rejects.toThrow(NotFoundException)
    await expect(service.staffCompensation(staff, 'P1', 'L2')).rejects.toThrow(NotFoundException)
    await expect(service.staffResumeLink(staff, 'P1', 'L2')).rejects.toThrow(NotFoundException)
    expect(state.logs).toEqual([])
  })
  it('a system admin passes', async () => {
    await expect(
      service.searchParticipants({ userId: 'root', role: 'system-admin' }, 'P1', {})
    ).resolves.toHaveLength(4)
  })
})

describe('an organization sees the people in the cohorts it hosts', () => {
  const org = { userId: 'staff-h1', role: 'provider-admin' }
  it('lists everyone enrolled in cohorts hosted by the organization, and no one else', async () => {
    const rows = await service.searchParticipants(org, 'H1', {})
    // C1 and C2 are hosted by H1; C3 is hosted by an agency, so L5 is not in H1's scope.
    expect(rows.map((r) => r.userId).sort()).toEqual(['L1', 'L2', 'L3', 'L4'])
  })
  it('shows a person only if they are in a hosted cohort', async () => {
    await expect(service.participantHeader(org, 'H1', 'L5')).rejects.toThrow(NotFoundException)
  })
  it('refuses staff of the provider on the organization, and organization staff on the provider', async () => {
    await expect(service.searchParticipants(staff, 'H1', {})).rejects.toThrow(ForbiddenException)
    await expect(service.searchParticipants(org, 'P1', {})).rejects.toThrow(ForbiddenException)
  })
  it('an organization does not gain people just because its host runs a provider course elsewhere', async () => {
    // P1 has L5 (host A1, an agency). Staff of P1 still see L5; H1 does not.
    const p1 = await service.searchParticipants(staff, 'P1', {})
    expect(p1.map((r) => r.userId)).toContain('L5')
  })
})

describe('sharing decides what staff of a provider see', () => {
  it('the staff of P1 see the content of a profile shared with P1', async () => {
    const v = await service.staffProfile(staff, 'P1', 'L1')
    expect(v).toMatchObject({
      shared: true,
      status: 'shared',
      userId: 'L1',
      yearsExperience: 5,
      industries: ['Aerospace'],
      allowEmployers: true,
      complete: true,
      fresh: true,
    })
    if (v.shared) expect(v.educations.map((e) => e.level)).toEqual(['associate', 'bachelor'])
  })
  it('a profile not shared with P1 gives status only: complete and fresh, never a field of content', async () => {
    const v = await service.staffProfile(staff, 'P1', 'L3')
    expect(v).toEqual({
      shared: false,
      status: 'not_shared',
      userId: 'L3',
      complete: true,
      fresh: false, // saved 400 days ago, C1 refreshes every 6 months
    })
    expect(JSON.stringify(v)).not.toMatch(/Retail|master|yearsExperience|resume/)
  })
  it('a profile shared with another organization only does not let P1 see it', async () => {
    state.enrolled.push({ userId: 'L2', providerId: 'P1', cohortId: 'C3', hostId: 'A1' })
    const v = await service.staffProfile(staff, 'P1', 'L2') // L2 shared with P2 only
    expect(v).toMatchObject({ shared: false, status: 'not_shared' })
    expect(JSON.stringify(v)).not.toMatch(/Aerospace|doctorate/)
    await expect(service.staffCompensation(staff, 'P1', 'L2')).rejects.toThrow(ForbiddenException)
    await expect(service.staffResumeLink(staff, 'P1', 'L2')).rejects.toThrow(ForbiddenException)
  })
  it('a learner with no profile at all is status none', async () => {
    expect(await service.staffProfile(staff, 'P1', 'L5')).toEqual({
      shared: false,
      status: 'none',
      userId: 'L5',
      complete: null,
      fresh: null,
    })
  })
  it('a share without a profile row behind it is also none', async () => {
    state.shares.push({ userId: 'L5', institutionId: 'P1', allowEmployers: false })
    expect(await service.staffProfile(staff, 'P1', 'L5')).toMatchObject({
      shared: false,
      status: 'none',
    })
  })
  it('a withdrawn participant keeps their sharing choice: shared stays visible, unshared stays hidden', async () => {
    expect(await service.staffProfile(staff, 'P1', 'L4')).toMatchObject({ shared: true })
    state.shares = state.shares.filter((s) => s.userId !== 'L4')
    expect(await service.staffProfile(staff, 'P1', 'L4')).toMatchObject({
      shared: false,
      status: 'not_shared',
    })
  })
  it('withdrawing the share closes it at once', async () => {
    await service.saveProfile('L1', { shares: [] })
    expect(await service.staffProfile(staff, 'P1', 'L1')).toMatchObject({ shared: false })
  })
  it('unshared: compensation and resume are refused (403), unaudited, and nothing is read or signed', async () => {
    prisma.talentProfile.findUnique.mockClear()
    await expect(service.staffCompensation(staff, 'P1', 'L3')).rejects.toThrow(ForbiddenException)
    await expect(service.staffResumeLink(staff, 'P1', 'L3')).rejects.toThrow(ForbiddenException)
    expect(state.logs).toEqual([])
    expect(prisma.talentProfile.findUnique).not.toHaveBeenCalled()
    expect(storage.getSignedUrl).not.toHaveBeenCalled()
  })
  it('fresh is null when no requiring cohort of the provider sets a period', async () => {
    // L5 is only in C3, which does not require the profile.
    state.profiles.push(
      base('L5', {
        resumeKey: 'talent/resumes/L5/cv.pdf',
        resumeName: 'cv.pdf',
        educations: [edu('master')],
        yearsExperience: 1,
        industries: ['x'],
        targetRoles: ['x'],
      })
    )
    expect(await service.staffProfile(staff, 'P1', 'L5')).toMatchObject({
      status: 'not_shared',
      complete: true,
      fresh: null,
    })
  })
})

describe('audit', () => {
  const trail = () => state.logs.map((l) => `${l.resource}/${l.action}/${l.subjectUserId}`)
  it('opening a shared profile logs talent_profile/read only and carries no amount', async () => {
    const view = await service.staffProfile(staff, 'P1', 'L1')
    expect(view).toMatchObject({ hasCompensation: true })
    expect(JSON.stringify(view)).not.toMatch(/"(previous|target)Compensation"|7770001|7770002/)
    expect(trail()).toEqual(['talent_profile/read/L1'])
  })
  it('reading only a status writes no audit row, since no content was read', async () => {
    await service.staffProfile(staff, 'P1', 'L3')
    await service.staffProfile(staff, 'P1', 'L5')
    expect(state.logs).toEqual([])
  })
  it('hasCompensation is false with no amounts', async () => {
    state.profiles.find((p) => p.userId === 'L1')!.previousCompensation = null
    state.profiles.find((p) => p.userId === 'L1')!.targetCompensation = null
    expect(await service.staffProfile(staff, 'P1', 'L1')).toMatchObject({ hasCompensation: false })
  })
  it('the reveal returns the amounts and logs compensation/read once', async () => {
    expect(await service.staffCompensation(staff, 'P1', 'L1')).toEqual({
      previousCompensation: PREV,
      targetCompensation: TARGET,
    })
    expect(trail()).toEqual(['compensation/read/L1'])
  })
  it('the reveal 404s when the profile is shared but gone', async () => {
    state.profiles = state.profiles.filter((p) => p.userId !== 'L1')
    await expect(service.staffCompensation(staff, 'P1', 'L1')).rejects.toThrow(NotFoundException)
  })
  it('a failing audit write fails the reveal before the amounts are read', async () => {
    state.failLog = true
    prisma.talentProfile.findUnique.mockClear()
    await expect(service.staffCompensation(staff, 'P1', 'L1')).rejects.toThrow('db down')
    expect(prisma.talentProfile.findUnique).not.toHaveBeenCalled()
  })
  it('a resume download is logged with the subject', async () => {
    await service.staffResumeLink(staff, 'P1', 'L1')
    expect(state.logs).toHaveLength(1)
    expect(state.logs[0]).toMatchObject({
      resource: 'resume',
      action: 'download',
      subjectUserId: 'L1',
      providerId: 'P1',
    })
  })
  it('a failing audit write fails the request and nothing is returned', async () => {
    state.failLog = true
    await expect(service.staffProfile(staff, 'P1', 'L1')).rejects.toThrow('db down')
    await expect(service.staffResumeLink(staff, 'P1', 'L1')).rejects.toThrow('db down')
    await expect(service.exportCsv(staff, 'P1', {}, false)).rejects.toThrow('db down')
    expect(storage.getSignedUrl).not.toHaveBeenCalled()
  })
  it('export logs talent_profile/export with the shared count, and compensation/export only when included', async () => {
    await service.exportCsv(staff, 'P1', {}, false)
    expect(state.logs.map((l) => `${l.resource}/${l.action}`)).toEqual(['talent_profile/export'])
    expect(state.logs[0]).toMatchObject({
      subjectUserId: null,
      detail: 'csv, 2 rows, shared profiles only, 2 not shared left out',
    })
    state.logs = []
    await service.exportCsv(staff, 'P1', {}, true)
    expect(state.logs.map((l) => `${l.resource}/${l.action}`)).toEqual([
      'talent_profile/export',
      'compensation/export',
    ])
  })
  it('no audit detail ever carries profile content', async () => {
    await service.exportCsv(staff, 'P1', {}, true)
    await service.staffProfile(staff, 'P1', 'L1')
    await service.staffCompensation(staff, 'P1', 'L1')
    expect(JSON.stringify(state.logs)).not.toMatch(
      /Aerospace|Analyst|Retail|Lovelace|ada@|7770001|7770002|Harbor CC/
    )
  })
  it('searching writes no audit row', async () => {
    await service.searchParticipants(staff, 'P1', { q: 'ada' })
    expect(state.logs).toEqual([])
  })
})

describe('participants list and filters', () => {
  const rows = (f: object) => service.searchParticipants(staff, 'P1', f)
  it('carries profileStatus, complete and fresh for everyone, and content only for shared profiles', async () => {
    const all = Object.fromEntries((await rows({})).map((r) => [r.userId, r]))
    expect(all.L1).toMatchObject({ profileStatus: 'shared', complete: true, fresh: true })
    expect(all.L1.profile).toMatchObject({
      allowEmployers: true,
      hasResume: true,
      educationLevels: ['associate', 'bachelor'],
      industries: ['Aerospace'],
    })
    expect(all.L3).toMatchObject({ profileStatus: 'not_shared', complete: true, fresh: false })
    expect(all.L3.profile).toBeNull()
    expect(all.L5).toMatchObject({
      profileStatus: 'none',
      complete: null,
      fresh: null,
      profile: null,
    })
    expect(JSON.stringify(all.L3)).not.toMatch(/Retail|master/)
  })
  it('profile-field filters match shared profiles only: an unshared profile never matches', async () => {
    // L3 (not shared) has industry Retail, master, 2 years and no resume; L1 (shared) is the only match for its own.
    expect((await rows({ industry: 'retail' })).map((r) => r.userId)).toEqual([])
    expect((await rows({ educationLevel: 'master' })).map((r) => r.userId)).toEqual([])
    expect((await rows({ minYears: 2 })).map((r) => r.userId)).toEqual(['L1'])
    expect((await rows({ industry: 'aerospace' })).map((r) => r.userId)).toEqual(['L1'])
    expect(
      (await rows({ role: 'ANALYST', educationLevel: 'bachelor' })).map((r) => r.userId)
    ).toEqual(['L1'])
    expect(
      (await rows({ share: true, hasResume: true, minYears: 5 })).map((r) => r.userId)
    ).toEqual(['L1'])
    expect(await rows({ minYears: 6 })).toEqual([])
  })
  it('a profile shared with another provider never matches either', async () => {
    state.enrolled.push({ userId: 'L2', providerId: 'P1', cohortId: 'C3', hostId: 'A1' })
    expect((await rows({ industry: 'aerospace' })).map((r) => r.userId)).toEqual(['L1'])
  })
  it('share=true means the learner also allows employers', async () => {
    expect((await rows({ share: true })).map((r) => r.userId)).toEqual(['L1'])
  })
  it('status filters work on everyone: complete, and shared / not shared / none', async () => {
    expect((await rows({ completed: true })).map((r) => r.userId).sort()).toEqual([
      'L1',
      'L3',
      'L4',
    ])
    expect((await rows({ profileStatus: 'not_shared' })).map((r) => r.userId)).toEqual(['L3'])
    expect((await rows({ profileStatus: 'none' })).map((r) => r.userId)).toEqual(['L5'])
    expect((await rows({ profileStatus: 'shared' })).map((r) => r.userId).sort()).toEqual([
      'L1',
      'L4',
    ])
  })
  it('never reads the content of an unshared profile', async () => {
    await rows({})
    // The status query holds no content columns; the content query only names shared people.
    const calls = prisma.talentProfile.findMany.mock.calls.map((c) => c[0])
    const status = calls[0]
    expect(Object.keys(status.select).sort()).toEqual(
      // resumeKey is only reduced to "has a resume" for the complete flag; it is never output.
      [
        '_count',
        'industries',
        'resumeKey',
        'targetRoles',
        'updatedAt',
        'userId',
        'yearsExperience',
      ].sort()
    )
    expect([...calls[1].where.userId.in].sort()).toEqual(['L1', 'L4'])
  })
  it('searches by name or email and by cohort', async () => {
    expect((await rows({ q: 'ADA' })).map((r) => r.userId)).toEqual(['L1'])
    expect(await rows({ cohortId: 'C9' })).toEqual([])
  })
  it('does not list participants of another provider', async () => {
    const out = await rows({})
    expect(out.map((r) => r.userId).sort()).toEqual(['L1', 'L3', 'L4', 'L5'])
  })
})

describe('export: shared profiles only', () => {
  it('has only shared people, with every education entry and allow_employers', async () => {
    const csv = (await service.exportCsv(staff, 'P1', {}, false)).replace('﻿', '')
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe(
      'name,email,cohorts,education,years_experience,industries,target_roles,available_from,has_resume,allow_employers,completed'
    )
    expect(lines).toHaveLength(3) // header, L1, L4
    expect(csv).toContain('Ada Lovelace')
    expect(csv).toContain('associate - Harbor CC; bachelor')
    expect(csv).toContain('Withdrawn Wes')
    expect(csv).not.toMatch(/HYPERLINK|Retail|No Profile/)
    const ada = lines.find((l) => l.startsWith('Ada'))!
    expect(ada).toContain(',yes,yes') // has_resume, allow_employers
    expect(lines.find((l) => l.startsWith('Withdrawn'))).toMatch(/,yes,no,yes$/)
  })
  it('profile filters still apply, and never bring an unshared person in', async () => {
    const csv = await service.exportCsv(staff, 'P1', { industry: 'retail' }, false)
    expect(csv.trim().split('\r\n')).toHaveLength(1)
  })
  it('neutralizes formulas in cells', async () => {
    state.users.L4.displayName = '=cmd|x'
    const csv = await service.exportCsv(staff, 'P1', {}, false)
    expect(csv).toContain(`"'=cmd|x"`.replace(/"/g, '')) // leading apostrophe
    expect(csv).not.toMatch(/(^|\r\n|,)=/)
  })
  it('starts with a UTF-8 byte order mark', async () => {
    const csv = await service.exportCsv(staff, 'P1', {}, false)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })
  it('the opted-in export has the columns and the amounts, for shared people only', async () => {
    const csv = await service.exportCsv(staff, 'P1', {}, true)
    expect(csv.split('\r\n')[0]).toMatch(/previous_compensation,target_compensation$/)
    expect(csv).toContain(`${PREV},${TARGET}`)
    // L3 is not shared and has previous pay 4242: it must not appear anywhere.
    expect(csv).not.toContain('4242')
  })
  it('refuses an export over the row cap instead of truncating, and logs nothing', async () => {
    const many = Array.from({ length: 2001 }, (_, i) => ({
      userId: `X${i}`,
      providerId: 'P1',
      cohortId: 'C3',
      hostId: 'A1',
    }))
    state.enrolled = many
    for (const m of many) {
      state.users[m.userId] = { displayName: m.userId, email: `${m.userId}@x.org` }
      state.profiles.push(base(m.userId, { educations: [edu('other')] }))
      state.shares.push({ userId: m.userId, institutionId: 'P1', allowEmployers: false })
    }
    try {
      await expect(service.exportCsv(staff, 'P1', {}, false)).rejects.toThrow(
        PayloadTooLargeException
      )
      expect(state.logs).toHaveLength(0)
    } finally {
      for (const m of many) delete state.users[m.userId]
    }
  })
})

describe('compensation never leaks outside the reveal endpoint, the learner own profile and the opted-in export', () => {
  it('list rows, header, resume link, default export and audit rows carry no amount', async () => {
    const collected: unknown[] = []
    collected.push(await service.searchParticipants(staff, 'P1', {}))
    collected.push(await service.participantHeader(staff, 'P1', 'L1'))
    collected.push(await service.staffResumeLink(staff, 'P1', 'L1'))
    collected.push(await service.exportCsv(staff, 'P1', {}, false))
    collected.push(await service.staffProfile(staff, 'P1', 'L1'))
    collected.push(await service.staffProfile(staff, 'P1', 'L3'))
    collected.push(state.logs)
    for (const bad of [{ previousCompensation: PREV * 100 }, { targetCompensation: -PREV }]) {
      collected.push(await service.saveProfile('L1', bad).catch((e: Error) => e.message))
    }
    collected.push(await service.saveProfile('ghost', {}).catch((e: Error) => e.message))
    const text = JSON.stringify(collected)
    expect(text).not.toMatch(new RegExp(`${PREV}|${TARGET}|${PREV * 100}`))
    expect(text).not.toMatch(/compensation_|"previousCompensation"|"targetCompensation"/i)
    expect(text).toContain('"hasCompensation":true')
    // No staff query ever reads the columns, except the opted-in export.
    for (const [arg] of prisma.talentProfile.findMany.mock.calls) {
      if (arg.select.previousCompensation !== undefined) {
        expect(arg.select.previousCompensation).toBe(false)
        expect(arg.select.targetCompensation).toBe(false)
      }
    }
  })
  it('a staff member cannot read compensation about themselves', async () => {
    state.enrolled.push({ userId: 'staff-p1', providerId: 'P1', cohortId: 'C1', hostId: 'H1' })
    try {
      await expect(service.staffCompensation(staff, 'P1', 'staff-p1')).rejects.toThrow(
        ForbiddenException
      )
      expect(state.logs).toHaveLength(0)
    } finally {
      state.enrolled.pop()
    }
  })
  it('only the learner own dto carries compensation', () => {
    expect(toProfileDto(state.profiles[0] as never).previousCompensation).toBe(PREV)
    expect(toProfileDto(null).previousCompensation).toBeNull()
  })
})
