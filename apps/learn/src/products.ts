/**
 * The five connected apps. Every one will share a single learner record. The
 * list lives here once so menus, switchers, the homepage and each product page
 * read the same thing. Only list a piece as 'available' when it is in use today.
 */
export type ProductStatus = 'available' | 'soon'

/** A callout for the institution at the end of a product page, with an emoji beside its title. */
export interface ProductCallout {
  emoji: string
  title: string
  body: string
}

/** One step in how a screenshot's subject was made; `optional` marks a step a team can switch off. */
export interface ProductShotStep {
  label: string
  optional?: boolean
}

/** A screenshot on a product page (files in public/site/products/), beside what it shows. */
export interface ProductShot {
  src: string
  width: number
  height: number
  alt: string
  /** A few words in small caps over the title. */
  eyebrow: string
  title: string
  /** One or two short paragraphs. */
  body: string[]
  /** When set, the steps play in a rail over the screenshot, ending on it. */
  pipeline?: ProductShotStep[]
}

export interface Product {
  id: 'lms' | 'micro-learning' | 'skill-simulator' | 'job-board-match' | 'talent-match'
  /** Display name. */
  name: string
  /** Shown beside the name where the five are drawn together. */
  emoji: string
  /** The framework role this piece plays (deck slide 6). */
  role: string
  tagline: string
  status: ProductStatus
  /** Where the signed-in app opens it, when it has screens of its own here. */
  href?: string
  /** The product page: a headline and pitch, then how it works and what it gives the institution. */
  headline: string
  /** Phrases in the headline, exactly as written there, shown in the accent orange. */
  highlight?: string[]
  pitch: string
  /** The page's main call to action, when it is not booking a walkthrough. */
  cta?: { label: string; href: string }
  /** Screenshots of it at work today. */
  shots?: ProductShot[]
  /** How it works, one short line per step. */
  steps?: string[]
  /** What it gives the institution, in a callout at the end of the page. */
  benefit?: ProductCallout
}

