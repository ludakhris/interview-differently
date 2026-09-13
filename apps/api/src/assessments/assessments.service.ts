import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { ClerkService } from '../auth/clerk.service'
import { SqlRunnerService, type QueryOutcome } from '../sql-runner/sql-runner.service'
import { AssessmentParseError, parseAssessmentMarkdown, questionIndex } from './parse-markdown'
import { compareResults } from './grade'
import type { AssessmentQuestion, AssessmentSection, ParsedAssessment, SectionScore } from './assessment.types'
import type { ContentWhere } from '../datasets/datasets.service'

export interface DeliveryInput {
  cohortId: string
  label: string
  opensAt?: string | null
  closesAt?: string | null
  timeLimitMinutes?: number | null
}

// Students get this long past the deadline before a submit is marked late —
// covers a client-side timer firing a few seconds after the server clock.
const LATE_GRACE_MS = 2 * 60 * 1000

@Injectable()
export class AssessmentsService {
  constructor(
    private prisma: PrismaService,
    private clerk: ClerkService,
    private runner: SqlRunnerService,
  ) {}

  // ── Admin: import ────────────────────────────────────────────────────────

  /**
   * Parses the markdown and runs every reference query against the dataset.
   * Returns the parsed bank plus per-question SQL errors. Nothing is saved.
   */
  async preview(markdown: string, datasetWhere: ContentWhere) {
    const parsed = this.parse(markdown)
    const dataset = await this.prisma.dataset.findFirst({ where: { slug: parsed.dataset, ...(datasetWhere ?? {}) } })
    if (!dataset) throw new BadRequestException(`Dataset "${parsed.dataset}" not found — create it under Admin → Datasets first`)
    const sqlErrors = await this.checkReferenceQueries(dataset.setupSql, parsed.sections)
    return { parsed, datasetId: dataset.id, datasetName: dataset.name, sqlErrors }
  }

  /**
   * Creates or replaces (by slug) an assessment from markdown. Refuses if
   * any reference query fails. Re-import keeps the original owner; the
   * caller has already checked the new owner and passes `canOverwrite` to
   * decide whether an existing slug may be replaced.
   */
  async import(
    markdown: string,
    datasetWhere: ContentWhere,
    institutionId: string | null,
    canOverwrite: (owner: string | null) => boolean,
  ) {
    const { parsed, datasetId, sqlErrors } = await this.preview(markdown, datasetWhere)
    if (sqlErrors.length > 0) {
      throw new BadRequestException(
        `Reference queries failed: ${sqlErrors.map((e) => `${e.questionId} (${e.error})`).join('; ')}`,
      )
    }
    const existing = await this.prisma.assessment.findUnique({ where: { slug: parsed.slug }, select: { institutionId: true } })
    if (existing && !canOverwrite(existing.institutionId)) {
      throw new ForbiddenException(`Slug "${parsed.slug}" belongs to another institution — change the slug`)
    }
    const data = {
      title: parsed.title,
      datasetId,
      sourceMarkdown: markdown,
      sections: parsed.sections as unknown as object[],
      defaultDraw: parsed.defaultDraw,
    }
    const row = await this.prisma.assessment.upsert({
      where: { slug: parsed.slug },
      update: data,
      create: { slug: parsed.slug, institutionId, ...data },
    })
    return { id: row.id, slug: row.slug, warnings: parsed.warnings }
  }

  private parse(markdown: string): ParsedAssessment {
    if (!markdown?.trim()) throw new BadRequestException('markdown is required')
    try {
      return parseAssessmentMarkdown(markdown)
    } catch (err) {
      if (err instanceof AssessmentParseError) throw new BadRequestException(err.message)
      throw err
    }
  }

  private async checkReferenceQueries(setupSql: string, sections: AssessmentSection[]) {
    const sqlQs = sections.flatMap((s) => s.questions.filter((q) => q.type === 'sql'))
    if (sqlQs.length === 0) return []
    const outcomes = await this.runner.executeMany(
      setupSql,
      sqlQs.map((q) => (q as { referenceSql: string }).referenceSql),
    )
    return outcomes.flatMap((o, i) => (o.ok ? [] : [{ questionId: sqlQs[i].id, error: o.error }]))
  }

  // ── Admin: read / delete ─────────────────────────────────────────────────

