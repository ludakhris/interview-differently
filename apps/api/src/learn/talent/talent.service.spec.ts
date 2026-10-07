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

const state = {
  profiles: [] as Record<string, unknown>[],
  logs: [] as Record<string, unknown>[],
  failLog: false,
  enrolled: [
    // learner L1 is with provider P1 (cohort C1); L2 is with provider P2 only.
    { userId: 'L1', providerId: 'P1', cohortId: 'C1' },
    { userId: 'L2', providerId: 'P2', cohortId: 'C2' },
    { userId: 'L3', providerId: 'P1', cohortId: 'C1' },
  ],
  users: {
    L1: { displayName: 'Ada Lovelace', email: 'ada@x.org' },
    L2: { displayName: 'Grace Hopper', email: 'grace@x.org' },
    L3: { displayName: '=HYPERLINK("http://evil")', email: 'l3@x.org' },
  } as Record<string, { displayName: string; email: string }>,
}

const base = (userId: string, providerId: string, over: Record<string, unknown> = {}) => ({
  providerId,
  userId,
  resumeKey: null,
  resumeName: null,
  resumeSize: null,
  resumeUploadedAt: null,
  educationLevel: null,
  fieldOfStudy: null,
  school: null,
  graduationYear: null,
  yearsExperience: null,
  industries: [],
  previousCompensation: null,
  targetCompensation: null,
  targetRoles: [],
  availableFrom: null,
  shareWithEmployers: false,
  completedAt: null,
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  ...over,
})

const find = (w: { providerId_userId: { providerId: string; userId: string } }) =>
  state.profiles.find(
    (p) =>
      p.providerId === w.providerId_userId.providerId && p.userId === w.providerId_userId.userId
  )

const prisma = {
  enrollment: {
    findFirst: jest.fn(async ({ where }) =>
      state.enrolled.find(
        (e) => e.userId === where.userId && e.providerId === where.cohort.course.providerId
      )
        ? { id: 'e' }
        : null
    ),
    findMany: jest.fn(async ({ where }) => {
      const provider = where.cohort?.course?.providerId
      let rows = state.enrolled.filter((e) => !provider || e.providerId === provider)
      if (where.userId && typeof where.userId === 'string')
        rows = rows.filter((e) => e.userId === where.userId)
      if (where.userId?.in) rows = rows.filter((e) => where.userId.in.includes(e.userId))
      const q = where.user?.OR?.[0]?.displayName?.contains?.toLowerCase()
      if (q)
        rows = rows.filter(
          (e) =>
            state.users[e.userId].displayName.toLowerCase().includes(q) ||
            state.users[e.userId].email.toLowerCase().includes(q)
        )
      return rows.map((e) => ({
        userId: e.userId,
        status: 'enrolled',
        user: state.users[e.userId],
        cohort: {
          id: e.cohortId,
          name: `Cohort ${e.cohortId}`,
          course: {
            title: 'Data',
            providerId: e.providerId,
            provider: { name: `Prov ${e.providerId}` },
          },
        },
      }))
    }),
  },
  membership: {
    findFirst: jest.fn(async ({ where }) =>
      where.userId === 'staff-p1' && where.institutionId === 'P1' && where.cohortId === null
        ? { id: 'm' }
        : null
    ),
  },
  talentProfile: {
    findUnique: jest.fn(async ({ where }) => {
      const r = find(where)
      return r ? { ...r } : null
    }),
    findMany: jest.fn(async ({ where, select }) =>
      state.profiles
        .filter(
          (p) =>
            (!where.providerId?.in
              ? p.providerId === where.providerId
              : where.providerId.in.includes(p.providerId)) &&
            (where.userId?.in ? where.userId.in.includes(p.userId) : p.userId === where.userId)
        )
        .map((p) => {
          if (!select) return p
          const out: Record<string, unknown> = {}
          for (const [k, on] of Object.entries(select)) if (on) out[k] = p[k]
          return out
        })
    ),
    upsert: jest.fn(async ({ where, create, update }) => {
      const cur = find(where)
      if (cur) return Object.assign(cur, update)
      const row = { ...base(create.userId, create.providerId), ...create }
      state.profiles.push(row)
      return row
    }),
    update: jest.fn(async ({ where, data }) => Object.assign(find(where)!, data)),
  },
  supportItem: { groupBy: jest.fn(async () => []) },
  participantNote: { groupBy: jest.fn(async () => []) },
  dataAccessLog: {
    create: jest.fn(async ({ data }) => {
      if (state.failLog) throw new Error('db down')
      state.logs.push(data)
    }),
  },
  user: { findUnique: jest.fn(async () => ({ displayName: 'Staff Person', email: 's@x.org' })) },
}
const storage = {
  upload: jest.fn(async () => undefined),
  delete: jest.fn(async () => undefined),
  getSignedUrl: jest.fn(async (key: string, s: number) => `https://signed.test/${key}?exp=${s}`),
}
const learner = { completeProfileItems: jest.fn(async () => 1) }

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
  state.profiles = [
    base('L1', 'P1', {
      resumeKey: 'talent/resumes/P1/L1/abc-cv.pdf',
      resumeName: 'cv.pdf',
      resumeSize: 10,
      educationLevel: 'bachelor',
      yearsExperience: 5,
      industries: ['Aerospace'],
      targetRoles: ['Analyst'],
      previousCompensation: PREV,
      targetCompensation: TARGET,
      shareWithEmployers: true,
      completedAt: new Date('2026-10-02T00:00:00Z'),
    }),
    base('L3', 'P1', { school: '=cmd|x', previousCompensation: 5 }),
  ]
  state.logs = []
  state.failLog = false
})

