/**
 * Moves LearnDifferently's native pre/post assessments onto Interview Differently assessments.
 *
 * For every course item of type 'assessment' with inline questions it upserts an ID `Assessment`
 * (slug `ld-<itemId>`, owned by the course's provider, one section holding every question, all
 * drawn) and turns the item into a connected tool item
 * `{ toolId: 'id-assessment', ref: <slug>, maxAttempts: 1 }`, keeping its pre/post label. Learner
 * progress rows are not touched: score, status and attempts stay. The per-question results kept in
 * `data.results` stay too but are no longer read, so per-skill evidence from these items stops
 * feeding remediation (the report lists those items).
 *
 * Idempotent: a converted item is no longer of type 'assessment', so a rerun finds nothing.
 *
 * Usage (from apps/api):
 *   npm run migrate:assessment-items                      # dry run
 *   npm run migrate:assessment-items -- --apply           # convert
 *   npm run migrate:assessment-items -- --allow-host <host>   # run against a non-dev database
 *
 * Refuses to run unless DATABASE_URL points at localhost or the Railway dev database. Never pass
 * --allow-host for production without the owner's OK, and only after the API that supports tool
 * items is deployed.
 */

import 'dotenv/config'
import { Prisma, PrismaClient } from '@prisma/client'
import { planItem, toolConfig } from '../src/learn/assessment-migration'

const DEV_HOSTS = ['localhost', '127.0.0.1', 'zephyr.proxy.rlwy.net']

function guard(allowHost: string | undefined): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const host = new URL(url).hostname
  if (DEV_HOSTS.includes(host) || host === allowHost) return host
  console.error(
    `Refusing to run: DATABASE_URL host is "${host}", not localhost or the dev database.\n` +
      `Pass --allow-host ${host} only with the owner's OK.`
  )
  process.exit(1)
}

async function main() {
  const argv = process.argv.slice(2)
  const apply = argv.includes('--apply')
  const i = argv.indexOf('--allow-host')
  const host = guard(i >= 0 ? argv[i + 1] : undefined)
  console.log(`Database host: ${host}`)
  console.log(apply ? 'Mode: APPLY' : 'Mode: dry run (nothing is written; pass --apply to convert)')

  const prisma = new PrismaClient()
  try {
    const items = await prisma.courseItem.findMany({
      where: { type: 'assessment' },
      orderBy: { id: 'asc' },
      include: {
        module: { select: { course: { select: { id: true, title: true, providerId: true } } } },
        progress: { select: { enrollment: { select: { userId: true } } } },
      },
    })

    let converted = 0
    let questions = 0
    const learners = new Set<string>()
    let progressRows = 0
    const tagged: { id: string; course: string; skills: string[] }[] = []
    const skipped: { id: string; course: string; reason: string }[] = []

    for (const item of items) {
      const course = item.module.course
      const label = `${course.title} (${course.id})`
      const plan = planItem({ id: item.id, title: item.title, config: item.config })
      if (!plan.ok) {
        skipped.push({ id: item.id, course: label, reason: plan.reason })
        continue
      }
      if (apply) {
        await prisma.$transaction([
          prisma.assessment.upsert({
            where: { slug: plan.slug },
            create: {
              slug: plan.slug,
              title: plan.parsed.title,
              datasetId: null,
              institutionId: course.providerId,
              sourceMarkdown: plan.markdown,
              sections: plan.parsed.sections as unknown as object[],
              expectedMinutes: null,
            },
            update: {
              title: plan.parsed.title,
              datasetId: null,
              institutionId: course.providerId,
              sourceMarkdown: plan.markdown,
              sections: plan.parsed.sections as unknown as object[],
              defaultDraw: Prisma.DbNull,
              expectedMinutes: null,
            },
          }),
          prisma.courseItem.update({
            where: { id: item.id },
            data: { type: 'tool', config: toolConfig(plan.slug) as object },
          }),
        ])
      }
      converted++
      questions += plan.questionCount
      progressRows += item.progress.length
      for (const p of item.progress) learners.add(p.enrollment.userId)
      if (plan.skills.length > 0) tagged.push({ id: item.id, course: label, skills: plan.skills })
    }

    console.log(`\nNative assessment items found: ${items.length}`)
    console.log(`Items ${apply ? 'converted' : 'that would be converted'}: ${converted}`)
    console.log(`Questions ${apply ? 'converted' : 'that would be converted'}: ${questions}`)
    console.log(
      `Learners with progress on these items (rows kept unchanged): ${learners.size} (${progressRows} progress rows)`
    )
    console.log(
      `\nItems with skill-tagged questions (per-skill evidence no longer feeds remediation): ${tagged.length}`
    )
    for (const t of tagged) console.log(`  ${t.id}  ${t.course}  skills: ${t.skills.join(', ')}`)
    console.log(`\nItems skipped: ${skipped.length}`)
    for (const s of skipped) console.log(`  ${s.id}  ${s.course}  ${s.reason}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
