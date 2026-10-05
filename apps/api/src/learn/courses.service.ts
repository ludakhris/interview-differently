import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import type {
  CatalogEntry,
  CourseDetail,
  CourseItemDto,
  CourseOutline,
  CourseSummary,
} from '@id/types'
import { PrismaService } from '../prisma/prisma.service'
import { slugify, validateCourseFields, validateItemInput } from './course-config'
import { LEARN_ROLES, LearnService } from './learn.service'

const MANAGERS = [LEARN_ROLES.agencyAdmin, LEARN_ROLES.providerAdmin]

type CourseRow = {
  id: string
  slug: string
  title: string
  summary: string | null
  sector: string | null
  credential: string | null
  lengthWeeks: number | null
  targetScore: number
  readinessThreshold: number
  status: string
}

const settings = (c: CourseRow) => ({
  title: c.title,
  summary: c.summary,
  sector: c.sector,
  credential: c.credential,
  lengthWeeks: c.lengthWeeks,
  targetScore: c.targetScore,
  readinessThreshold: c.readinessThreshold,
  status: c.status as 'draft' | 'published',
})

/** Course setup for a provider workspace: courses, modules and items. */
@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly learn: LearnService
  ) {}

  // ── access ────────────────────────────────────────────────────────────────

  /** The caller may manage courses and can open the provider that owns this one. */
  private async courseFor(userId: string, role: string | undefined, courseId: string) {
    this.learn.assertRole(role, MANAGERS)
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { provider: { select: { id: true, name: true, subdomain: true } } },
    })
    if (!course) throw new NotFoundException('Course not found')
    await this.learn.assertWorkspace(userId, role, course.provider.subdomain as string)
    return course
  }

  private async moduleFor(userId: string, role: string | undefined, moduleId: string) {
    const mod = await this.prisma.courseModule.findUnique({ where: { id: moduleId } })
    if (!mod) throw new NotFoundException('Module not found')
    await this.courseFor(userId, role, mod.courseId)
    return mod
  }

  /** Checks the caller may add to this module's course, before any upload is processed. */
  async assertModuleAccess(
    userId: string,
    role: string | undefined,
    moduleId: string
  ): Promise<void> {
    await this.moduleFor(userId, role, moduleId)
  }

  async addScormItem(
    userId: string,
    role: string | undefined,
    moduleId: string,
    title: string,
    config: { packageId: string; entry: string; version: '1.2' | '2004'; files: number }
  ) {
    const mod = await this.moduleFor(userId, role, moduleId)
    const last = await this.prisma.courseItem.aggregate({
      where: { moduleId },
      _max: { position: true },
    })
    await this.prisma.courseItem.create({
      data: {
        moduleId,
        type: 'scorm',
        title: title.slice(0, 120),
        config: config as object,
        position: (last._max.position ?? 0) + 1,
      },
    })
    return this.detail(userId, role, mod.courseId)
  }

  private async itemFor(userId: string, role: string | undefined, itemId: string) {
    const item = await this.prisma.courseItem.findUnique({
      where: { id: itemId },
      include: { module: { select: { courseId: true } } },
    })
    if (!item) throw new NotFoundException('Item not found')
    await this.courseFor(userId, role, item.module.courseId)
    return item
  }

  private async providerBySubdomain(subdomain: string) {
    const provider = await this.prisma.institution.findFirst({
      where: { subdomain, kind: 'provider' },
      select: { id: true, name: true, subdomain: true },
    })
    if (!provider) throw new NotFoundException(`"${subdomain}" is not a provider workspace`)
    return provider
  }

  // ── courses ───────────────────────────────────────────────────────────────

  async list(
    userId: string,
    role: string | undefined,
    workspace: string
  ): Promise<CourseSummary[]> {
    this.learn.assertRole(role, MANAGERS)
    await this.learn.assertWorkspace(userId, role, workspace)
    const provider = await this.providerBySubdomain(workspace)
    const rows = await this.prisma.course.findMany({
      where: { providerId: provider.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { modules: true, cohorts: true } },
        modules: { select: { _count: { select: { items: true } } } },
      },
    })
    return rows.map((c) => ({
      ...settings(c),
      id: c.id,
      slug: c.slug,
      modules: c._count.modules,
      items: c.modules.reduce((n, m) => n + m._count.items, 0),
      cohorts: c._count.cohorts,
      updatedAt: c.updatedAt.toISOString(),
    }))
  }

  async create(userId: string, role: string | undefined, workspace: string, body: unknown) {
    this.learn.assertRole(role, MANAGERS)
    await this.learn.assertWorkspace(userId, role, workspace)
    const provider = await this.providerBySubdomain(workspace)
    const fields = validateCourseFields(body, false)
    const base = slugify(fields.title as string)
    let slug = base
    for (let n = 2; await this.prisma.course.findUnique({ where: { slug } }); n++) {
      slug = `${base}-${n}`
    }
    const course = await this.prisma.course.create({
      data: {
        providerId: provider.id,
        slug,
        status: 'draft',
        ...fields,
        title: fields.title as string,
      },
    })
    return this.detail(userId, role, course.id)
  }

  async detail(userId: string, role: string | undefined, courseId: string): Promise<CourseDetail> {
    const course = await this.courseFor(userId, role, courseId)
    const [modules, cohorts] = await Promise.all([
      this.prisma.courseModule.findMany({
        where: { courseId },
        orderBy: { position: 'asc' },
        include: { items: { orderBy: { position: 'asc' } } },
      }),
      this.prisma.cohort.count({ where: { courseId } }),
    ])
    return {
      ...settings(course),
      id: course.id,
      slug: course.slug,
      provider: {
        id: course.provider.id,
        name: course.provider.name,
        subdomain: course.provider.subdomain as string,
      },
      cohorts,
      modules: modules.map((m) => ({
        id: m.id,
        title: m.title,
        position: m.position,
        items: m.items.map(toItemDto),
      })),
    }
  }

  async update(userId: string, role: string | undefined, courseId: string, body: unknown) {
    await this.courseFor(userId, role, courseId)
    await this.prisma.course.update({
      where: { id: courseId },
      data: validateCourseFields(body, true),
    })
    return this.detail(userId, role, courseId)
  }

  async remove(userId: string, role: string | undefined, courseId: string): Promise<void> {
    await this.courseFor(userId, role, courseId)
    const cohorts = await this.prisma.cohort.count({ where: { courseId } })
    if (cohorts > 0) {
      throw new ConflictException('This course has cohorts. Remove or move them first.')
    }
    await this.prisma.course.delete({ where: { id: courseId } })
  }

  // ── modules ───────────────────────────────────────────────────────────────

  async addModule(userId: string, role: string | undefined, courseId: string, body: unknown) {
    await this.courseFor(userId, role, courseId)
    const { title } = validateCourseFields(body, false)
    const last = await this.prisma.courseModule.aggregate({
      where: { courseId },
      _max: { position: true },
    })
    await this.prisma.courseModule.create({
      data: { courseId, title: title as string, position: (last._max.position ?? 0) + 1 },
    })
    return this.detail(userId, role, courseId)
  }

  async renameModule(userId: string, role: string | undefined, moduleId: string, body: unknown) {
    const mod = await this.moduleFor(userId, role, moduleId)
    const { title } = validateCourseFields(body, false)
    await this.prisma.courseModule.update({
      where: { id: moduleId },
      data: { title: title as string },
    })
    return this.detail(userId, role, mod.courseId)
  }

  async removeModule(userId: string, role: string | undefined, moduleId: string) {
    const mod = await this.moduleFor(userId, role, moduleId)
    await this.assertNoProgress({ item: { moduleId } })
    await this.prisma.courseModule.delete({ where: { id: moduleId } })
    return this.detail(userId, role, mod.courseId)
  }

  // ── items ─────────────────────────────────────────────────────────────────

  async addItem(userId: string, role: string | undefined, moduleId: string, body: unknown) {
    const mod = await this.moduleFor(userId, role, moduleId)
    const input = validateItemInput(body)
    if (input.type === 'scorm') {
      throw new BadRequestException('Upload a package file to add a SCORM item')
    }
    const last = await this.prisma.courseItem.aggregate({
      where: { moduleId },
      _max: { position: true },
    })
    await this.prisma.courseItem.create({
      data: {
        moduleId,
        type: input.type,
        title: input.title,
        label: input.label,
        config: input.config as object,
        position: (last._max.position ?? 0) + 1,
      },
    })
    return this.detail(userId, role, mod.courseId)
  }

  async updateItem(userId: string, role: string | undefined, itemId: string, body: unknown) {
    const item = await this.itemFor(userId, role, itemId)
    const input = validateItemInput(body)
    // A SCORM item's package cannot be swapped by editing; only its title changes.
    const data =
      item.type === 'scorm'
        ? { title: input.title }
        : {
            type: input.type,
            title: input.title,
            label: input.label,
            config: input.config as object,
          }
    await this.prisma.courseItem.update({ where: { id: itemId }, data })
    return this.detail(userId, role, item.module.courseId)
  }

  async removeItem(userId: string, role: string | undefined, itemId: string) {
    const item = await this.itemFor(userId, role, itemId)
    await this.assertNoProgress({ itemId })
    await this.prisma.courseItem.delete({ where: { id: itemId } })
    return this.detail(userId, role, item.module.courseId)
  }

  /** Learner results hang off items, so an item or module with results cannot be deleted. */
  private async assertNoProgress(where: object): Promise<void> {
    const n = await this.prisma.itemProgress.count({ where })
    if (n > 0) {
      throw new ConflictException('Learners have results here, so it cannot be deleted.')
    }
  }

  /** Set the order of modules and of the items inside each, moving items between modules. */
  async reorder(
    userId: string,
    role: string | undefined,
    courseId: string,
    outline: CourseOutline
  ) {
    await this.courseFor(userId, role, courseId)
    const modules = await this.prisma.courseModule.findMany({
      where: { courseId },
      select: { id: true, items: { select: { id: true } } },
    })
    const moduleIds = new Set(modules.map((m) => m.id))
    const itemIds = new Set(modules.flatMap((m) => m.items.map((i) => i.id)))
    const sent = outline.moduleIds ?? []
    const sentItems = Object.values(outline.itemIds ?? {}).flat()
    const same = (a: string[], b: Set<string>) => a.length === b.size && a.every((x) => b.has(x))
    if (!same(sent, moduleIds) || !same(sentItems, itemIds)) {
      throw new BadRequestException(
        'The new order does not match this course. Reload and try again.'
      )
    }
    await this.prisma.$transaction([
      ...sent.map((id, i) =>
        this.prisma.courseModule.update({ where: { id }, data: { position: i + 1 } })
      ),
      ...sent.flatMap((moduleId) =>
        (outline.itemIds[moduleId] ?? []).map((id, i) =>
          this.prisma.courseItem.update({ where: { id }, data: { moduleId, position: i + 1 } })
        )
      ),
    ])
    return this.detail(userId, role, courseId)
  }

  // ── pickers ───────────────────────────────────────────────────────────────

  async assessmentCatalog(role: string | undefined): Promise<CatalogEntry[]> {
    this.learn.assertRole(role, MANAGERS)
    const rows = await this.prisma.assessment.findMany({
      select: { slug: true, title: true },
      orderBy: { title: 'asc' },
    })
    return rows.map((r) => ({ id: r.slug, title: r.title }))
  }

  async scenarioCatalog(role: string | undefined): Promise<CatalogEntry[]> {
    this.learn.assertRole(role, MANAGERS)
    const rows = await this.prisma.scenario.findMany({
      where: { status: 'published' },
      select: { scenarioId: true, data: true },
      orderBy: { scenarioId: 'asc' },
    })
    return rows.map((r) => {
      const d = (r.data ?? {}) as { title?: string; track?: string }
      return { id: r.scenarioId, title: d.title ?? r.scenarioId, detail: d.track }
    })
  }
}

function toItemDto(i: {
  id: string
  moduleId: string
  type: string
  title: string
  position: number
  label: string | null
  config: unknown
}): CourseItemDto {
  return {
    id: i.id,
    moduleId: i.moduleId,
    type: i.type,
    title: i.title,
    position: i.position,
    label: i.label,
    config: (i.config ?? {}) as Record<string, unknown>,
  }
}
