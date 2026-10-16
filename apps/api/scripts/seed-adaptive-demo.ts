/**
 * Adaptive checkpoints demo (GitHub issue #90): an SQL Fundamentals course with a diagnostic, four skill modules,
 * extra content and targeted-practice slots for each skill, and a capstone; a cohort with two scripted
 * learners, Maya and Theo (src/learn/adaptive/demo-course.ts). Runs inside the Cedar Mill and Lantern Hill demo
 * providers, featured demos, so the board can autoplay the learners. Fictional people, fictional store data.
 *
 * Every row it creates has an id starting with "demo-adaptive-". Rerunning rebuilds the course and resets
 * Maya and Theo to the start, so a demo can be given again.
 *
 * Usage (from apps/api), after `npm run seed:learn-demo` has made the demo institutions:
 *   npm run seed:adaptive-demo
 *   npm run seed:adaptive-demo -- --allow-host <host>   # a database other than localhost (the owner's OK first)
 */

import './lib/owner-env'
import { PrismaClient } from '@prisma/client'
import {
  DEMO_BANK,
  DEMO_COURSE_SLUG,
  DEMO_SKILLS,
  PERSONAS,
  T,
  type DemoSkill,
} from '../src/learn/adaptive/demo-course'
import { seedSimulations } from '../prisma/seed-simulations'
import { CHECKPOINT_TOOL_ID } from '../src/learn/skills'

const PROVIDER_ID = 'demo-inst-cedar-mill'
/**
 * Where the course runs: Cedar Mill first (it also owns the question bank), then a copy at Lantern Hill, each with
 * its own cohort and Maya and Theo enrolled. Both are featured demos, so both boards can autoplay.
 */
const SITES = [
  {
    providerId: PROVIDER_ID,
    prefix: 'demo-adaptive',
    slug: DEMO_COURSE_SLUG,
    joinKey: 'ADAPTIVE-SQL',
  },
  {
    providerId: 'demo-inst-lantern-hill',
    prefix: 'demo-adaptive-lh',
    slug: `${DEMO_COURSE_SLUG}-lantern-hill`,
    joinKey: 'ADAPTIVE-SQL-LH',
  },
]
const DAY = 24 * 60 * 60 * 1000

function guard(): void {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const host = new URL(url).hostname
  const i = process.argv.indexOf('--allow-host')
  const allow = i >= 0 ? process.argv[i + 1] : undefined
  if (['localhost', '127.0.0.1'].includes(host) || host === allow) return
  console.error(
    `Refusing to run against "${host}". Pass --allow-host ${host} only with the owner's OK.`
  )
  process.exit(1)
}

const LESSONS: Record<DemoSkill, string> = {
  filter: [
    'Every request you get at work is really two questions: which columns do they want to see, and which rows do they care about.',
    'SELECT names the columns. FROM names the table. WHERE keeps only the rows that match a condition.',
    "- Text goes in single quotes: WHERE state = 'TX'\n- Combine conditions with AND (both must be true) or OR (either is enough)\n- A missing value is NULL, and you test it with IS NULL, never = NULL",
    'Read the request again before you run your query, and check one row of your result against it.',
  ].join('\n\n'),
  sort: [
    'Results come back in no particular order unless you ask for one.',
    'ORDER BY sorts. ASC (the default) is smallest first, DESC is largest first. LIMIT keeps only the first rows after sorting.',
    '- "Top 5 most expensive" means ORDER BY price DESC LIMIT 5\n- When two rows tie, add a second column to ORDER BY so the order is always the same',
  ].join('\n\n'),
  aggregate: [
    'Managers rarely want every row. They want totals: how many, how much, on average.',
    'COUNT, SUM and AVG turn many rows into one number. GROUP BY gives you one number per group, for example per state.',
    '- Every column you SELECT must either be in GROUP BY or inside a function like COUNT\n- WHERE filters rows before grouping; HAVING filters the groups after',
  ].join('\n\n'),
  join: [
    'Real data is split across tables: customers in one, orders in another. A JOIN puts them side by side.',
    'You join on the column the tables share, usually an id: orders.customer_id = customers.customer_id.',
    '- JOIN keeps only rows that match in both tables\n- LEFT JOIN keeps every row from the first table, with NULLs where there is no match\n- To find "customers with no orders", LEFT JOIN and keep the rows where the order is NULL',
  ].join('\n\n'),
}

