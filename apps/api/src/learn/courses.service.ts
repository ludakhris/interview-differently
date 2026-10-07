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
  LearnToolList,
} from './learn-types'
import {
  managedTools,
  scopeOf,
  toolAllowedFor,
  toolById,
} from '../lti/platform/lti-platform-config'
import { toolView } from '../lti/platform/tool-config'
import { PrismaService } from '../prisma/prisma.service'
import { slugify, validateCourseFields, validateItemInput } from './course-config'
import { imageUrl, isImageKey } from './item-image'
import { parseSkills } from './skills'
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
  outcomes: string[]
  targetRoles: string[]
  skills: unknown
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
  outcomes: c.outcomes,
  targetRoles: c.targetRoles,
  skills: parseSkills(c.skills),
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

  /** Sets or clears the preview image of an external course item. */
  async setItemImage(userId: string, role: string | undefined, itemId: string, key: string | null) {
    const item = await this.itemFor(userId, role, itemId)
    if (item.type !== 'external_link')
      throw new BadRequestException('Only an external course item has a preview image')
    const rest = { ...((item.config ?? {}) as Record<string, unknown>) }
    delete rest.imageKey
    await this.prisma.courseItem.update({
      where: { id: itemId },
      data: { config: (key ? { ...rest, imageKey: key } : rest) as object },
    })
    return this.detail(userId, role, item.module.courseId)
  }

  async assertItemAccess(userId: string, role: string | undefined, itemId: string): Promise<void> {
    await this.itemFor(userId, role, itemId)
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
        skills: fields.skills as object | undefined,
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
      data: (({ skills, ...rest }) => ({
        ...rest,
        ...(skills ? { skills: skills as object } : {}),
      }))(validateCourseFields(body, true)),
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
    await this.assertToolAllowed(mod.courseId, input)
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
    // An item keeps working on its tool even after the tool is switched off or its access is
    // narrowed: it can still be renamed, marked optional or re-scored. Only a change of tool is checked.
    const currentTool = (item.config as { toolId?: unknown } | null)?.toolId
    const keepTool =
      item.type === 'tool' && typeof currentTool === 'string' ? currentTool : undefined
    const input = validateItemInput(body, { keepTool })
    if (!(input.type === 'tool' && (input.config as { toolId?: unknown }).toolId === keepTool))
      await this.assertToolAllowed(item.module.courseId, input)
    // A SCORM item's package cannot be swapped by editing; only its title and whether it is
    // remediation content change.
    const data =
      item.type === 'scorm'
        ? { title: input.title, config: scormConfig(item.config, input.config) }
        : {
            type: input.type,
            title: input.title,
            label: input.label,
            config: input.config as object,
          }
    await this.prisma.courseItem.update({ where: { id: itemId }, data })
    return this.detail(userId, role, item.module.courseId)
  }

  /** The tools an author may put in this course: enabled, and available to its provider. */
  async toolsFor(
    userId: string,
    role: string | undefined,
    courseId: string
  ): Promise<LearnToolList> {
    const course = await this.courseFor(userId, role, courseId)
    const provider = await this.prisma.institution.findUnique({
      where: { id: course.provider.id },
      select: { id: true, parentId: true },
    })
    const scope = provider ? scopeOf(provider) : [course.provider.id]
    const canManage = role === LEARN_ROLES.systemAdmin
    return {
      tools: managedTools()
        .filter((t) => t.enabled && toolAllowedFor(t, scope))
        .map((t) => toolView(t, canManage)),
      // Connection settings are for administrators; an author only picks a tool.
      connections: [],
      canManage,
    }
  }

  /** A tool item may only use a tool this course's provider (or its agency) is allowed to use. */
  private async assertToolAllowed(
    courseId: string,
    input: { type: string; config: unknown }
  ): Promise<void> {
    if (input.type !== 'tool') return
    const tool = toolById((input.config as { toolId?: unknown }).toolId)
    if (!tool || tool.workspaceIds.length === 0) return
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { provider: { select: { id: true, parentId: true } } },
    })
    if (!course || !toolAllowedFor(tool, scopeOf(course.provider)))
      throw new BadRequestException(`${tool.name} is not available to this provider`)
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

/** A SCORM item's stored config, with its remediation or review setting set or cleared. */
function scormConfig(stored: unknown, incoming: Record<string, unknown>): object {
  const config = { ...((stored ?? {}) as Record<string, unknown>) }
  delete config.remediationFor
  delete config.reviewFor
  for (const key of ['remediationFor', 'reviewFor'] as const) {
    if (typeof incoming[key] === 'string' && incoming[key]) config[key] = incoming[key]
  }
  return config
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
    config: withImageUrl((i.config ?? {}) as Record<string, unknown>),
  }
}

/** Authors see where an item's preview image is served from, so the editor can show it. */
function withImageUrl(config: Record<string, unknown>): Record<string, unknown> {
  return isImageKey(config.imageKey) ? { ...config, imageUrl: imageUrl(config.imageKey) } : config
}
