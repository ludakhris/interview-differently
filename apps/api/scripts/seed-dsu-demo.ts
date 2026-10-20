/**
 * Demonstration site for Delaware State University's Office of Adult and Continuing Education (#124).
 *
 * Loads the DSU ACE agency (subdomain "dsu"), its provider, the 15 certificate programs listed in the
 * office's public course guide (titles, hours, tuition and certification exams as published there,
 * October 2026), one always-open cohort per program that takes requests from the catalog, and a few
 * enrollment requests from fictional people so the staff side has something to show.
 *
 * DSU's name and branding are used with the owner's OK for a demonstration site only (2026-10-20).
 * The learners are fictional. Every row the script makes has an id starting with "dsu-demo-". Removing the
 * demo agency also removes what real people did in it (their requests and enrollments cascade), so the
 * script refuses when there are any, unless --force is passed.
 *
 * Usage (from apps/api):
 *   npm run seed:dsu-demo              # reload: remove old DSU demo rows, insert fresh
 *   npm run seed:dsu-demo -- --remove  # remove DSU demo rows only
 *   npm run seed:dsu-demo -- --allow-host <host>   # run against a non-local database
 *   npm run seed:dsu-demo -- --force   # also delete real people's requests and enrollments in the demo
 *
 * Refuses to run unless DATABASE_URL points at localhost. Never pass --allow-host for production
 * without the owner's OK.
 */

