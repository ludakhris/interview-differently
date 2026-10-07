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
  EducationLevel,
  LearnerTalentProfileEntry,
  ResumeLink,
  TalentParticipantCohort,
  TalentParticipantHeader,
  TalentParticipantRow,
  TalentProfileDto,
  TalentCompensation,
  TalentProfileStaffView,
} from '../talent-types'
import { csvRow } from './talent-csv'
import { incompleteReason, parseProfileInput } from './talent-profile'
import { MAX_RESUME_BYTES, checkResume, resumeKey, safeResumeName } from './resume'

export const RESUME_LINK_SECONDS = 300
const ROW_LIMIT = 2000

export interface Actor {
  userId: string
  role: string | undefined
}

export interface ParticipantFilters {
  q?: string
  cohortId?: string
  industry?: string
  role?: string
  educationLevel?: string
  share?: boolean
  completed?: boolean
  hasResume?: boolean
  minYears?: number
}

export interface UploadedResume {
  originalname: string
  mimetype: string
  buffer: Buffer
}

interface ProfileRow {
  providerId: string
  userId: string
  resumeKey: string | null
  resumeName: string | null
  resumeSize: number | null
  resumeUploadedAt: Date | null
  educationLevel: string | null
  fieldOfStudy: string | null
  school: string | null
  graduationYear: number | null
  yearsExperience: number | null
  industries: string[]
  previousCompensation: number | null
  targetCompensation: number | null
  targetRoles: string[]
  availableFrom: Date | null
  shareWithEmployers: boolean
  completedAt: Date | null
  updatedAt: Date
}

const day = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)

/** The learner's view of their own profile. The storage key is never part of it. */
export function toProfileDto(p: ProfileRow): TalentProfileDto {
  return {
    providerId: p.providerId,
    resume:
      p.resumeKey && p.resumeName
        ? {
            name: p.resumeName,
            size: p.resumeSize ?? 0,
            uploadedAt: (p.resumeUploadedAt ?? p.updatedAt).toISOString(),
          }
        : null,
    educationLevel: p.educationLevel as EducationLevel | null,
    fieldOfStudy: p.fieldOfStudy,
    school: p.school,
    graduationYear: p.graduationYear,
    yearsExperience: p.yearsExperience,
    industries: p.industries,
    previousCompensation: p.previousCompensation,
    targetCompensation: p.targetCompensation,
    targetRoles: p.targetRoles,
    availableFrom: day(p.availableFrom),
    shareWithEmployers: p.shareWithEmployers,
    completedAt: p.completedAt ? p.completedAt.toISOString() : null,
    updatedAt: p.updatedAt.toISOString(),
  }
}