  async list(where: ContentWhere) {
    const rows = await this.prisma.assessment.findMany({
      where,
      orderBy: { title: 'asc' },
      include: {
        dataset: { select: { slug: true, name: true } },
        institution: { select: { name: true } },
        _count: { select: { deliveries: true } },
      },
    })
    return rows.map((a) => {
      const sections = a.sections as unknown as AssessmentSection[]
      return {
        id: a.id,
        slug: a.slug,
        title: a.title,
        dataset: a.dataset,
        institutionId: a.institutionId,
        institutionName: a.institution?.name ?? null,
        sectionCount: sections.length,
        questionCount: sections.reduce((n, s) => n + s.questions.length, 0),
        deliveryCount: a._count.deliveries,
        updatedAt: a.updatedAt,
      }
    })
  }

  async get(id: string) {
    const a = await this.prisma.assessment.findUnique({
      where: { id },
      include: {
        dataset: { select: { slug: true, name: true } },
        institution: { select: { name: true } },
        deliveries: {
          orderBy: { createdAt: 'desc' },
          include: {
            cohort: { select: { id: true, name: true, institution: { select: { name: true } } } },
            attempts: { select: { submittedAt: true } },
          },
        },
      },
    })
    if (!a) throw new NotFoundException(`Assessment ${id} not found`)
    return {
      id: a.id,
      slug: a.slug,
      title: a.title,
      dataset: a.dataset,
      institutionId: a.institutionId,
      institutionName: a.institution?.name ?? null,
      defaultDraw: a.defaultDraw,
      sections: a.sections as unknown as AssessmentSection[],
      sourceMarkdown: a.sourceMarkdown,
      updatedAt: a.updatedAt,
      deliveries: a.deliveries.map((d) => ({
        id: d.id,
        label: d.label,
        cohort: d.cohort ? { id: d.cohort.id, name: d.cohort.name, institutionName: d.cohort.institution.name } : null,
        opensAt: d.opensAt,
        closesAt: d.closesAt,
        timeLimitMinutes: d.timeLimitMinutes,
        inviteCode: d.inviteCode,
        createdAt: d.createdAt,
        startedCount: d.attempts.length,
        submittedCount: d.attempts.filter((x) => x.submittedAt).length,
      })),
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.assessment.delete({ where: { id } })
    } catch (err) {
      if ((err as { code?: string }).code === 'P2025') throw new NotFoundException(`Assessment ${id} not found`)
      throw err
    }
  }

  // ── Admin: deliveries ────────────────────────────────────────────────────

  async createDelivery(assessmentId: string, input: DeliveryInput) {
    if (!input.cohortId) throw new BadRequestException('cohortId is required')
    const label = input.label?.trim()
    if (!label) throw new BadRequestException('label is required (e.g. "pre" or "post")')
    const opensAt = input.opensAt ? new Date(input.opensAt) : null
    const closesAt = input.closesAt ? new Date(input.closesAt) : null
    if (opensAt && closesAt && closesAt <= opensAt) throw new BadRequestException('closesAt must be after opensAt')
    const timeLimitMinutes = input.timeLimitMinutes ?? null
    if (timeLimitMinutes !== null && !(Number.isInteger(timeLimitMinutes) && timeLimitMinutes > 0)) {
      throw new BadRequestException('timeLimitMinutes must be a positive integer')
    }
    const [assessment, cohort] = await Promise.all([
      this.prisma.assessment.findUnique({ where: { id: assessmentId } }),
      this.prisma.cohort.findUnique({ where: { id: input.cohortId } }),
    ])
    if (!assessment) throw new NotFoundException(`Assessment ${assessmentId} not found`)
    if (!cohort) throw new NotFoundException(`Cohort ${input.cohortId} not found`)
    return this.prisma.assessmentDelivery.create({
      data: { assessmentId, cohortId: input.cohortId, label, opensAt, closesAt, timeLimitMinutes },
    })
  }

  async removeDelivery(id: string): Promise<void> {
    try {
      await this.prisma.assessmentDelivery.delete({ where: { id } })
    } catch (err) {
      if ((err as { code?: string }).code === 'P2025') throw new NotFoundException(`Delivery ${id} not found`)
      throw err
    }
  }

