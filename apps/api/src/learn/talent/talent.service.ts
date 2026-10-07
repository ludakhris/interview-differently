import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
  PRIVATE_MEDIA_STORAGE,
  type PrivateMediaStorage,
} from '../../storage/media-storage.interface'
import { LocalDiskPrivateStorage } from '../../storage/local-disk-storage'
import { DataAccessLogService } from '../data-access-log.service'
import { LearnerService } from '../learner.service'
import { ProviderAccessService } from '../provider-access.service'
import type {
  EducationEntry,
  EducationLevel,
  LearnerProfileState,
  ProfileDto,
  ProfileRequirement,
  ProfileVisibility,
  ResumeLink,
  ShareOption,
  StaffProfileResult,
  TalentCompensation,
  TalentParticipantCohort,
  TalentParticipantHeader,
  TalentParticipantRow,
} from '../talent-types'
import { csvRow } from './talent-csv'
import { parseProfileInput } from './talent-profile'
import {
  dueByOf,
  isFresh,
  isProfileComplete,
  requirementState,
  type ProfileFacts,
} from './profile-requirement'
import { MAX_RESUME_BYTES, checkResume, resumeKey, safeResumeName } from './resume'

export const RESUME_LINK_SECONDS = 300
const ROW_LIMIT = 2000
const SHAREABLE_KINDS = ['provider', 'organization']

export interface Actor {
  userId: string
  role: string | undefined
}

export interface ParticipantFilters {
  q?: string
  cohortId?: string
  /** The filters below look INSIDE a profile, so they only ever match profiles shared with the provider. */
  industry?: string
  role?: string
  educationLevel?: string
  /** The learner also allows employers. */
  share?: boolean
  hasResume?: boolean
  minYears?: number
  /** Status filters: staff may see whether a profile is complete or shared, never its content. */
  completed?: boolean
  profileStatus?: ProfileVisibility
}

export interface UploadedResume {
  originalname: string
  mimetype: string
  buffer: Buffer
}

interface EducationRow {
  level: string
  fieldOfStudy: string | null
  school: string | null
  graduationYear: number | null
}

interface ProfileRow {
  userId: string
  resumeKey: string | null
  resumeName: string | null
  resumeSize: number | null
  resumeUploadedAt: Date | null
  yearsExperience: number | null
  industries: string[]
  previousCompensation: number | null
  targetCompensation: number | null
  targetRoles: string[]
  availableFrom: Date | null
  completedAt: Date | null
  updatedAt: Date
  educations: EducationRow[]
}

const day = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)

const educationOf = (e: EducationRow): EducationEntry => ({
  level: e.level as EducationLevel,
  fieldOfStudy: e.fieldOfStudy,
  school: e.school,
  graduationYear: e.graduationYear,
})

const completeOf = (p: {
  resumeKey: string | null
  yearsExperience: number | null
  industries: string[]
  targetRoles: string[]
  educations: unknown[]
}): boolean =>
  isProfileComplete({ ...p, educationCount: p.educations.length, hasResume: !!p.resumeKey })

const resumeOf = (p: ProfileRow) =>
  p.resumeKey && p.resumeName
    ? {
        name: p.resumeName,
        size: p.resumeSize ?? 0,
        uploadedAt: (p.resumeUploadedAt ?? p.updatedAt).toISOString(),
      }
    : null

/** The learner's view of their own profile; empty values before the first save. The storage key is never part of it. */
export function toProfileDto(p: ProfileRow | null): ProfileDto {
  if (!p)
    return {
      educations: [],
      yearsExperience: null,
      industries: [],
      targetRoles: [],
      availableFrom: null,
      previousCompensation: null,
      targetCompensation: null,
      resume: null,
      complete: false,
      completedAt: null,
      updatedAt: null,
    }
  return {
    educations: p.educations.map(educationOf),
    yearsExperience: p.yearsExperience,
    industries: p.industries,
    targetRoles: p.targetRoles,
    availableFrom: day(p.availableFrom),
    previousCompensation: p.previousCompensation,
    targetCompensation: p.targetCompensation,
    resume: resumeOf(p),
    complete: completeOf(p),
    completedAt: p.completedAt ? p.completedAt.toISOString() : null,
    updatedAt: p.updatedAt.toISOString(),
  }
}