describe('learner side: own data only', () => {
  it('lists only the providers the learner is with, without the storage key', async () => {
    const mine = await service.myProfiles('L1')
    expect(mine.map((m) => m.providerId)).toEqual(['P1'])
    expect(JSON.stringify(mine)).not.toContain('talent/resumes')
    expect(mine[0].profile?.resume?.name).toBe('cv.pdf')
  })
  it('refuses to read or write a provider the learner is not enrolled with', async () => {
    await expect(service.saveProfile('L2', 'P1', { school: 'x' })).rejects.toThrow(
      ForbiddenException
    )
    await expect(service.uploadResume('L2', 'P1', PDF)).rejects.toThrow(ForbiddenException)
    await expect(service.myResumeLink('L2', 'P1')).rejects.toThrow(ForbiddenException)
    await expect(service.deleteResume('L2', 'P1')).rejects.toThrow(ForbiddenException)
    expect(storage.upload).not.toHaveBeenCalled()
  })
  it('always writes the caller own row, never one named in the body', async () => {
    await service.saveProfile('L3', 'P1', { school: 'Mine', userId: 'L1', providerId: 'P2' })
    expect(state.profiles.find((p) => p.userId === 'L1')?.school).toBeNull()
    expect(state.profiles.find((p) => p.userId === 'L3')?.school).toBe('Mine')
  })
  it('saves, sets consentUpdatedAt only when consent changes', async () => {
    await service.saveProfile('L3', 'P1', { shareWithEmployers: true })
    const call = prisma.talentProfile.upsert.mock.calls[0][0]
    expect(call.update.consentUpdatedAt).toBeInstanceOf(Date)
    await service.saveProfile('L3', 'P1', { shareWithEmployers: true, school: 'S' })
    expect(prisma.talentProfile.upsert.mock.calls[1][0].update.consentUpdatedAt).toBeUndefined()
  })
  it('complete needs the required fields, then sets completedAt and the course item', async () => {
    await expect(service.saveProfile('L3', 'P1', { complete: true })).rejects.toThrow(
      BadRequestException
    )
    expect(learner.completeProfileItems).not.toHaveBeenCalled()
    const dto = await service.saveProfile('L3', 'P1', {
      complete: true,
      educationLevel: 'associate',
      yearsExperience: 0,
      targetRoles: ['Tech'],
    })
    expect(dto.completedAt).not.toBeNull()
    expect(learner.completeProfileItems).toHaveBeenCalledWith('L3', 'P1')
  })
  it('a plain save does not complete the course item', async () => {
    await service.saveProfile('L3', 'P1', { school: 'S' })
    expect(learner.completeProfileItems).not.toHaveBeenCalled()
  })
  it('an explicit null clears the education level before the completeness check', async () => {
    await expect(
      service.saveProfile('L1', 'P1', { complete: true, educationLevel: null })
    ).rejects.toThrow(/education level/)
  })
})