import './lib/owner-env'
import { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '../src/prisma/client'

const DEV_HOSTS = ['localhost', '127.0.0.1']
const PREFIX = 'dsu-demo-'
const AGENCY_ID = `${PREFIX}inst-agency`
const PROVIDER_ID = `${PREFIX}inst-ace`
const CONTACT = 'Adult & Continuing Education, 302-857-6820, aceworkforce@desu.edu'
const FORMAT = 'Online, self-paced'
const PREREQ = 'High school diploma or GED'

interface Program {
  key: string
  title: string
  area: 'Computer Technology' | 'Healthcare' | 'Professional and Business'
  hours: number
  tuition: number
  credential: string
  summary: string
  outcomes: string[]
  roles: string[]
}

// From the ACE course guide (desu.edu/ACE). Every program runs 6 months; tuition includes a $35
// nonrefundable registration fee. Summaries and outcomes are written for this demo, not copied.
const PROGRAMS: Program[] = [
  {
    key: 'adobe-design',
    title: 'Adobe Design Suite',
    area: 'Computer Technology',
    hours: 350,
    tuition: 4034,
    credential: 'Adobe Certified Professional (Photoshop, Illustrator, InDesign)',
    summary:
      'Visual design in Photoshop, illustration in Illustrator and print and digital layout in InDesign, with hands-on labs.',
    outcomes: [
      'Edit and compose images in Photoshop',
      'Build logos and illustrations in Illustrator',
      'Lay out print and digital publications in InDesign',
    ],
    roles: ['Graphic designer', 'Marketing designer', 'Production artist'],
  },
  {
    key: 'aws-sysops',
    title: 'AWS SysOps Administrator Associate',
    area: 'Computer Technology',
    hours: 350,
    tuition: 4034,
    credential: 'AWS Certified SysOps Administrator – Associate',
    summary: 'Deploy, run and monitor systems on Amazon Web Services.',
    outcomes: [
      'Deploy and manage workloads on AWS',
      'Monitor, secure and back up cloud systems',
      'Control cost and capacity',
    ],
    roles: ['Cloud support associate', 'Systems administrator', 'Cloud operations technician'],
  },
  {
    key: 'azure-database',
    title: 'Cloud Database Administrator for Microsoft Azure',
    area: 'Computer Technology',
    hours: 375,
    tuition: 4034,
    credential: 'Microsoft Certified: Azure Administrator Associate',
    summary: 'Set up, secure and look after databases and services on Microsoft Azure.',
    outcomes: [
      'Provision and configure Azure data services',
      'Secure and back up cloud databases',
      'Monitor performance and fix common problems',
    ],
    roles: ['Database administrator', 'Cloud administrator'],
  },
  {
    key: 'security-technician',
    title: 'Computer Security Technician',
    area: 'Computer Technology',
    hours: 375,
    tuition: 4034,
    credential: 'CompTIA Security+ and Network+',
    summary: 'Networking fundamentals and the security practices that protect them.',
    outcomes: [
      'Configure and troubleshoot networks',
      'Spot and respond to common threats',
      'Apply access control and security policy',
    ],
    roles: ['Security technician', 'Network technician', 'SOC analyst (entry level)'],
  },
  {
    key: 'computer-support',
    title: 'Computer Support Specialist',
    area: 'Computer Technology',
    hours: 375,
    tuition: 4034,
    credential: 'CompTIA A+ (Core 1 and Core 2) and Network+',
    summary: 'Hardware, operating systems, networks and help-desk troubleshooting.',
    outcomes: [
      'Install and repair PCs and devices',
      'Support Windows, macOS and mobile users',
      'Troubleshoot home and office networks',
    ],
    roles: ['Help desk technician', 'IT support specialist', 'Desktop support'],
  },
  {
    key: 'front-end-web',
    title: 'Front End Web Design and Development',
    area: 'Computer Technology',
    hours: 375,
    tuition: 4034,
    credential: 'Advanced HTML5 and CSS3 Specialist',
    summary: 'Build web pages with HTML5, CSS3 and JavaScript.',
    outcomes: [
      'Write accessible, responsive pages',
      'Style sites with modern CSS',
      'Add interaction with JavaScript',
    ],
    roles: ['Front-end developer', 'Web designer', 'Web content specialist'],
  },
  {
    key: 'billing-coding',
    title: 'Medical Billing and Coding',
    area: 'Healthcare',
    hours: 375,
    tuition: 3285,
    credential: 'NHA Certified Billing and Coding Specialist (CBCS)',
    summary: 'How healthcare billing works, and coding with ICD-10-CM, CPT and HCPCS.',
    outcomes: [
      'Code diagnoses and procedures',
      'Prepare and follow up insurance claims',
      'Protect patient privacy under HIPAA',
    ],
    roles: ['Medical biller', 'Medical coder', 'Claims specialist'],
  },
  {
    key: 'billing-coding-maa',
    title: 'Medical Billing and Coding with Medical Administrative Assistant',
    area: 'Healthcare',
    hours: 750,
    tuition: 3985,
    credential: 'AAPC Certified Professional Coder (CPC)',
    summary:
      'Billing and coding plus the front-office skills of a medical administrative assistant.',
    outcomes: [
      'Code with ICD-10-CM, ICD-10-PCS and CPT',
      'Run scheduling, records and patient intake',
      'Handle claims from visit to payment',
    ],
    roles: ['Medical coder', 'Medical administrative assistant', 'Patient access representative'],
  },
  {
    key: 'physicians-office',
    title: "Physician's Office Assistant with EHRM",
    area: 'Healthcare',
    hours: 375,
    tuition: 3985,
    credential: 'NHA CMAA and Certified Electronic Health Records Specialist (CEHRS)',
    summary: 'Front-office work in a medical practice, including electronic health records.',
    outcomes: [
      'Greet, schedule and check in patients',
      'Keep electronic health records accurate',
      'Apply medical ethics and basic medical law',
    ],
    roles: ['Medical office assistant', 'Front desk coordinator', 'Health records specialist'],
  },
  {
    key: 'pharmacy-technician',
    title: 'Pharmacy Technician with Medical Administrative Assistant',
    area: 'Healthcare',
    hours: 780,
    tuition: 3985,
    credential: 'PTCB Certified Pharmacy Technician (CPhT)',
    summary: 'Pharmacy practice and calculations, plus medical office skills.',
    outcomes: [
      'Fill and check prescriptions safely',
      'Do pharmacy math and dosage calculations',
      'Handle insurance and front-office tasks',
    ],
    roles: ['Pharmacy technician', 'Medical administrative assistant'],
  },
  {
    key: 'leed-green',
    title: 'LEED Green Associate',
    area: 'Professional and Business',
    hours: 375,
    tuition: 3535,
    credential: 'GBCI LEED Green Associate',
    summary: 'Green building principles and the LEED rating system.',
    outcomes: ['Explain LEED credits and categories', 'Support sustainable building projects'],
    roles: ['Sustainability coordinator', 'Project assistant (construction)'],
  },
  {
    key: 'phr',
    title: 'Professional in Human Resources',
    area: 'Professional and Business',
    hours: 375,
    tuition: 4034,
    credential: 'HRCI Professional in Human Resources (PHR)',
    summary: 'Recruiting, employee relations, pay and benefits, and employment law.',
    outcomes: [
      'Run hiring and onboarding',
      'Handle employee relations fairly and lawfully',
      'Administer pay and benefits',
    ],
    roles: ['HR generalist', 'HR specialist'],
  },
  {
    key: 'aphr',
    title: 'Associate Professional in Human Resources',
    area: 'Professional and Business',
    hours: 375,
    tuition: 4034,
    credential: 'HRCI Associate Professional in Human Resources (aPHR)',
    summary: 'A first credential in HR for people new to the field.',
    outcomes: ['Support recruiting and onboarding', 'Keep HR records and policies'],
    roles: ['HR assistant', 'HR coordinator'],
  },
  {
    key: 'bookkeeping',
    title: 'Professional Bookkeeping with QuickBooks',
    area: 'Professional and Business',
    hours: 375,
    tuition: 3834,
    credential: 'NACPB Bookkeeper Certification and Intuit QuickBooks Certified User',
    summary: 'Bookkeeping and accounting basics, done in QuickBooks.',
    outcomes: [
      'Keep the books for a small business',
      'Run payroll, invoices and reports in QuickBooks',
    ],
    roles: ['Bookkeeper', 'Accounting clerk', 'Office manager'],
  },
  {
    key: 'paralegal',
    title: 'Paralegal',
    area: 'Professional and Business',
    hours: 925,
    tuition: 4034,
    credential: 'NALA Certified Paralegal (CP)',
    summary: 'Legal research and writing, civil procedure and the work of a law office.',
    outcomes: [
      'Research and draft legal documents',
      'Support cases from intake to trial',
      'Manage files and deadlines in a law office',
    ],
    roles: ['Paralegal', 'Legal assistant'],
  },
]

// Fictional people with requests waiting for staff (no real person's data).
const REQUESTS: {
  name: string
  program: string
  daysAgo: number
  intake: Record<string, unknown>
}[] = [
  {
    name: 'Renee Calloway',
    program: 'billing-coding',
    daysAgo: 1,
    intake: {
      phone: '302-555-0118',
      education: 'High School/GED',
      employment: 'employed',
      employer: 'Front desk, a dental office',
      funding: 'wioa',
      language: 'English',
      reason: 'I already handle insurance at work and want to move into billing.',
    },
  },
  {
    name: 'Marcus Oyelaran',
    program: 'computer-support',
    daysAgo: 2,
    intake: {
      phone: '302-555-0164',
      education: 'Associate Degree',
      employment: 'not-employed',
      employer: null,
      funding: 'dvr',
      language: 'English',
      reason: 'I fix computers for family and friends and want to make it a job.',
    },
  },
  {
    name: 'Lucía Paredes',
    program: 'pharmacy-technician',
    daysAgo: 4,
    intake: {
      phone: '302-555-0190',
      education: 'High School/GED',
      employment: 'employed',
      employer: 'Cashier, a grocery store',
      funding: 'unsure',
      language: 'Spanish',
      reason: null,
    },
  },
]

function dbHost(): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return new URL(url).hostname
}