const EDUCATION_SELECT = {
  select: { level: true, fieldOfStudy: true, school: true, graduationYear: true },
  orderBy: { position: 'asc' as const },
}

const PROFILE_SELECT = (compensation: boolean) => ({
  userId: true,
  resumeKey: true,
  resumeName: true,
  resumeSize: true,
  resumeUploadedAt: true,
  yearsExperience: true,
  industries: true,
  targetRoles: true,
  availableFrom: true,
  completedAt: true,
  updatedAt: true,
  previousCompensation: compensation,
  targetCompensation: compensation,
  educations: EDUCATION_SELECT,
})

const includes = (list: string[], v: string) =>
  list.some((x) => x.toLowerCase() === v.trim().toLowerCase())

/** Talent profiles (#69 C): the learner's own data, and what a provider's staff may see of it. */
@Injectable()
export class TalentService {
  private readonly logger = new Logger(TalentService.name)

  constructor(
    readonly prisma: PrismaService,
    readonly access: ProviderAccessService,
    readonly audit: DataAccessLogService,
    @Inject(PRIVATE_MEDIA_STORAGE) private readonly storage: PrivateMediaStorage,
    @Inject(forwardRef(() => LearnerService)) private readonly learner: LearnerService
  ) {}

  /**
   * The local-disk storage serves files with no authentication, so in production a resume must
   * never go through it. Fail closed until real private storage (R2) is configured.
   */
  private assertResumeStorage(): void {
    if (process.env.NODE_ENV === 'production' && this.storage instanceof LocalDiskPrivateStorage)
      throw new ServiceUnavailableException(
        'Resume storage is not set up yet, so resumes cannot be uploaded or opened right now.'
      )
  }

  // ── the learner's own profile ─────────────────────────────────────────────

  private profileOf(userId: string): Promise<ProfileRow | null> {
    return this.prisma.talentProfile.findUnique({
      where: { userId },
      select: PROFILE_SELECT(true),
    }) as Promise<ProfileRow | null>
  }