  // ── Invite links ─────────────────────────────────────────────────────────
  //
  // /a/<code> lets anyone with the link sign in, get added to the delivery's
  // cohort, and start the paper — no admin-add or join key needed. Same
  // trust model as a cohort joinKey; regenerate or revoke to cut it off.

  /** Creates (or rotates) the delivery's invite code and switches the assessments tool on for its cohort. */
  async createInvite(deliveryId: string) {
    const d = await this.prisma.assessmentDelivery.findUnique({ where: { id: deliveryId } })
    if (!d) throw new NotFoundException(`Delivery ${deliveryId} not found`)
    if (!d.cohortId) throw new BadRequestException('This delivery\'s cohort was deleted — no cohort to invite into')
    const cohortId = d.cohortId
    const inviteCode = randomBytes(12).toString('base64url')
    await this.prisma.$transaction([
      this.prisma.assessmentDelivery.update({ where: { id: deliveryId }, data: { inviteCode } }),
      this.prisma.cohortToolConfig.upsert({
        where: { cohortId_toolKey: { cohortId, toolKey: 'assessments' } },
        update: { enabled: true },
        create: { cohortId, toolKey: 'assessments', enabled: true },
      }),
    ])
    return { inviteCode }
  }

  async revokeInvite(deliveryId: string): Promise<void> {
    try {
      await this.prisma.assessmentDelivery.update({ where: { id: deliveryId }, data: { inviteCode: null } })
    } catch (err) {
      if ((err as { code?: string }).code === 'P2025') throw new NotFoundException(`Delivery ${deliveryId} not found`)
      throw err
    }
  }

  /** Public: what the invite landing page shows before sign-in. */
  async inviteInfo(code: string) {
    const d = await this.loadInvite(code)
    const sections = d.assessment.sections as unknown as AssessmentSection[]
    return {
      title: d.assessment.title,
      label: d.label,
      cohortName: d.cohort.name,
      institutionName: d.cohort.institution.name,
      opensAt: d.opensAt,
      closesAt: d.closesAt,
      timeLimitMinutes: d.timeLimitMinutes,
      questionCount: sections.reduce((n, s) => n + Math.min(s.draw ?? s.questions.length, s.questions.length), 0),
      isOpen: this.isOpen(d, Date.now()),
    }
  }

  /** Signed-in user follows an invite: join the cohort (idempotent), then start or resume the attempt. */
  async acceptInvite(userId: string, code: string) {
    const d = await this.loadInvite(code)
    await this.ensureMembership(userId, d.cohort.institutionId, d.cohortId)
    const existing = await this.prisma.assessmentAttempt.findUnique({
      where: { deliveryId_userId: { deliveryId: d.id, userId } },
      select: { id: true, submittedAt: true },
    })
    if (existing) return { attemptId: existing.id, submitted: !!existing.submittedAt }
    const { id } = await this.startAttempt(userId, d.id)
    return { attemptId: id, submitted: false }
  }

  private async loadInvite(code: string) {
    const d = await this.prisma.assessmentDelivery.findUnique({
      where: { inviteCode: code },
      include: {
        assessment: { select: { title: true, sections: true } },
        cohort: { select: { name: true, institutionId: true, institution: { select: { name: true } } } },
      },
    })
    // A delivery whose cohort was deleted has nothing to invite into.
    if (!d || !d.cohort || !d.cohortId) throw new NotFoundException('This invite link is no longer valid')
    return { ...d, cohort: d.cohort, cohortId: d.cohortId }
  }

  /** Mirrors MeService.join for the invite path: User row first (FK), then Membership if missing. */
  private async ensureMembership(userId: string, institutionId: string, cohortId: string) {
    const profile = await this.clerk.getUserProfile(userId)
    await this.prisma.user.upsert({
      where: { id: userId },
      update: { email: profile?.email ?? undefined, displayName: profile?.displayName ?? undefined },
      create: { id: userId, email: profile?.email ?? null, displayName: profile?.displayName ?? null },
    })
    const existing = await this.prisma.membership.findFirst({ where: { userId, cohortId } })
    if (!existing) await this.prisma.membership.create({ data: { userId, institutionId, cohortId } })
  }