const ANOTHER: Record<DemoSkill, string> = {
  filter: [
    'Think of WHERE as asking each row a yes-or-no question. Only rows that answer "yes" make it into your result.',
    '"Customers in Texas who signed up this year" is two questions joined by AND: is the state TX? and is the signup date this year? A row needs two yeses.',
    'OR is more generous: one yes is enough. That is why OR usually returns more rows than you expect.',
    'NULL means "unknown", so "is the email equal to unknown?" can never be answered yes. Ask "is the email unknown?" instead: IS NULL.',
  ].join('\n\n'),
  sort: [
    'Sorting in SQL is like clicking a column header in a spreadsheet. Clicking it twice flips the order: that is DESC.',
    'LIMIT is like reading only the first few lines after you have sorted.',
  ].join('\n\n'),
  aggregate: [
    'Picture sorting a pile of receipts into smaller piles, one per state. GROUP BY makes the piles; COUNT counts each pile.',
    'You cannot ask "which piles have at least 6 receipts?" before the piles exist. That is why the question goes in HAVING, after GROUP BY, not in WHERE.',
  ].join('\n\n'),
  join: [
    'Imagine two printed lists: customers, and orders with a customer number on each. A join is you running a finger down the orders and finding each customer by number.',
    'An inner JOIN drops any customer you never found on the orders list. A LEFT JOIN keeps them, with a blank where the order would be. Those blanks are exactly the customers who never ordered.',
  ].join('\n\n'),
}