function guard(allowHost: string | undefined): string {
  const host = dbHost()
  if (DEV_HOSTS.includes(host) || host === allowHost) return host
  console.error(
    `Refusing to run: DATABASE_URL host is "${host}", not localhost.\n` +
      `Pass --allow-host ${host} only with the owner's OK.`
  )
  process.exit(1)
}

/** Stops before deleting anything that is not the script's own, or a load that cannot succeed. */
async function preflight(prisma: PrismaClient, force: boolean) {
  const taken = await prisma.institution.findFirst({
    where: { subdomain: { in: ['dsu', 'dsu-ace'] }, id: { notIn: [AGENCY_ID, PROVIDER_ID] } },
    select: { id: true, name: true },
  })
  if (taken) throw new Error(`A DSU subdomain already belongs to ${taken.name} (${taken.id}).`)
  const real = { userId: { not: { startsWith: PREFIX } }, cohort: { id: { startsWith: PREFIX } } }
  const [requests, enrollments] = await Promise.all([
    prisma.joinRequest.count({ where: real }),
    prisma.enrollment.count({ where: real }),
  ])
  if ((requests || enrollments) && !force) {
    console.error(
      `Refusing to run: ${requests} requests and ${enrollments} enrollments from real people are in the ` +
        `demo programs and would be deleted. Pass --force to delete them.`
    )
    process.exit(1)
  }
}