describe('resume upload', () => {
  it('rejects a fake pdf, a wrong type and an oversize file, storing nothing', async () => {
    const fake = { ...PDF, buffer: Buffer.from('MZ not a pdf') }
    await expect(service.uploadResume('L1', 'P1', fake)).rejects.toThrow(BadRequestException)
    await expect(
      service.uploadResume('L1', 'P1', { ...PDF, mimetype: 'text/html' })
    ).rejects.toThrow(BadRequestException)
    const big = {
      ...PDF,
      buffer: Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(5 * 1024 * 1024)]),
    }
    await expect(service.uploadResume('L1', 'P1', big)).rejects.toThrow(/too large/)
    await expect(service.uploadResume('L1', 'P1', undefined)).rejects.toThrow(BadRequestException)
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
      await expect(local.uploadResume('L1', 'P1', PDF)).rejects.toThrow(ServiceUnavailableException)
      await expect(local.myResumeLink('L1', 'P1')).rejects.toThrow(ServiceUnavailableException)
      await expect(local.staffResumeLink(staff, 'P1', 'L1')).rejects.toThrow(
        ServiceUnavailableException
      )
      expect(state.logs).toHaveLength(0)
      // Real private storage is fine in production.
      await expect(service.myResumeLink('L1', 'P1')).resolves.toBeTruthy()
    } finally {
      process.env.NODE_ENV = prev
    }
  })
  it('asks storage for a forced download of the resume', async () => {
    await service.myResumeLink('L1', 'P1')
    expect(storage.getSignedUrl).toHaveBeenCalledWith(expect.any(String), 300, {
      downloadName: 'cv.pdf',
    })
  })
  it('stores under the private key, replaces the old object, and never returns the key', async () => {
    const dto = await service.uploadResume('L1', 'P1', PDF)
    const [key, , type] = storage.upload.mock.calls[0] as unknown as [string, Buffer, string]
    expect(key).toMatch(/^talent\/resumes\/P1\/L1\/[0-9a-f-]{36}-cv\.pdf$/)
    expect(type).toBe('application/pdf')
    expect(storage.delete).toHaveBeenCalledWith('talent/resumes/P1/L1/abc-cv.pdf')
    expect(JSON.stringify(dto)).not.toContain('talent/resumes')
  })
  it('keeps the new resume when deleting the old object fails', async () => {
    storage.delete.mockRejectedValueOnce(new Error('r2 down'))
    const dto = await service.uploadResume('L1', 'P1', PDF)
    expect(dto.resume?.name).toBe('cv.pdf')
  })
  it('removes the new object if the row cannot be saved', async () => {
    prisma.talentProfile.upsert.mockRejectedValueOnce(new Error('db'))
    await expect(service.uploadResume('L1', 'P1', PDF)).rejects.toThrow('db')
    expect(storage.delete).toHaveBeenCalledTimes(1)
    expect((storage.delete.mock.calls[0] as unknown[])[0]).not.toBe(
      'talent/resumes/P1/L1/abc-cv.pdf'
    )
  })
  it('deletes a resume and its object; 404 for a link without one', async () => {
    const dto = await service.deleteResume('L1', 'P1')
    expect(dto.resume).toBeNull()
    expect(storage.delete).toHaveBeenCalledWith('talent/resumes/P1/L1/abc-cv.pdf')
    await expect(service.myResumeLink('L1', 'P1')).rejects.toThrow(NotFoundException)
  })
  it('gives a 300 second signed link', async () => {
    const link = await service.myResumeLink('L1', 'P1')
    expect(link.expiresInSeconds).toBe(300)
    expect(storage.getSignedUrl).toHaveBeenCalledWith('talent/resumes/P1/L1/abc-cv.pdf', 300, {
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
    ).resolves.toHaveLength(2)
  })
})