  /** Needed for the foreign key: a learner's user row exists once they have joined a cohort. */
  private async assertLearner(userId: string): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!u) throw new ForbiddenException('Join a cohort first, then you can build your profile.')
  }

  /** The organizations the learner can show the profile to, and the cohorts that require it. */
  private async learnerContext(userId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId, cohort: { courseId: { not: null } } },
      orderBy: { enrolledAt: 'desc' },
      select: {
        status: true,
        cohort: {
          select: {
            id: true,
            name: true,
            requiresProfile: true,
            profileRefreshMonths: true,
            institution: { select: { id: true, name: true, kind: true } },
            course: { select: { provider: { select: { id: true, name: true, kind: true } } } },
          },
        },
      },
    })
    const orgs = new Map<
      string,
      {
        name: string
        kind: 'provider' | 'organization'
        why: ShareOption['why']
        required: boolean
      }
    >()
    const add = (
      inst: { id: string; name: string; kind: string },
      why: ShareOption['why'],
      required: boolean
    ) => {
      if (!SHAREABLE_KINDS.includes(inst.kind)) return
      const cur = orgs.get(inst.id)
      if (cur) {
        cur.required = cur.required || required
        if (why === 'your program') cur.why = why
      } else orgs.set(inst.id, { name: inst.name, kind: inst.kind as never, why, required })
    }
    const requiring: {
      cohortId: string
      cohortName: string
      providerName: string
      months: number | null
    }[] = []
    for (const e of enrollments) {
      const c = e.cohort
      const live = e.status !== 'withdrawn' && c.requiresProfile
      if (c.course) add(c.course.provider, 'your program', live)
      add(c.institution, 'your cohort host', live)
      if (live)
        requiring.push({
          cohortId: c.id,
          cohortName: c.name,
          providerName: c.course?.provider.name ?? c.institution.name,
          months: c.profileRefreshMonths,
        })
    }
    return { orgs, requiring }
  }

  async myProfile(userId: string, now: Date = new Date()): Promise<LearnerProfileState> {
    const [row, ctx, shares] = await Promise.all([
      this.profileOf(userId),
      this.learnerContext(userId),
      this.prisma.profileShare.findMany({
        where: { userId },
        select: { institutionId: true, allowEmployers: true },
      }),
    ])
    const shareOf = new Map(shares.map((s) => [s.institutionId, s.allowEmployers]))
    const organizations: ShareOption[] = [...ctx.orgs].map(([institutionId, o]) => ({
      institutionId,
      name: o.name,
      kind: o.kind,
      why: o.why,
      required: o.required,
      shared: shareOf.has(institutionId),
      allowEmployers: shareOf.get(institutionId) === true,
    }))
    organizations.sort((a, b) => a.name.localeCompare(b.name))
    const dto = toProfileDto(row)
    const facts: ProfileFacts | null = row
      ? { complete: dto.complete, completedAt: row.completedAt, updatedAt: row.updatedAt }
      : null
    const requirements: ProfileRequirement[] = ctx.requiring.map((r) => ({
      cohortId: r.cohortId,
      cohortName: r.cohortName,
      providerName: r.providerName,
      refreshMonths: r.months,
      satisfied: requirementState(facts, r.months, now) === 'done',
      dueBy: dueByOf(row?.updatedAt ?? null, r.months)?.toISOString() ?? null,
    }))
    return { profile: dto, organizations, requirements }
  }

  async saveProfile(userId: string, body: unknown): Promise<LearnerProfileState> {
    const patch = parseProfileInput(body)
    await this.assertLearner(userId)
    let optionIds: string[] = []
    if (patch.shares) {
      optionIds = [...(await this.learnerContext(userId)).orgs.keys()]
      if (patch.shares.some((s) => !optionIds.includes(s.institutionId)))
        throw new BadRequestException('Choose organizations from your list.')
    }
    const now = new Date()
    const existing = await this.prisma.talentProfile.findUnique({
      where: { userId },
      select: {
        completedAt: true,
        resumeKey: true,
        yearsExperience: true,
        industries: true,
        targetRoles: true,
        _count: { select: { educations: true } },
      },
    })
    const d = patch.data
    const complete = isProfileComplete({
      hasResume: !!existing?.resumeKey,
      educationCount: patch.educations?.length ?? existing?._count.educations ?? 0,
      yearsExperience:
        d.yearsExperience !== undefined ? d.yearsExperience : (existing?.yearsExperience ?? null),
      industries: d.industries ?? existing?.industries ?? [],
      targetRoles: d.targetRoles ?? existing?.targetRoles ?? [],
    })
    // First time it is complete; kept after that, even if a later edit makes it incomplete.
    const completedAt = existing?.completedAt ?? (complete ? now : null)
    const rows = (patch.educations ?? []).map((e, position) => ({ ...e, position }))
    const write = { ...d, updatedAt: now, ...(completedAt ? { completedAt } : {}) }
    const ops: unknown[] = [
      this.prisma.talentProfile.upsert({
        where: { userId },
        create: { userId, ...write, ...(patch.educations ? { educations: { create: rows } } : {}) },
        update: {
          ...write,
          ...(patch.educations ? { educations: { deleteMany: {}, create: rows } } : {}),
        },
      }),
    ]
    if (patch.shares) {
      const wanted = new Set(patch.shares.map((s) => s.institutionId))
      for (const s of patch.shares)
        ops.push(
          this.prisma.profileShare.upsert({
            where: { userId_institutionId: { userId, institutionId: s.institutionId } },
            create: { userId, institutionId: s.institutionId, allowEmployers: s.allowEmployers },
            update: { allowEmployers: s.allowEmployers, updatedAt: now },
          })
        )
      const dropped = optionIds.filter((id) => !wanted.has(id))
      if (dropped.length)
        ops.push(
          this.prisma.profileShare.deleteMany({
            where: { userId, institutionId: { in: dropped } },
          })
        )
    }
    await this.prisma.$transaction(ops as never)
    await this.learner.syncProfileState(userId)
    return this.myProfile(userId, now)
  }

  async uploadResume(userId: string, file: UploadedResume | undefined): Promise<ProfileDto> {
    this.assertResumeStorage()
    await this.assertLearner(userId)
    if (!file?.buffer?.length) throw new BadRequestException('Choose a resume to upload')
    if (file.buffer.length > MAX_RESUME_BYTES)
      throw new BadRequestException('The resume is too large (max 5 MB).')
    const checked = checkResume(file)
    if (!checked) throw new BadRequestException('Use a PDF, DOC or DOCX file.')
    const name = safeResumeName(file.originalname, checked.ext)
    const key = resumeKey(userId, name)
    const existing = await this.prisma.talentProfile.findUnique({
      where: { userId },
      select: { resumeKey: true },
    })
    await this.storage.upload(key, file.buffer, checked.contentType)
    const resume = {
      resumeKey: key,
      resumeName: name,
      resumeSize: file.buffer.length,
      resumeUploadedAt: new Date(),
    }
    try {
      await this.prisma.talentProfile.upsert({
        where: { userId },
        create: { userId, ...resume },
        update: resume,
      })
    } catch (err) {
      await this.storage.delete(key).catch(() => undefined)
      throw err
    }
    if (existing?.resumeKey && existing.resumeKey !== key) await this.dropObject(existing.resumeKey)
    return this.settleResume(userId)
  }

  async myResumeLink(userId: string): Promise<ResumeLink> {
    this.assertResumeStorage()
    const p = await this.prisma.talentProfile.findUnique({
      where: { userId },
      select: { resumeKey: true, resumeName: true },
    })
    return this.link(p)
  }

  async deleteResume(userId: string): Promise<ProfileDto> {
    const existing = await this.profileOf(userId)
    if (!existing) throw new NotFoundException('You have no profile yet')
    if (!existing.resumeKey) return toProfileDto(existing)
    await this.prisma.talentProfile.update({
      where: { userId },
      data: { resumeKey: null, resumeName: null, resumeSize: null, resumeUploadedAt: null },
    })
    await this.dropObject(existing.resumeKey)
    return this.settleResume(userId)
  }

  /**
   * A resume is part of "complete", so adding or removing one can flip it: stamp `completedAt` the
   * first time the profile is complete (as a save does) and run the same sync a save runs.
   */
  private async settleResume(userId: string): Promise<ProfileDto> {
    let row = await this.profileOf(userId)
    if (row && !row.completedAt && completeOf(row)) {
      await this.prisma.talentProfile.update({
        where: { userId },
        data: { completedAt: new Date() },
      })
      row = await this.profileOf(userId)
    }
    await this.learner.syncProfileState(userId)
    return toProfileDto(row)
  }

  /** The row no longer points at the object, so a failed delete only leaves an orphan: log it, never fail the learner. */
  private async dropObject(key: string): Promise<void> {
    try {
      await this.storage.delete(key)
    } catch {
      this.logger.warn('Could not delete a replaced resume object')
    }
  }

  private async link(
    p: { resumeKey: string | null; resumeName: string | null } | null
  ): Promise<ResumeLink> {
    if (!p?.resumeKey) throw new NotFoundException('No resume uploaded')
    const name = p.resumeName ?? 'resume'
    const url = await this.storage.getSignedUrl(p.resumeKey, RESUME_LINK_SECONDS, {
      downloadName: name,
    })
    return { url, name, expiresInSeconds: RESUME_LINK_SECONDS }
  }

  // ── staff ─────────────────────────────────────────────────────────────────

  private async staffOf(actor: Actor, providerId: string, userId?: string) {
    await this.access.assertProviderStaff(actor.userId, actor.role, providerId)
    if (userId) await this.access.assertParticipantOfProvider(providerId, userId)
  }

  /** The learner's choice for this provider: a row means its staff may read the profile. */
  private shareFor(providerId: string, userId: string) {
    return this.prisma.profileShare.findUnique({
      where: { userId_institutionId: { userId, institutionId: providerId } },
      select: { allowEmployers: true },
    })
  }

  private async assertShared(providerId: string, userId: string) {
    const share = await this.shareFor(providerId, userId)
    if (!share)
      throw new ForbiddenException('This participant has not shared their profile with you.')
    return share
  }

  /** The shortest refresh period among the person's requiring cohorts with this provider; null when none sets one. */
  private async refreshMonthsFor(providerId: string, userId: string): Promise<number | null> {
    const rows = await this.prisma.enrollment.findMany({
      where: {
        userId,
        status: { not: 'withdrawn' },
        cohort: { requiresProfile: true, course: { providerId } },
      },
      select: { cohort: { select: { profileRefreshMonths: true } } },
    })
    const months = rows.map((r) => r.cohort.profileRefreshMonths).filter((m): m is number => !!m)
    return months.length ? Math.min(...months) : null
  }

  async participantHeader(
    actor: Actor,
    providerId: string,
    userId: string
  ): Promise<TalentParticipantHeader> {
    await this.staffOf(actor, providerId, userId)
    const rows = await this.participants(providerId, { userIds: [userId] })
    const r = rows[0]
    if (!r) throw new NotFoundException('Participant not found')
    return { userId: r.row.userId, name: r.row.name, email: r.row.email, cohorts: r.row.cohorts }
  }

  async searchParticipants(
    actor: Actor,
    providerId: string,
    filters: ParticipantFilters
  ): Promise<TalentParticipantRow[]> {
    await this.staffOf(actor, providerId)
    return (await this.participants(providerId, { filters })).map((r) => r.row)
  }

  /**
   * Whether a person's profile exists, is shared with the provider, is complete and is fresh. No
   * content and no audit row (nothing sensitive is read). NO access check: the caller must have
   * already made sure the viewer is staff of this provider and the person is a participant.
   */
  async profileStatus(
    providerId: string,
    userId: string,
    now: Date = new Date()
  ): Promise<{ status: ProfileVisibility; complete: boolean | null; fresh: boolean | null }> {
    const [share, months, p] = await Promise.all([
      this.shareFor(providerId, userId),
      this.refreshMonthsFor(providerId, userId),
      this.prisma.talentProfile.findUnique({
        where: { userId },
        select: {
          updatedAt: true,
          resumeKey: true,
          yearsExperience: true,
          industries: true,
          targetRoles: true,
          _count: { select: { educations: true } },
        },
      }),
    ])
    if (!p) return { status: 'none', complete: null, fresh: null }
    return {
      status: share ? 'shared' : 'not_shared',
      complete: isProfileComplete({
        educationCount: p._count.educations,
        hasResume: !!p.resumeKey,
        yearsExperience: p.yearsExperience,
        industries: p.industries,
        targetRoles: p.targetRoles,
      }),
      fresh: months ? isFresh(p.updatedAt, months, now) : null,
    }
  }

  /**
   * The profile only if the learner shared it with this provider; otherwise just whether one exists
   * and is complete and fresh. Never carries pay: only whether any exists.
   */
  async staffProfile(
    actor: Actor,
    providerId: string,
    userId: string,
    now: Date = new Date()
  ): Promise<StaffProfileResult> {
    await this.staffOf(actor, providerId, userId)
    const [share, months] = await Promise.all([
      this.shareFor(providerId, userId),
      this.refreshMonthsFor(providerId, userId),
    ])
    if (!share) {
      const status = await this.prisma.talentProfile.findUnique({
        where: { userId },
        select: {
          updatedAt: true,
          resumeKey: true,
          yearsExperience: true,
          industries: true,
          targetRoles: true,
          _count: { select: { educations: true } },
        },
      })
      if (!status) return { shared: false, status: 'none', userId, complete: null, fresh: null }
      return {
        shared: false,
        status: 'not_shared',
        userId,
        complete: isProfileComplete({
          educationCount: status._count.educations,
          hasResume: !!status.resumeKey,
          ...status,
        }),
        fresh: months ? isFresh(status.updatedAt, months, now) : null,
      }
    }
    const p = (await this.prisma.talentProfile.findUnique({
      where: { userId },
      select: PROFILE_SELECT(true),
    })) as ProfileRow | null
    if (!p) return { shared: false, status: 'none', userId, complete: null, fresh: null }
    await this.audit.record({
      actorId: actor.userId,
      providerId,
      subjectUserId: userId,
      resource: 'talent_profile',
      action: 'read',
    })
    return {
      shared: true,
      status: 'shared',
      userId,
      educations: p.educations.map(educationOf),
      yearsExperience: p.yearsExperience,
      industries: p.industries,
      targetRoles: p.targetRoles,
      availableFrom: day(p.availableFrom),
      resume: resumeOf(p),
      hasCompensation: p.previousCompensation !== null || p.targetCompensation !== null,
      allowEmployers: share.allowEmployers,
      complete: completeOf(p),
      fresh: months ? isFresh(p.updatedAt, months, now) : null,
      completedAt: p.completedAt ? p.completedAt.toISOString() : null,
      updatedAt: p.updatedAt.toISOString(),
    }
  }

  /** The audit row is awaited first: if it cannot be written, the amounts are never read. */
  async staffCompensation(
    actor: Actor,
    providerId: string,
    userId: string
  ): Promise<TalentCompensation> {
    await this.staffOf(actor, providerId, userId)
    if (actor.userId === userId)
      throw new ForbiddenException('You cannot view compensation about yourself.')
    await this.assertShared(providerId, userId)
    await this.audit.record({
      actorId: actor.userId,
      providerId,
      subjectUserId: userId,
      resource: 'compensation',
      action: 'read',
    })
    const p = await this.prisma.talentProfile.findUnique({
      where: { userId },
      select: { previousCompensation: true, targetCompensation: true },
    })
    if (!p) throw new NotFoundException('No profile')
    return {
      previousCompensation: p.previousCompensation,
      targetCompensation: p.targetCompensation,
    }
  }

  async staffResumeLink(actor: Actor, providerId: string, userId: string): Promise<ResumeLink> {
    this.assertResumeStorage()
    await this.staffOf(actor, providerId, userId)
    await this.assertShared(providerId, userId)
    const p = await this.prisma.talentProfile.findUnique({
      where: { userId },
      select: { resumeKey: true, resumeName: true },
    })
    if (!p?.resumeKey) throw new NotFoundException('No resume uploaded')
    await this.audit.record({
      actorId: actor.userId,
      providerId,
      subjectUserId: userId,
      resource: 'resume',
      action: 'download',
    })
    return this.link(p)
  }

  /** Only profiles the learners shared with this provider. People who did not are left out, and the audit row says how many. */
  async exportCsv(
    actor: Actor,
    providerId: string,
    filters: ParticipantFilters,
    includeCompensation: boolean
  ): Promise<string> {
    await this.staffOf(actor, providerId)
    const all = await this.participants(providerId, {
      filters,
      compensation: includeCompensation,
      noCap: true,
    })
    const found = all.filter((r) => r.content)
    if (found.length > ROW_LIMIT)
      throw new PayloadTooLargeException(
        `This export has more than ${ROW_LIMIT} people. Narrow the filters (for example pick a cohort) and try again.`
      )
    const header = [
      'name',
      'email',
      'cohorts',
      'education',
      'years_experience',
      'industries',
      'target_roles',
      'available_from',
      'has_resume',
      'allow_employers',
      'completed',
      ...(includeCompensation ? ['previous_compensation', 'target_compensation'] : []),
    ]
    const lines = [csvRow(header)]
    for (const { row, content: p } of found) {
      lines.push(
        csvRow([
          row.name,
          row.email,
          row.cohorts.map((c) => c.cohortName).join('; '),
          p?.educations
            .map((e) =>
              [e.level, e.fieldOfStudy, e.school, e.graduationYear].filter((x) => x).join(' - ')
            )
            .join('; '),
          p?.yearsExperience,
          p?.industries.join('; '),
          p?.targetRoles.join('; '),
          day(p?.availableFrom ?? null),
          p?.resumeKey ? 'yes' : 'no',
          row.profile?.allowEmployers ? 'yes' : 'no',
          row.complete ? 'yes' : 'no',
          ...(includeCompensation ? [p?.previousCompensation, p?.targetCompensation] : []),
        ])
      )
    }
    const left = all.length - found.length
    const detail = `csv, ${found.length} rows, shared profiles only${left ? `, ${left} not shared left out` : ''}`
    await this.audit.record({
      actorId: actor.userId,
      providerId,
      resource: 'talent_profile',
      action: 'export',
      detail,
    })
    if (includeCompensation)
      await this.audit.record({
        actorId: actor.userId,
        providerId,
        resource: 'compensation',
        action: 'export',
        detail,
      })
    return '﻿' + lines.join('\r\n') + '\r\n'
  }

  /**
   * The provider's participants with their profile STATUS. A profile's content is read, filtered on
   * and returned only for learners who shared it with this provider; for the rest only whether it
   * exists, is complete and is fresh. The compensation columns are not read unless the caller is
   * the opted-in export, so a list row cannot carry them.
   */
  private async participants(
    providerId: string,
    opts: {
      filters?: ParticipantFilters
      userIds?: string[]
      compensation?: boolean
      /** The export must see every match so it can refuse an oversized one rather than truncate. */
      noCap?: boolean
      now?: Date
    }
  ): Promise<{ row: TalentParticipantRow; content: ProfileRow | null }[]> {
    const f = opts.filters ?? {}
    const now = opts.now ?? new Date()
    const q = f.q?.trim()
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        cohort: { course: { providerId } },
        ...(opts.userIds ? { userId: { in: opts.userIds } } : {}),
        ...(q
          ? {
              user: {
                OR: [
                  { displayName: { contains: q, mode: 'insensitive' } },
                  { email: { contains: q, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      select: {
        userId: true,
        status: true,
        user: { select: { displayName: true, email: true } },
        cohort: {
          select: {
            id: true,
            name: true,
            requiresProfile: true,
            profileRefreshMonths: true,
            course: { select: { title: true } },
          },
        },
      },
    })
    const people = new Map<
      string,
      {
        name: string
        email: string | null
        cohorts: TalentParticipantCohort[]
        months: number | null
      }
    >()
    for (const e of enrollments) {
      let p = people.get(e.userId)
      if (!p) {
        p = {
          name: e.user.displayName ?? e.user.email ?? 'Unnamed',
          email: e.user.email,
          cohorts: [],
          months: null,
        }
        people.set(e.userId, p)
      }
      p.cohorts.push({
        cohortId: e.cohort.id,
        cohortName: e.cohort.name,
        courseTitle: e.cohort.course?.title ?? '',
        enrollmentStatus: e.status as TalentParticipantCohort['enrollmentStatus'],
      })
      const m = e.cohort.profileRefreshMonths
      if (e.status !== 'withdrawn' && e.cohort.requiresProfile && m)
        p.months = p.months === null ? m : Math.min(p.months, m)
    }
    // A cohort filter keeps people in that cohort; their other cohorts still show.
    let ids = [...people.keys()]
    if (f.cohortId)
      ids = ids.filter((id) => people.get(id)!.cohorts.some((c) => c.cohortId === f.cohortId))
    if (ids.length === 0) return []
    const [shares, statusRows, supportGroups, noteGroups] = await Promise.all([
      this.prisma.profileShare.findMany({
        where: { institutionId: providerId, userId: { in: ids } },
        select: { userId: true, allowEmployers: true },
      }),
      // Enough to say whether it is complete and fresh. Not output, only reduced to two booleans.
      this.prisma.talentProfile.findMany({
        where: { userId: { in: ids } },
        select: {
          userId: true,
          updatedAt: true,
          resumeKey: true,
          yearsExperience: true,
          industries: true,
          targetRoles: true,
          _count: { select: { educations: true } },
        },
      }),
      this.prisma.supportItem.groupBy({
        by: ['userId'],
        where: { providerId, userId: { in: ids }, status: { in: ['open', 'in_progress'] } },
        _count: { _all: true },
      }),
      this.prisma.participantNote.groupBy({
        by: ['userId'],
        where: { providerId, userId: { in: ids } },
        _count: { _all: true },
      }),
    ])
    const allow = new Map(shares.map((s) => [s.userId, s.allowEmployers]))
    const statusOf = new Map(statusRows.map((s) => [s.userId, s]))
    // The content of a profile is read for the people who shared it, and only for them.
    const sharedIds = ids.filter((id) => allow.has(id) && statusOf.has(id))
    const contentRows = sharedIds.length
      ? ((await this.prisma.talentProfile.findMany({
          where: { userId: { in: sharedIds } },
          select: PROFILE_SELECT(opts.compensation === true),
        })) as ProfileRow[])
      : []
    const contentOf = new Map(contentRows.map((p) => [p.userId, p]))
    const open = new Map(supportGroups.map((g) => [g.userId, g._count._all]))
    const notes = new Map(noteGroups.map((g) => [g.userId, g._count._all]))
    const out: { row: TalentParticipantRow; content: ProfileRow | null }[] = []
    for (const id of ids) {
      const person = people.get(id)!
      const st = statusOf.get(id) ?? null
      const content = contentOf.get(id) ?? null
      const profileStatus: ProfileVisibility = !st
        ? 'none'
        : allow.has(id) && content
          ? 'shared'
          : 'not_shared'
      const complete = st
        ? isProfileComplete({
            educationCount: st._count.educations,
            hasResume: !!st.resumeKey,
            ...st,
          })
        : null
      if (f.profileStatus && f.profileStatus !== profileStatus) continue
      if (f.completed && complete !== true) continue
      // Filters that look inside the profile: an unshared profile never matches any of them.
      if (f.industry && !(content && includes(content.industries, f.industry))) continue
      if (f.role && !(content && includes(content.targetRoles, f.role))) continue
      if (f.educationLevel && !content?.educations.some((e) => e.level === f.educationLevel))
        continue
      if (f.share && !(content && allow.get(id) === true)) continue
      if (f.hasResume && !content?.resumeKey) continue
      if (f.minYears !== undefined && !((content?.yearsExperience ?? -1) >= f.minYears)) continue
      out.push({
        content,
        row: {
          userId: id,
          name: person.name,
          email: person.email,
          cohorts: person.cohorts,
          profileStatus,
          complete,
          fresh: st && person.months ? isFresh(st.updatedAt, person.months, now) : null,
          profile: content
            ? {
                hasResume: !!content.resumeKey,
                educationLevels: content.educations.map((e) => e.level),
                yearsExperience: content.yearsExperience,
                industries: content.industries,
                targetRoles: content.targetRoles,
                availableFrom: day(content.availableFrom),
                allowEmployers: allow.get(id) === true,
              }
            : null,
          openSupportItems: open.get(id) ?? 0,
          noteCount: notes.get(id) ?? 0,
        },
      })
    }
    out.sort((a, b) => a.row.name.localeCompare(b.row.name))
    return opts.noCap ? out : out.slice(0, ROW_LIMIT)
  }
}