const SKILL_TASKS: Record<DemoSkill, { section: number }> = {
  filter: { section: 1 },
  sort: { section: 2 },
  aggregate: { section: 3 },
  join: { section: 4 },
}
const SKILLS = Object.keys(SKILL_TASKS) as DemoSkill[]
async function main() {
  guard()
  const prisma = new PrismaClient()
  try {
    const provider = await prisma.institution.findUnique({ where: { id: PROVIDER_ID } })
    if (!provider) throw new Error(`No ${PROVIDER_ID}: run npm run seed:learn-demo first`)
    const dataset = await prisma.dataset.findUnique({ where: { slug: 'sql-fundamentals' } })
    if (!dataset) throw new Error('No sql-fundamentals dataset: run the main seed first')

    // The requests are Interview Differently's work simulation "First Week on the Data Team"
    // (prisma/simulations), refreshed here so the demo always uses the checked-in file.
    await seedSimulations(prisma)
    if (!(await prisma.assessment.findUnique({ where: { slug: DEMO_BANK } })))
      throw new Error(`No ${DEMO_BANK} simulation in prisma/simulations`)

    for (const site of SITES) {
      if (!(await prisma.institution.findUnique({ where: { id: site.providerId } })))
        throw new Error(`No ${site.providerId}: run npm run seed:learn-demo first`)
      const courseId = `${site.prefix}-course`
      const cohortId = `${site.prefix}-cohort`
      // The course, rebuilt from scratch so a rerun resets it.
      await prisma.course.deleteMany({ where: { id: courseId } })
      await prisma.course.create({
        data: {
          id: courseId,
          providerId: site.providerId,
          slug: site.slug,
          title: 'SQL Fundamentals (adaptive)',
          summary:
            'Answer real requests from colleagues at an online store. A short diagnostic finds what you can already do; your path skips what you have shown and adds help where you need it.',
          sector: 'Technology',
          credential: 'SQL Fundamentals',
          lengthWeeks: 4,
          outcomes: [
            'Pull the right rows and columns for a request',
            'Sort, rank and limit results',
            'Summarize data with counts, totals and averages',
            'Combine customers, orders and products with joins',
          ],
          targetRoles: ['Data analyst', 'Operations analyst', 'Business analyst'],
          skills: DEMO_SKILLS,
          // Content approval is off for the demo; the board's switch turns it on, to show as an option at the end.
          adaptive: { testOut: true, approveGenerated: false },
          status: 'published',
        },
      })
      let m = 0
      const module = async (
        title: string,
        items: { type: string; title: string; config: object }[]
      ) => {
        const id = `${site.prefix}-mod-${m}`
        await prisma.courseModule.create({ data: { id, courseId: courseId, title, position: m++ } })
        for (const [i, item] of items.entries())
          await prisma.courseItem.create({
            data: { id: `${id}-item-${i}`, moduleId: id, position: i, ...item },
          })
      }
      const ref = (skill: DemoSkill, n: number) => `${SKILL_TASKS[skill].section}.${n}`
      await module('Start here', [
        {
          type: 'tool',
          title: T.diagnostic,
          config: {
            toolId: CHECKPOINT_TOOL_ID,
            ref: DEMO_BANK,
            diagnostic: true,
            scenario:
              'Your first morning on the data team at Brightline Goods, an online store. Colleagues will message you requests one at a time. Answer what you can, and pass on anything you have not learned yet: whatever you already show here, you will not have to study again.',
            // Each request comes from a colleague (`> from:` in the bank), so it reads as a morning of messages.
            tasks: SKILLS.flatMap((s) => [1, 2].map((n) => ({ ref: ref(s, n), skill: s }))),
          },
        },
      ])
      const titles: Record<DemoSkill, string> = {
        filter: '1. Finding the right rows',
        sort: '2. Putting results in order',
        aggregate: '3. Summarizing data',
        join: '4. Connecting tables',
      }
      for (const s of SKILLS) {
        await module(titles[s], [
          { type: 'lesson', title: T.lesson[s], config: { body: LESSONS[s], teaches: s } },
          {
            type: 'tool',
            title: T.check[s],
            config: {
              toolId: CHECKPOINT_TOOL_ID,
              ref: DEMO_BANK,
              teaches: s,
              tasks: [3, 4].map((n) => ({ ref: ref(s, n), skill: s })),
            },
          },
          // The library offers two kinds of help for a gap; what the learner said about themselves picks one.
          {
            type: 'lesson',
            title: T.another[s],
            config: {
              body: ANOTHER[s],
              remediationFor: s,
              forLevels: ['some', 'regular'],
              minutes: 5,
            },
          },
          {
            type: 'spark_lesson',
            title: T.video[s],
            config: {
              bank: DEMO_BANK,
              generated: { skill: s },
              remediationFor: s,
              forLevels: ['never'],
              minutes: 2,
            },
          },
          {
            type: 'tool',
            title: T.practice[s],
            config: {
              toolId: CHECKPOINT_TOOL_ID,
              ref: DEMO_BANK,
              generated: { skill: s },
              remediationFor: s,
              tasks: [],
              minutes: 10,
            },
          },
        ])
      }
      await module('Capstone', [
        {
          type: 'tool',
          title: T.capstone,
          config: {
            toolId: CHECKPOINT_TOOL_ID,
            ref: DEMO_BANK,
            scenario:
              'It is the end of the quarter and the leadership team wants numbers. Three requests, each using everything you have learned.',
            tasks: [
              { ref: '5.1', skill: 'join' },
              { ref: '5.2', skill: 'aggregate' },
              { ref: '5.3', skill: 'filter' },
            ],
          },
        },
      ])

      // The cohort: running now, with the two demo learners.
      const now = Date.now()
      await prisma.cohort.upsert({
        where: { id: cohortId },
        create: {
          id: cohortId,
          institutionId: site.providerId,
          name: 'Adaptive SQL pilot',
          joinKey: site.joinKey,
          courseId: courseId,
          startsAt: new Date(now - 7 * DAY),
          endsAt: new Date(now + 60 * DAY),
        },
        update: { courseId: courseId },
      })
      for (const p of PERSONAS) {
        await prisma.user.upsert({
          where: { id: p.userId },
          create: { id: p.userId, email: p.email, displayName: p.name, source: 'learn' },
          update: { displayName: p.name },
        })
        await prisma.enrollment.deleteMany({ where: { cohortId: cohortId, userId: p.userId } })
        await prisma.enrollment.create({
          data: { id: `${site.prefix}-enr-${p.id}`, cohortId: cohortId, userId: p.userId },
        })
      }
      console.log(
        `Adaptive demo ready at ${site.providerId}: course "${site.slug}", cohort ${cohortId} (join code ${site.joinKey}).`
      )
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