describe('audit', () => {
  const trail = () => state.logs.map((l) => `${l.resource}/${l.action}/${l.subjectUserId}`)
  it('opening the profile logs talent_profile/read only and carries no amount', async () => {
    const view = await service.staffProfile(staff, 'P1', 'L1')
    expect(view?.hasCompensation).toBe(true)
    expect(JSON.stringify(view)).not.toMatch(/"(previous|target)Compensation"|7770001|7770002/)
    expect(trail()).toEqual(['talent_profile/read/L1'])
  })
  it('hasCompensation is false with no amounts; null when there is no profile', async () => {
    state.profiles = [base('L1', 'P1')]
    expect((await service.staffProfile(staff, 'P1', 'L1'))?.hasCompensation).toBe(false)
    expect(trail()).toEqual(['talent_profile/read/L1'])
    state.logs = []
    state.profiles = []
    expect(await service.staffProfile(staff, 'P1', 'L1')).toBeNull()
    expect(trail()).toEqual(['talent_profile/read/L1'])
  })
  it('the reveal returns the amounts and logs compensation/read once', async () => {
    await service.staffProfile(staff, 'P1', 'L1')
    state.logs = []
    expect(await service.staffCompensation(staff, 'P1', 'L1')).toEqual({
      previousCompensation: PREV,
      targetCompensation: TARGET,
    })
    expect(trail()).toEqual(['compensation/read/L1'])
  })
  it('the reveal 404s without a profile', async () => {
    state.profiles = []
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
  it('export logs talent_profile/export, and compensation/export only when included', async () => {
    await service.exportCsv(staff, 'P1', {}, false)
    expect(state.logs.map((l) => `${l.resource}/${l.action}`)).toEqual(['talent_profile/export'])
    expect(state.logs[0]).toMatchObject({ subjectUserId: null, detail: 'csv, 2 rows' })
    state.logs = []
    await service.exportCsv(staff, 'P1', {}, true)
    expect(state.logs.map((l) => `${l.resource}/${l.action}`)).toEqual([
      'talent_profile/export',
      'compensation/export',
    ])
  })
  it('searching writes no audit row', async () => {
    await service.searchParticipants(staff, 'P1', { q: 'ada' })
    expect(state.logs).toEqual([])
  })
})

describe('search and filters', () => {
  it('filters by profile fields, case-insensitively', async () => {
    const f = (x: object) => service.searchParticipants(staff, 'P1', x)
    expect((await f({ industry: 'aerospace' })).map((r) => r.userId)).toEqual(['L1'])
    expect((await f({ role: 'ANALYST', educationLevel: 'bachelor' })).map((r) => r.userId)).toEqual(
      ['L1']
    )
    expect(
      (await f({ share: true, completed: true, hasResume: true, minYears: 5 })).map((r) => r.userId)
    ).toEqual(['L1'])
    expect(await f({ minYears: 6 })).toEqual([])
    expect(await f({ cohortId: 'C9' })).toEqual([])
    expect((await f({ q: 'ADA' })).map((r) => r.userId)).toEqual(['L1'])
  })
  it('does not list participants of another provider', async () => {
    const rows = await service.searchParticipants(staff, 'P1', {})
    expect(rows.map((r) => r.userId).sort()).toEqual(['L1', 'L3'])
  })
})

describe('compensation never leaks outside the reveal endpoint and the opted-in export', () => {
  it('list rows, header, resume link, default export and audit rows carry no amount', async () => {
    const collected: unknown[] = []
    collected.push(await service.searchParticipants(staff, 'P1', {}))
    collected.push(await service.participantHeader(staff, 'P1', 'L1'))
    collected.push(await service.staffResumeLink(staff, 'P1', 'L1'))
    collected.push(await service.exportCsv(staff, 'P1', {}, false))
    // The profile view itself must carry no amount (the learner own dto and the reveal do).
    collected.push(await service.staffProfile(staff, 'P1', 'L1'))
    collected.push(state.logs)
    // Errors from every failing path.
    for (const bad of [{ previousCompensation: PREV * 100 }, { targetCompensation: -PREV }]) {
      collected.push(await service.saveProfile('L1', 'P1', bad).catch((e: Error) => e.message))
    }
    collected.push(await service.saveProfile('L2', 'P1', {}).catch((e: Error) => e.message))
    const text = JSON.stringify(collected)
    expect(text).not.toMatch(new RegExp(`${PREV}|${TARGET}|${PREV * 100}`))
    expect(text).not.toMatch(/compensation_|"previousCompensation"|"targetCompensation"/i)
    expect(text).toContain('"hasCompensation":true')
    // The list query never even reads the columns.
    const select = prisma.talentProfile.findMany.mock.calls[0][0].select
    expect(select.previousCompensation).toBe(false)
    expect(select.targetCompensation).toBe(false)
  })
  it('the opted-in export has the columns and the amounts', async () => {
    const csv = await service.exportCsv(staff, 'P1', { q: 'ada' }, true)
    expect(csv.split('\r\n')[0]).toMatch(/previous_compensation,target_compensation$/)
    expect(csv).toContain(`${PREV},${TARGET}`)
  })
  it('the default export has no compensation columns', async () => {
    const csv = await service.exportCsv(staff, 'P1', {}, false)
    expect(csv.replace('\uFEFF', '').split('\r\n')[0]).toBe(
      'name,email,cohorts,education_level,field_of_study,school,graduation_year,years_experience,industries,target_roles,available_from,has_resume,share,completed'
    )
  })
  it('neutralizes formulas in names and cells', async () => {
    const csv = await service.exportCsv(staff, 'P1', {}, false)
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`)
    expect(csv).toContain(`'=cmd|x`)
    expect(csv).not.toMatch(/(^|\r\n|,)=/)
  })
  it('starts with a UTF-8 byte order mark', async () => {
    const csv = await service.exportCsv(staff, 'P1', {}, false)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })
  it('refuses an export over the row cap instead of truncating, and logs nothing', async () => {
    const many = Array.from({ length: 2001 }, (_, i) => ({
      userId: `X${i}`,
      providerId: 'P1',
      cohortId: 'C1',
    }))
    const saved = state.enrolled
    state.enrolled = many
    for (const m of many)
      state.users[m.userId] = { displayName: m.userId, email: `${m.userId}@x.org` }
    try {
      await expect(service.exportCsv(staff, 'P1', {}, false)).rejects.toThrow(
        PayloadTooLargeException
      )
      expect(state.logs).toHaveLength(0)
    } finally {
      state.enrolled = saved
      for (const m of many) delete state.users[m.userId]
    }
  })
  it('a staff member cannot read compensation about themselves', async () => {
    state.enrolled.push({ userId: 'staff-p1', providerId: 'P1', cohortId: 'C1' })
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
  })
})