  /** Every attempt on a delivery with per-section scores — the admin results table. */
  async deliveryResults(id: string) {
    const d = await this.prisma.assessmentDelivery.findUnique({
      where: { id },
      include: {
        assessment: { select: { id: true, title: true, sections: true } },
        cohort: { select: { name: true } },
        attempts: { orderBy: { startedAt: 'asc' } },
      },
    })
    if (!d) throw new NotFoundException(`Delivery ${id} not found`)
    const users = await this.prisma.user.findMany({
      where: { id: { in: d.attempts.map((a) => a.userId) } },
      select: { id: true, email: true, displayName: true },
    })
    const byId = new Map(users.map((u) => [u.id, u]))
    const sections = (d.assessment.sections as unknown as AssessmentSection[]).map((s) => ({ id: s.id, title: s.title }))
    return {
      delivery: { id: d.id, label: d.label, cohortName: d.cohort?.name ?? null, assessmentTitle: d.assessment.title },
      sections,
      attempts: d.attempts.map((a) => {
        const scores = (a.sectionScores as unknown as SectionScore[] | null) ?? null
        return {
          attemptId: a.id,
          userId: a.userId,
          email: byId.get(a.userId)?.email ?? null,
          displayName: byId.get(a.userId)?.displayName ?? null,
          startedAt: a.startedAt,
          submittedAt: a.submittedAt,
          submittedLate: a.submittedLate,
          sectionScores: scores,
          overall: scores ? overall(scores) : null,
        }
      }),
    }
  }

  // ── Institution analytics: pre ↔ post ────────────────────────────────────
  //
  // Deliveries on the same assessment + cohort whose labels start with "pre"
  // and "post" form a pair. Averages are per-student percentages averaged
  // across submitted attempts (not pooled question counts), and the delta is
  // *paired*: only students who submitted both sides contribute, so a
  // dropout between pre and post doesn't masquerade as improvement.