const PROFILE_SELECT = (compensation: boolean) => ({
  providerId: true,
  userId: true,
  resumeKey: true,
  resumeName: true,
  resumeSize: true,
  resumeUploadedAt: true,
  educationLevel: true,
  fieldOfStudy: true,
  school: true,
  graduationYear: true,
  yearsExperience: true,
  industries: true,
  targetRoles: true,
  availableFrom: true,
  shareWithEmployers: true,
  completedAt: true,
  updatedAt: true,
  previousCompensation: compensation,
  targetCompensation: compensation,
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

  /** One entry per provider the learner has a cohort with, newest cohort first. */
  async myProfiles(userId: string): Promise<LearnerTalentProfileEntry[]> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId, cohort: { course: { isNot: null } } },
      orderBy: { enrolledAt: 'desc' },
      select: {
        cohort: {
          select: {
            id: true,
            name: true,
            course: { select: { providerId: true, provider: { select: { name: true } } } },
          },
        },
      },
    })
    const byProvider = new Map<string, LearnerTalentProfileEntry>()
    for (const e of enrollments) {
      const course = e.cohort.course
      if (!course) continue
      let entry = byProvider.get(course.providerId)
      if (!entry) {
        entry = {
          providerId: course.providerId,
          providerName: course.provider.name,
          cohorts: [],
          profile: null,
        }
        byProvider.set(course.providerId, entry)
      }
      entry.cohorts.push({ cohortId: e.cohort.id, cohortName: e.cohort.name })
    }
    if (byProvider.size === 0) return []
    const profiles = await this.prisma.talentProfile.findMany({
      where: { userId, providerId: { in: [...byProvider.keys()] } },
    })
    for (const p of profiles) {
      const entry = byProvider.get(p.providerId)
      if (entry) entry.profile = toProfileDto(p)
    }
    return [...byProvider.values()]
  }

  async saveProfile(userId: string, providerId: string, body: unknown): Promise<TalentProfileDto> {
    await this.access.assertLearnerOfProvider(userId, providerId)
    const patch = parseProfileInput(body)
    const where = { providerId_userId: { providerId, userId } }
    const existing = await this.prisma.talentProfile.findUnique({ where })
    const d = patch.data
    const merged = {
      educationLevel:
        d.educationLevel !== undefined ? d.educationLevel : (existing?.educationLevel ?? null),
      yearsExperience:
        d.yearsExperience !== undefined ? d.yearsExperience : (existing?.yearsExperience ?? null),
      industries: d.industries ?? existing?.industries ?? [],
      targetRoles: d.targetRoles ?? existing?.targetRoles ?? [],
    }
    let completedAt: Date | undefined
    if (patch.complete) {
      const reason = incompleteReason(merged)
      if (reason) throw new BadRequestException(reason)
      completedAt = existing?.completedAt ?? new Date()
    }
    const consentChanged =
      patch.data.shareWithEmployers !== undefined &&
      patch.data.shareWithEmployers !== (existing?.shareWithEmployers ?? false)
    const write = {
      ...patch.data,
      ...(consentChanged ? { consentUpdatedAt: new Date() } : {}),
      ...(completedAt ? { completedAt } : {}),
    }
    const saved = await this.prisma.talentProfile.upsert({
      where,
      create: { providerId, userId, ...write },
      update: write,
    })
    if (patch.complete) await this.learner.completeProfileItems(userId, providerId)
    return toProfileDto(saved)
  }

  async uploadResume(
    userId: string,
    providerId: string,
    file: UploadedResume | undefined
  ): Promise<TalentProfileDto> {
    this.assertResumeStorage()
    await this.access.assertLearnerOfProvider(userId, providerId)
    if (!file?.buffer?.length) throw new BadRequestException('Choose a resume to upload')
    if (file.buffer.length > MAX_RESUME_BYTES)
      throw new BadRequestException('The resume is too large (max 5 MB).')
    const checked = checkResume(file)
    if (!checked) throw new BadRequestException('Use a PDF, DOC or DOCX file.')
    const name = safeResumeName(file.originalname, checked.ext)
    const key = resumeKey(providerId, userId, name)
    const where = { providerId_userId: { providerId, userId } }
    const existing = await this.prisma.talentProfile.findUnique({
      where,
      select: { resumeKey: true },
    })
    await this.storage.upload(key, file.buffer, checked.contentType)
    const resume = {
      resumeKey: key,
      resumeName: name,
      resumeSize: file.buffer.length,
      resumeUploadedAt: new Date(),
    }
    let saved
    try {
      saved = await this.prisma.talentProfile.upsert({
        where,
        create: { providerId, userId, ...resume },
        update: resume,
      })
    } catch (err) {
      await this.storage.delete(key).catch(() => undefined)
      throw err
    }
    if (existing?.resumeKey && existing.resumeKey !== key) await this.dropObject(existing.resumeKey)
    return toProfileDto(saved)
  }

  async myResumeLink(userId: string, providerId: string): Promise<ResumeLink> {
    this.assertResumeStorage()
    await this.access.assertLearnerOfProvider(userId, providerId)
    const p = await this.prisma.talentProfile.findUnique({
      where: { providerId_userId: { providerId, userId } },
      select: { resumeKey: true, resumeName: true },
    })
    return this.link(p)
  }

  async deleteResume(userId: string, providerId: string): Promise<TalentProfileDto> {
    await this.access.assertLearnerOfProvider(userId, providerId)
    const where = { providerId_userId: { providerId, userId } }
    const existing = await this.prisma.talentProfile.findUnique({ where })
    if (!existing) throw new NotFoundException('You have no profile yet')
    if (!existing.resumeKey) return toProfileDto(existing)
    const saved = await this.prisma.talentProfile.update({
      where,
      data: { resumeKey: null, resumeName: null, resumeSize: null, resumeUploadedAt: null },
    })
    await this.dropObject(existing.resumeKey)
    return toProfileDto(saved)
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

  /** Never carries pay: only whether any exists. Pay comes from `staffCompensation`. */
  async staffProfile(
    actor: Actor,
    providerId: string,
    userId: string
  ): Promise<TalentProfileStaffView | null> {
    await this.staffOf(actor, providerId, userId)
    const p = await this.prisma.talentProfile.findUnique({
      where: { providerId_userId: { providerId, userId } },
    })
    await this.audit.record({
      actorId: actor.userId,
      providerId,
      subjectUserId: userId,
      resource: 'talent_profile',
      action: 'read',
    })
    if (!p) return null
    const { previousCompensation, targetCompensation, ...rest } = toProfileDto(p)
    return {
      ...rest,
      userId,
      hasCompensation: previousCompensation !== null || targetCompensation !== null,
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
    await this.audit.record({
      actorId: actor.userId,
      providerId,
      subjectUserId: userId,
      resource: 'compensation',
      action: 'read',
    })
    const p = await this.prisma.talentProfile.findUnique({
      where: { providerId_userId: { providerId, userId } },
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
    const p = await this.prisma.talentProfile.findUnique({
      where: { providerId_userId: { providerId, userId } },
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

  async exportCsv(
    actor: Actor,
    providerId: string,
    filters: ParticipantFilters,
    includeCompensation: boolean
  ): Promise<string> {
    await this.staffOf(actor, providerId)
    const found = await this.participants(providerId, {
      filters,
      compensation: includeCompensation,
      noCap: true,
    })
    if (found.length > ROW_LIMIT)
      throw new PayloadTooLargeException(
        `This export has more than ${ROW_LIMIT} people. Narrow the filters (for example pick a cohort) and try again.`
      )
    const header = [
      'name',
      'email',
      'cohorts',
      'education_level',
      'field_of_study',
      'school',
      'graduation_year',
      'years_experience',
      'industries',
      'target_roles',
      'available_from',
      'has_resume',
      'share',
      'completed',
      ...(includeCompensation ? ['previous_compensation', 'target_compensation'] : []),
    ]
    const lines = [csvRow(header)]
    for (const { row, profile } of found) {
      lines.push(
        csvRow([
          row.name,
          row.email,
          row.cohorts.map((c) => c.cohortName).join('; '),
          profile?.educationLevel,
          profile?.fieldOfStudy,
          profile?.school,
          profile?.graduationYear,
          profile?.yearsExperience,
          profile?.industries.join('; '),
          profile?.targetRoles.join('; '),
          day(profile?.availableFrom ?? null),
          row.profile?.hasResume ? 'yes' : 'no',
          row.profile?.shareWithEmployers ? 'yes' : 'no',
          row.profile?.completed ? 'yes' : 'no',
          ...(includeCompensation
            ? [profile?.previousCompensation, profile?.targetCompensation]
            : []),
        ])
      )
    }
    const detail = `csv, ${found.length} rows`
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
    return '\uFEFF' + lines.join('\r\n') + '\r\n'
  }

  /**
   * The provider's participants with their profile. The compensation columns are not even read
   * from the database unless the caller is the opted-in export, so a list row cannot carry them.
   */
  private async participants(
    providerId: string,
    opts: {
      filters?: ParticipantFilters
      userIds?: string[]
      compensation?: boolean
      /** The export must see every match so it can refuse an oversized one rather than truncate. */
      noCap?: boolean
    }
  ): Promise<{ row: TalentParticipantRow; profile: ProfileRow | null }[]> {
    const f = opts.filters ?? {}
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
        cohort: { select: { id: true, name: true, course: { select: { title: true } } } },
      },
    })
    const people = new Map<
      string,
      { name: string; email: string | null; cohorts: TalentParticipantCohort[] }
    >()
    for (const e of enrollments) {
      let p = people.get(e.userId)
      if (!p) {
        p = {
          name: e.user.displayName ?? e.user.email ?? 'Unnamed',
          email: e.user.email,
          cohorts: [],
        }
        people.set(e.userId, p)
      }
      p.cohorts.push({
        cohortId: e.cohort.id,
        cohortName: e.cohort.name,
        courseTitle: e.cohort.course?.title ?? '',
        enrollmentStatus: e.status as TalentParticipantCohort['enrollmentStatus'],
      })
    }
    // A cohort filter keeps people in that cohort; their other cohorts still show.
    let ids = [...people.keys()]
    if (f.cohortId)
      ids = ids.filter((id) => people.get(id)!.cohorts.some((c) => c.cohortId === f.cohortId))
    if (ids.length === 0) return []
    const [profiles, supportGroups, noteGroups] = await Promise.all([
      this.prisma.talentProfile.findMany({
        where: { providerId, userId: { in: ids } },
        select: PROFILE_SELECT(opts.compensation === true),
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
    const profileOf = new Map(profiles.map((p) => [p.userId, p as unknown as ProfileRow]))
    const open = new Map(supportGroups.map((g) => [g.userId, g._count._all]))
    const notes = new Map(noteGroups.map((g) => [g.userId, g._count._all]))
    const out: { row: TalentParticipantRow; profile: ProfileRow | null }[] = []
    for (const id of ids) {
      const person = people.get(id)!
      const p = profileOf.get(id) ?? null
      if (f.industry && !(p && includes(p.industries, f.industry))) continue
      if (f.role && !(p && includes(p.targetRoles, f.role))) continue
      if (f.educationLevel && p?.educationLevel !== f.educationLevel) continue
      if (f.share && !p?.shareWithEmployers) continue
      if (f.completed && !p?.completedAt) continue
      if (f.hasResume && !p?.resumeKey) continue
      if (f.minYears !== undefined && !((p?.yearsExperience ?? -1) >= f.minYears)) continue
      out.push({
        profile: p,
        row: {
          userId: id,
          name: person.name,
          email: person.email,
          cohorts: person.cohorts,
          profile: p
            ? {
                completed: !!p.completedAt,
                hasResume: !!p.resumeKey,
                educationLevel: p.educationLevel,
                yearsExperience: p.yearsExperience,
                industries: p.industries,
                targetRoles: p.targetRoles,
                availableFrom: day(p.availableFrom),
                shareWithEmployers: p.shareWithEmployers,
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
