import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  LIBRARY_FILTERS,
  PRACTICE_PORT,
  type LibraryFilter,
  type PracticeContentView,
  type PracticePort,
} from '../core/practice-port'
import { SPARK_PORT, type LessonContentView, type SparkPort } from '../core/spark-port'
import { AccessService } from './access/access.service'
import type { ContentLibrary, LibraryContent } from './learn-types'

const KINDS = ['practice', 'lesson'] as const
type Kind = (typeof KINDS)[number]

/**
 * System admin tool (GitHub issue #90): approve AI-written content for the library, so it is reused for other learners,
 * or reject it everywhere. The content is the Simulator's (practice) and Spark's (lessons); this reaches it through
 * their ports only. Course staff can also approve content their learners were given (the adaptive board); this lists
 * every cohort's, including content shown to learners that no person has approved yet.
 */
@Injectable()
export class AdminContentService {
  private readonly logger = new Logger(AdminContentService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    @Inject(PRACTICE_PORT) private readonly practice: PracticePort,
    @Inject(SPARK_PORT) private readonly spark: SparkPort
  ) {}

  /**
   * The library, filtered: the newest rows of each kind (LIBRARY_LIMIT) and how many match. A system admin reads as
   * every agency, so the use counts cover every cohort.
   */
  async library(
    actorRole: string | undefined,
    filter: string | undefined
  ): Promise<ContentLibrary> {
    this.access.requireSystemAdmin({ userId: '', role: actorRole })
    const f = (filter ?? 'needs-review') as LibraryFilter
    if (!LIBRARY_FILTERS.includes(f))
      throw new BadRequestException(`filter must be one of ${LIBRARY_FILTERS.join(', ')}`)
    const [practice, lessons] = await Promise.all([
      this.practice.library(f),
      this.spark.lessonLibrary(f),
    ])
    const names = await this.reviewerNames([...practice.rows, ...lessons.rows])
    return {
      practice: practice.rows.map((p) => practiceItem(p, names)),
      lessons: lessons.rows.map((l) => lessonItem(l, names)),
      total: { practice: practice.total, lessons: lessons.total },
    }
  }

  /** Approves a row for reuse, or rejects it everywhere. */
  async curate(
    actorId: string,
    actorRole: string | undefined,
    kind: string,
    id: string,
    approve: unknown
  ): Promise<LibraryContent> {
    this.access.requireSystemAdmin({ userId: actorId, role: actorRole })
    if (!KINDS.includes(kind as Kind))
      throw new BadRequestException('kind must be practice or lesson')
    if (typeof approve !== 'boolean') throw new BadRequestException('approve must be true or false')
    const view =
      kind === 'practice'
        ? await this.practice.curate(id, approve, actorId)
        : await this.spark.curateLesson(id, approve, actorId)
    this.logger.log(`${actorId} ${approve ? 'approved' : 'rejected'} ${kind} ${id} for the library`)
    const names = await this.reviewerNames([view])
    return kind === 'practice'
      ? practiceItem(view as PracticeContentView, names)
      : lessonItem(view as LessonContentView, names)
  }

  /** A link for the admin to watch a lesson, in any status, before deciding (SparkPort.previewLink). */
  async previewLesson(
    actorId: string,
    actorRole: string | undefined,
    id: string
  ): Promise<{ url: string }> {
    this.access.requireSystemAdmin({ userId: actorId, role: actorRole })
    return { url: await this.spark.previewLink(id, actorId) }
  }

  private async reviewerNames(
    views: { reviewedBy: string | null }[]
  ): Promise<Map<string, string>> {
    const ids = [...new Set(views.flatMap((v) => (v.reviewedBy ? [v.reviewedBy] : [])))]
    if (ids.length === 0) return new Map()
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true, email: true },
    })
    return new Map(
      users.flatMap((u) =>
        u.displayName || u.email ? [[u.id, (u.displayName || u.email) as string]] : []
      )
    )
  }
}

type View = PracticeContentView | LessonContentView

function common(v: View, names: Map<string, string>) {
  return {
    id: v.id,
    skillLabel: v.skill,
    status: v.status,
    reusable: v.status === 'approved' && v.reviewedBy !== null,
    model: v.model,
    promptVersion: v.promptVersion,
    tokens: v.tokens,
    createdAt: v.createdAt,
    reviewedAt: v.reviewedAt,
    reviewedBy: v.reviewedBy ? (names.get(v.reviewedBy) ?? v.reviewedBy) : null,
    uses: v.usedBy.length,
    learners: new Set(v.usedBy.map((u) => u.userId)).size,
  }
}

function practiceItem(p: PracticeContentView, names: Map<string, string>): LibraryContent {
  return {
    ...common(p, names),
    kind: 'practice',
    title: p.intro,
    bankSlug: p.bankSlug,
    level: null,
    parts: p.tasks.map((text) => ({ heading: null, text })),
  }
}

function lessonItem(l: LessonContentView, names: Map<string, string>): LibraryContent {
  return {
    ...common(l, names),
    kind: 'lesson',
    title: l.title,
    bankSlug: null,
    level: l.level,
    parts: l.scenes.map((s) => ({ heading: s.heading, text: s.narration })),
  }
}
