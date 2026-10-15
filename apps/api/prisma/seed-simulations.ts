import { readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { PGlite } from '@electric-sql/pglite'
import type { PrismaClient } from '@prisma/client'
import { parseAssessmentMarkdown } from '../src/simulator/assessments/parse-markdown'

/**
 * Seeds Interview Differently's work simulations from prisma/simulations/*.md (GitHub issue #90): chat-style SQL
 * simulations, written in the question-bank format (docs/assessment-format.md) with a `> from:` sender on each
 * request. Like scenarios and datasets, the file is the source of truth: each run refreshes the row. They are
 * platform-wide (no institution), so every signed-in learner finds them in the Data Analytics track. Every answer key is
 * run on its dataset first, as an import would. Needs the datasets seeded.
 */
export async function seedSimulations(prisma: PrismaClient): Promise<number> {
  const dir = resolve(__dirname, 'simulations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'))
  for (const file of files) {
    const markdown = readFileSync(join(dir, file), 'utf-8')
    const parsed = parseAssessmentMarkdown(markdown)
    const dataset = parsed.dataset
      ? await prisma.dataset.findUnique({ where: { slug: parsed.dataset } })
      : null
    if (!dataset)
      throw new Error(`${file}: dataset "${parsed.dataset}" not found; seed datasets first`)
    const db = new PGlite()
    try {
      await db.exec(dataset.setupSql)
      for (const s of parsed.sections)
        for (const q of s.questions) if (q.type === 'sql') await db.query(q.referenceSql)
    } finally {
      await db.close()
    }
    const data = {
      title: parsed.title,
      datasetId: dataset.id,
      sourceMarkdown: markdown,
      sections: parsed.sections as unknown as object,
      institutionId: null,
    }
    await prisma.assessment.upsert({
      where: { slug: parsed.slug },
      create: { slug: parsed.slug, ...data },
      update: data,
    })
    console.log(`  ✓ ${parsed.slug} — ${parsed.title}`)
  }
  return files.length
}