  async institutionPrePost(institutionId: string, cohortId?: string) {
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
      select: { id: true, name: true },
    })
    if (!institution) throw new NotFoundException(`Institution ${institutionId} not found`)
    const cohort = cohortId
      ? await this.prisma.cohort.findFirst({ where: { id: cohortId, institutionId }, select: { id: true, name: true } })
      : null
    if (cohortId && !cohort) throw new NotFoundException(`Cohort ${cohortId} not found in this institution`)

    const deliveries = await this.prisma.assessmentDelivery.findMany({
      where: { cohort: { institutionId, ...(cohortId ? { id: cohortId } : {}) } },
      orderBy: { createdAt: 'desc' },
      include: {
        assessment: { select: { id: true, title: true, sections: true } },
        cohort: { select: { id: true, name: true } },
        attempts: { where: { submittedAt: { not: null } }, select: { userId: true, sectionScores: true } },
      },
    })

    // Group by (assessment, cohort); newest matching delivery wins per side.
    type D = (typeof deliveries)[number]
    const groups = new Map<string, { assessment: D['assessment']; cohort: D['cohort']; pre?: D; post?: D }>()
    for (const d of deliveries) {
      const key = `${d.assessmentId}:${d.cohortId}`
      const g = groups.get(key) ?? { assessment: d.assessment, cohort: d.cohort }
      const label = d.label.trim().toLowerCase()
      if (label.startsWith('pre') && !g.pre) g.pre = d
      else if (label.startsWith('post') && !g.post) g.post = d
      groups.set(key, g)
    }

    const userIds = [...new Set(deliveries.flatMap((d) => d.attempts.map((a) => a.userId)))]
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, displayName: true },
    })
    const userById = new Map(users.map((u) => [u.id, u]))

    const pairs = [...groups.values()]
      .filter((g) => g.pre || g.post)
      .map((g) => {
        const sections = (g.assessment.sections as unknown as AssessmentSection[]).map((s) => ({ id: s.id, title: s.title }))
        const side = (d?: D) => new Map((d?.attempts ?? []).map((a) => [a.userId, pctBySection(a.sectionScores as unknown as SectionScore[] | null)]))
        const pre = side(g.pre)
        const post = side(g.post)
        const ids = [...new Set([...pre.keys(), ...post.keys()])].sort((a, b) => {
          const ua = userById.get(a), ub = userById.get(b)
          return (ua?.displayName ?? ua?.email ?? a).localeCompare(ub?.displayName ?? ub?.email ?? b)
        })
        const keys = ['overall', ...sections.map((s) => s.id)]
        const students = ids.map((userId, index) => {
          const u = userById.get(userId)
          const p = pre.get(userId) ?? null
          const q = post.get(userId) ?? null
          return {
            userId,
            anonymousLabel: `Student ${String(index + 1).padStart(2, '0')}`,
            displayName: u?.displayName ?? null,
            email: u?.email ?? null,
            pre: p,
            post: q,
            delta: p && q ? q.overall - p.overall : null,
          }
        })
        const both = students.filter((st) => st.pre && st.post)
        const avg = (rows: Record<string, number>[]) =>
          Object.fromEntries(keys.map((k) => [k, rows.length ? Math.round(rows.reduce((n, r) => n + r[k], 0) / rows.length) : null]))
        return {
          assessmentId: g.assessment.id,
          assessmentTitle: g.assessment.title,
          cohort: g.cohort,
          sections,
          pre: g.pre ? { deliveryId: g.pre.id, label: g.pre.label, submittedCount: pre.size } : null,
          post: g.post ? { deliveryId: g.post.id, label: g.post.label, submittedCount: post.size } : null,
          averages: {
            pre: avg([...pre.values()]),
            post: avg([...post.values()]),
            // paired: same students on both sides
            delta: avg(both.map((st) => Object.fromEntries(keys.map((k) => [k, st.post![k] - st.pre![k]])))),
            pairedCount: both.length,
          },
          students,
        }
      })

    return { institution, cohort, pairs }
  }

  // ── Student ──────────────────────────────────────────────────────────────

  /**
   * Deliveries the user can see: their cohorts with the assessments tool on,
   * plus anything they already attempted (so results outlive the cohort).
   * Admins see all.
   */
  async listForUser(userId: string) {
    const isAdmin = await this.clerk.isAdmin(userId)
    const rows = await this.prisma.assessmentDelivery.findMany({
      where: isAdmin ? {} : { OR: [{ cohort: this.assessmentsCohortFor(userId) }, { attempts: { some: { userId } } }] },
      orderBy: [{ opensAt: 'asc' }, { createdAt: 'asc' }],
      include: {
        assessment: { select: { title: true, sections: true } },
        cohort: { select: { name: true } },
        attempts: { where: { userId }, select: { id: true, startedAt: true, submittedAt: true } },
      },
    })
    const now = Date.now()
    return rows.map((d) => {
      const attempt = d.attempts[0] ?? null
      const sections = d.assessment.sections as unknown as AssessmentSection[]
      return {
        id: d.id,
        title: d.assessment.title,
        label: d.label,
        cohortName: d.cohort?.name ?? null,
        opensAt: d.opensAt,
        closesAt: d.closesAt,
        timeLimitMinutes: d.timeLimitMinutes,
        questionCount: sections.reduce((n, s) => n + Math.min(s.draw ?? s.questions.length, s.questions.length), 0),
        isOpen: this.isOpen(d, now),
        attempt: attempt && {
          id: attempt.id,
          startedAt: attempt.startedAt,
          submittedAt: attempt.submittedAt,
          deadlineAt: this.deadline(d, attempt.startedAt),
        },
      }
    })
  }

  /** Starts (or resumes) the caller's attempt: draws the paper once and pins the dataset hash. */
  async startAttempt(userId: string, deliveryId: string) {
    const d = await this.prisma.assessmentDelivery.findUnique({
      where: { id: deliveryId },
      include: { assessment: { include: { dataset: { select: { setupHash: true } } } } },
    })
    if (!d) throw new NotFoundException(`Delivery ${deliveryId} not found`)
    // Own attempt first: a student keeps access to their paper even after the cohort is gone.
    const existing = await this.prisma.assessmentAttempt.findUnique({ where: { deliveryId_userId: { deliveryId, userId } } })
    if (existing) return { id: existing.id }
    await this.assertCanSee(userId, d.cohortId)
    if (!this.isOpen(d, Date.now())) throw new ForbiddenException('This assessment is not open right now')

    const sections = d.assessment.sections as unknown as AssessmentSection[]
    const drawnQuestionIds = sections.flatMap((s) => draw(s.questions, s.draw).map((q) => q.id))
    const row = await this.prisma.assessmentAttempt.create({
      data: { deliveryId, userId, datasetHash: d.assessment.dataset.setupHash, drawnQuestionIds, answers: {} },
    })
    return { id: row.id }
  }

  /** The student's paper: drawn questions with answers / reference SQL stripped, plus saved answers. */
  async getAttempt(userId: string, attemptId: string) {
    const a = await this.loadOwnAttempt(userId, attemptId)
    const sections = a.delivery.assessment.sections as unknown as AssessmentSection[]
    const drawn = new Set(a.drawnQuestionIds as string[])
    const order = new Map((a.drawnQuestionIds as string[]).map((id, i) => [id, i]))
    return {
      id: a.id,
      title: a.delivery.assessment.title,
      label: a.delivery.label,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      deadlineAt: this.deadline(a.delivery, a.startedAt),
      dataset: {
        slug: a.delivery.assessment.dataset.slug,
        name: a.delivery.assessment.dataset.name,
        setupSql: a.delivery.assessment.dataset.setupSql,
        schemaSummary: a.delivery.assessment.dataset.schemaSummary,
      },
      sections: sections
        .map((s) => ({
          id: s.id,
          title: s.title,
          questions: s.questions
            .filter((q) => drawn.has(q.id))
            .sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0))
            .map(stripAnswer),
        }))
        .filter((s) => s.questions.length > 0),
      answers: (a.answers as Record<string, string>) ?? {},
    }
  }

  async saveAnswers(userId: string, attemptId: string, answers: Record<string, string>) {
    const a = await this.loadOwnAttempt(userId, attemptId)
    if (a.submittedAt) throw new BadRequestException('Attempt already submitted')
    const drawn = new Set(a.drawnQuestionIds as string[])
    const merged = { ...((a.answers as Record<string, string>) ?? {}) }
    for (const [qid, value] of Object.entries(answers ?? {})) {
      if (!drawn.has(qid)) continue
      if (typeof value !== 'string') continue
      merged[qid] = value
    }
    await this.prisma.assessmentAttempt.update({ where: { id: attemptId }, data: { answers: merged } })
    return { saved: Object.keys(merged).length }
  }

  /** Grades server-side and locks the attempt. Idempotent: a second submit returns the stored result. */
  async submit(userId: string, attemptId: string, answers?: Record<string, string>) {
    if (answers) await this.saveAnswers(userId, attemptId, answers)
    const a = await this.loadOwnAttempt(userId, attemptId)
    if (a.submittedAt) return this.studentResult(a.sectionScores as unknown as SectionScore[])

    const sections = a.delivery.assessment.sections as unknown as AssessmentSection[]
    const index = questionIndex(sections)
    const drawnIds = a.drawnQuestionIds as string[]
    const saved = (a.answers as Record<string, string>) ?? {}

    // Run every SQL pair (student, reference) on one fresh instance.
    const sqlIds = drawnIds.filter((id) => index.get(id)?.type === 'sql')
    const queries = sqlIds.flatMap((id) => [saved[id] ?? '', (index.get(id) as { referenceSql: string }).referenceSql])
    const outcomes = queries.length ? await this.runner.executeMany(a.delivery.assessment.dataset.setupSql, queries) : []
    const sqlOutcome = new Map<string, { student: QueryOutcome; reference: QueryOutcome }>()
    sqlIds.forEach((id, i) => sqlOutcome.set(id, { student: outcomes[i * 2], reference: outcomes[i * 2 + 1] }))

    const sectionScores: SectionScore[] = sections
      .map((s) => {
        const qs = drawnIds.filter((id) => index.get(id)?.sectionId === s.id)
        const graded = qs.map((id) => {
          const q = index.get(id)!
          if (q.type === 'mc') {
            return { id, type: 'mc' as const, correct: (saved[id] ?? '').trim().toUpperCase() === q.answer }
          }
          const o = sqlOutcome.get(id)!
          if (!saved[id]?.trim()) return { id, type: 'sql' as const, correct: false, error: 'no answer' }
          if (!o.student.ok) return { id, type: 'sql' as const, correct: false, error: o.student.error }
          if (!o.reference.ok) return { id, type: 'sql' as const, correct: false, error: `reference failed: ${o.reference.error}` }
          const cmp = compareResults(o.student.result, o.reference.result, { ordered: q.ordered, strictColumns: q.strictColumns })
          return { id, type: 'sql' as const, correct: cmp.match, ...(cmp.reason ? { error: cmp.reason } : {}) }
        })
        return { sectionId: s.id, title: s.title, correct: graded.filter((g) => g.correct).length, total: graded.length, questions: graded }
      })
      .filter((s) => s.total > 0)

    const deadline = this.deadline(a.delivery, a.startedAt)
    const submittedLate = deadline ? Date.now() > deadline.getTime() + LATE_GRACE_MS : false
    await this.prisma.assessmentAttempt.update({
      where: { id: attemptId },
      data: { sectionScores: sectionScores as unknown as object[], submittedAt: new Date(), submittedLate },
    })
    return this.studentResult(sectionScores)
  }

  async getResult(userId: string, attemptId: string) {
    const a = await this.loadOwnAttempt(userId, attemptId)
    if (!a.submittedAt) throw new BadRequestException('Attempt not submitted yet')
    return {
      title: a.delivery.assessment.title,
      label: a.delivery.label,
      submittedAt: a.submittedAt,
      ...this.studentResult(a.sectionScores as unknown as SectionScore[]),
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /** Section totals only — per-question outcomes stay admin-side so the bank isn't revealed. */
  private studentResult(scores: SectionScore[]) {
    return {
      overall: overall(scores),
      sections: scores.map(({ sectionId, title, correct, total }) => ({ sectionId, title, correct, total })),
    }
  }

  private async loadOwnAttempt(userId: string, attemptId: string) {
    const a = await this.prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: { delivery: { include: { assessment: { include: { dataset: true } } } } },
    })
    if (!a || a.userId !== userId) throw new NotFoundException(`Attempt ${attemptId} not found`)
    return a
  }

  private async assertCanSee(userId: string, cohortId: string | null) {
    if (await this.clerk.isAdmin(userId)) return
    if (!cohortId) throw new NotFoundException('Delivery not found')
    const n = await this.prisma.cohort.count({ where: { id: cohortId, ...this.assessmentsCohortFor(userId) } })
    if (n === 0) throw new NotFoundException('Delivery not found')
  }

  /** Prisma filter: a cohort the user belongs to with 'assessments' switched on. */
  private assessmentsCohortFor(userId: string) {
    return {
      memberships: { some: { userId } },
      tools: { some: { toolKey: 'assessments', enabled: true } },
    }
  }

  private isOpen(d: { opensAt: Date | null; closesAt: Date | null }, now: number): boolean {
    if (d.opensAt && now < d.opensAt.getTime()) return false
    if (d.closesAt && now > d.closesAt.getTime()) return false
    return true
  }

  /** Earlier of (start + time limit) and the delivery's close, or null when neither applies. */
  private deadline(d: { closesAt: Date | null; timeLimitMinutes: number | null }, startedAt: Date): Date | null {
    const candidates: number[] = []
    if (d.timeLimitMinutes) candidates.push(startedAt.getTime() + d.timeLimitMinutes * 60 * 1000)
    if (d.closesAt) candidates.push(d.closesAt.getTime())
    return candidates.length ? new Date(Math.min(...candidates)) : null
  }
}

function overall(scores: SectionScore[]) {
  const correct = scores.reduce((n, s) => n + s.correct, 0)
  const total = scores.reduce((n, s) => n + s.total, 0)
  return { correct, total, percent: total ? Math.round((correct / total) * 100) : 0 }
}

/** Random subset of `n` questions (all when n is null or ≥ length), in random order. */
function draw<T>(items: T[], n: number | null): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return n === null ? arr : arr.slice(0, n)
}

function stripAnswer(q: AssessmentQuestion) {
  if (q.type === 'mc') return { id: q.id, type: 'mc' as const, prompt: q.prompt, options: q.options }
  return { id: q.id, type: 'sql' as const, prompt: q.prompt, ordered: q.ordered, strictColumns: q.strictColumns, ...(q.starterSql ? { starterSql: q.starterSql } : {}) }
}

/** overall + per-section percentages for one submitted attempt. */
function pctBySection(scores: SectionScore[] | null): Record<string, number> {
  const out: Record<string, number> = {}
  const o = overall(scores ?? [])
  out.overall = o.percent
  for (const s of scores ?? []) out[s.sectionId] = s.total ? Math.round((s.correct / s.total) * 100) : 0
  return out
}