async function remove(prisma: PrismaClient) {
  // Institution deletes cascade to the courses, cohorts and join requests.
  const inst = await prisma.institution.deleteMany({ where: { id: { startsWith: PREFIX } } })
  const users = await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } })
  console.log(`Removed ${inst.count} institutions and ${users.count} demo learners.`)
}

async function load(prisma: PrismaClient) {
  await prisma.institution.create({
    data: {
      id: AGENCY_ID,
      name: 'Delaware State University Adult & Continuing Education',
      kind: 'agency',
      subdomain: 'dsu',
      brand: {
        name: 'Delaware State University Adult & Continuing Education',
        scheme: 'light',
        primary: '#002a3a',
        accent: '#ed1c24',
        link: '#00549a',
        surface: '#ffffff',
        text: '#000000',
      },
    },
  })
  await prisma.institution.create({
    data: {
      id: PROVIDER_ID,
      name: 'DSU Adult & Continuing Education',
      kind: 'provider',
      parentId: AGENCY_ID,
      // A workspace of its own, so staff can open its cohorts and requests from the workspace picker.
      subdomain: 'dsu-ace',
    },
  })

  const cohortOf = new Map<string, string>()
  for (const p of PROGRAMS) {
    const courseId = `${PREFIX}course-${p.key}`
    await prisma.course.create({
      data: {
        id: courseId,
        providerId: PROVIDER_ID,
        slug: `${PREFIX}${p.key}`,
        title: p.title,
        summary: p.summary,
        sector: p.area,
        credential: p.credential,
        lengthWeeks: 26,
        tuitionDollars: p.tuition,
        contactHours: p.hours,
        format: FORMAT,
        prerequisite: PREREQ,
        outcomes: p.outcomes,
        targetRoles: p.roles,
        status: 'published',
        modules: {
          create: [
            {
              id: `${PREFIX}module-${p.key}`,
              title: 'Getting started',
              position: 0,
              items: {
                create: [
                  {
                    id: `${PREFIX}item-${p.key}`,
                    type: 'lesson',
                    title: 'Welcome to your program',
                    position: 0,
                    config: {
                      body:
                        `Welcome to ${p.title}.\n\n` +
                        'Your course runs online and at your own pace. The Adult & Continuing Education ' +
                        'office will send your sign-in for the course platform and set up a call to go ' +
                        `over your schedule and funding.\n\nQuestions: ${CONTACT}.`,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    })
    const cohortId = `${PREFIX}cohort-${p.key}`
    await prisma.cohort.create({
      data: {
        id: cohortId,
        institutionId: PROVIDER_ID,
        courseId,
        name: `${p.title}: open enrollment`,
        startsAt: new Date('2026-09-01T12:00:00Z'),
        endsAt: null,
        requiresApproval: true,
        acceptsRequests: true,
        joinContact: CONTACT,
        delivery: 'online',
      },
    })
    cohortOf.set(p.key, cohortId)
  }

  const now = Date.now()
  for (const [i, r] of REQUESTS.entries()) {
    const userId = `${PREFIX}learner-${i + 1}`
    await prisma.user.create({ data: { id: userId, displayName: r.name, source: 'learn' } })
    await prisma.joinRequest.create({
      data: {
        id: `${PREFIX}request-${i + 1}`,
        cohortId: cohortOf.get(r.program)!,
        userId,
        intake: r.intake as object,
        createdAt: new Date(now - r.daysAgo * 24 * 60 * 60 * 1000),
      },
    })
  }
  console.log(
    `Loaded the DSU ACE agency, ${PROGRAMS.length} programs with open cohorts and ${REQUESTS.length} requests.`
  )
}

async function main() {
  const argv = process.argv.slice(2)
  const i = argv.indexOf('--allow-host')
  const host = guard(i >= 0 ? argv[i + 1] : undefined)
  console.log(`Database host: ${host}`)
  const prisma = new PrismaClient({ adapter: prismaAdapter() })
  try {
    await preflight(prisma, argv.includes('--force'))
    await remove(prisma)
    if (!argv.includes('--remove')) await load(prisma)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