export const PRODUCTS: Product[] = [
  {
    id: 'lms',
    name: 'Learning Management (LMS)',
    emoji: '🏛️',
    role: 'Foundation',
    tagline: 'Pathways, cohorts, progress and credentials.',
    status: 'available',
    href: '/lms/dashboard',
    headline: 'Run the whole program without the spreadsheets.',
    highlight: ['without the spreadsheets'],
    pitch:
      'Partners build programs, enroll cohorts and track progress in one place. Every lesson, simulation and credential lands in the learner’s record.',
    steps: [
      'Build a pathway and open a cohort on your own calendar.',
      'Learners work, and their progress is logged as they go.',
      'Attendance and time on task are captured.',
      'Dashboards show who is thriving and who needs help.',
      'Credentials and outcome reports come from one record.',
    ],
    benefit: {
      emoji: '📊',
      title: 'Outcome reports without the spreadsheets',
      body: 'The results funders and accreditors ask for come from one record, ready to export, instead of being rebuilt by hand from a gradebook, a roster and an attendance sheet.',
    },
  },
  {
    id: 'micro-learning',
    name: 'Micro Learning',
    emoji: '💡',
    role: 'Spark',
    tagline: 'Short lessons made for each learner’s gap.',
    status: 'available',
    headline: 'A short lesson for the exact skill a learner needs',
    highlight: ['exact skill'],
    pitch:
      'When a knowledge gap is discovered, the next lesson is made for it, not a retake of the course. Spark makes a short lesson on that one skill, and it is added to the learner’s course path. Instructors monitor progress and oversee the lessons that are generated.',
    shots: [
      {
        src: '/site/products/spark-lesson.png',
        width: 782,
        height: 502,
        alt: 'A Spark lesson player showing “Counting Rows Per Group with GROUP BY”, 7 scenes, about 84 seconds, with Play and Voice on controls.',
        eyebrow: 'One gap, one lesson',
        title: 'A lesson made for one learner',
        body: [
          'A short narrated lesson in scenes, with a title made for the learner. This one teaches grouping, the skill a checkpoint showed the learner needed.',
          'It takes a minute or two, plays inside the course, and who watched it is logged on the learner’s record.',
        ],
        pipeline: [
          { label: 'Gap identified' },
          { label: 'AI-generated' },
          { label: 'Instructor reviews', optional: true },
          { label: 'Video ready' },
        ],
      },
    ],
    steps: [
      'The learner does a simulation.',
      'A learning gap is detected.',
      'A lesson is made for the gap.',
      'It is added to their course path, as in the timeline above.',
    ],
    benefit: {
      emoji: '📚',
      title: 'A micro-learning library that grows',
      body: 'Approved lessons are reused for the next learner with the same gap, so your library grows with every cohort, without an instructor writing each one.',
    },
  },
  {
    id: 'skill-simulator',
    name: 'Skill Simulator',
    emoji: '🕹️',
    role: 'Practice',
    tagline: 'AI-powered scenarios drawn from real jobs.',
    status: 'available',
    headline: 'Simulate the actual job. Identify the skill gap.',
    highlight: ['Simulate'],
    pitch:
      'A simulation of the job, scored on the spot, with the work sample saved to the record. Real work alongside AI agents, from a growing catalogue of scenarios drawn from real jobs.',
    cta: { label: 'Open Interview Differently', href: 'https://interviewdifferently.com' },
    steps: [
      'The learner is placed in a real-world scenario.',
      'They use a skill they have been taught to take part.',
      'Follow-ups drive them through a real exercise.',
      'AI agents guide them along the way.',
      'Their work is evaluated, with feedback on the spot.',
    ],
    benefit: {
      emoji: '🔁',
      title: 'Practice outside the course, too',
      body: 'Learners can open the same simulations on their own at Interview Differently, outside any course. The evidence lands on the learner’s record either way.',
    },
  },
  {
    id: 'job-board-match',
    name: 'Job Board Match',
    emoji: '🔎',
    role: 'Opportunity',
    tagline: 'Roles matched to the skills learners have proven.',
    status: 'soon',
    headline: 'Jobs that fit what you can actually do',
    pitch:
      'Roles from partner employers and the job sources we connect to, matched to the skills a learner has proven, not the titles on a resume. Each match shows the gap to the next job and the lessons that close it.',
    steps: [
      'Skills are proven on the learner’s record.',
      'Roles from partner employers and job sources are matched to them.',
      'The gap to each role is shown, with the lesson that closes it.',
      'Learners apply with their proof attached.',
    ],
    benefit: {
      emoji: '🎯',
      title: 'Placements you can show',
      body: 'Every match is backed by skills learners proved, so you can show employers and funders the evidence behind each placement.',
    },
  },
  {
    id: 'talent-match',
    name: 'Talent Match',
    emoji: '🤝',
    role: 'Placement',
    tagline: 'Employers find and hire verified talent.',
    status: 'soon',
    headline: 'Hire from proof, not keywords',
    pitch:
      'Employers search candidates by verified skills, review real work samples from simulations, and hire from partner cohorts who are ready on day one.',
    steps: [
      'Learners prove skills in simulations and checkpoints.',
      'Profiles are verified from that evidence.',
      'Employers search verified talent, with work samples attached.',
      'Hires and placements are recorded.',
    ],
    benefit: {
      emoji: '🤝',
      title: 'Your graduates, found and hired',
      body: 'Employer partners find your verified graduates by the skills they proved, and you see who was hired, on the same learner record.',
    },
  },
]

/** Public site: every piece, built or not, opens its own product page. */
export const productPagePath = (p: Product): string => `/products/${p.id}`

/** Signed-in app: an available piece opens its screens here, or its product page if it has none. */
export const appProductPath = (p: Product): string | null =>
  p.status === 'available' ? (p.href ?? productPagePath(p)) : null
