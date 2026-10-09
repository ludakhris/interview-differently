/**
 * The five connected apps. Every one will share a single learner record. The
 * list lives here once so menus, switchers, the homepage and each product page
 * read the same thing. Only list a piece as 'available' when it can be opened today.
 */
export type ProductStatus = 'available' | 'soon'

export interface ProductFeature {
  title: string
  body: string
}

export interface Product {
  id: 'lms' | 'micro-learning' | 'skill-simulator' | 'job-board-match' | 'talent-match'
  /** Display name. */
  name: string
  /** The framework role this piece plays (deck slide 6). */
  role: string
  tagline: string
  status: ProductStatus
  /** Where it opens when available. `external` links leave this site. */
  href?: string
  external?: boolean
  /** The product page: a headline, what it does, what the learner gets, and four things it includes. */
  headline: string
  pitch: string
  forLearners: string
  features: ProductFeature[]
}

export const PRODUCTS: Product[] = [
  {
    id: 'lms',
    name: 'Learning Management',
    role: 'Structure',
    tagline: 'Pathways, cohorts, progress and credentials.',
    status: 'available',
    href: '/lms/dashboard',
    headline: 'Run the whole program without the spreadsheets.',
    pitch:
      'Partners build programs, enroll cohorts and track progress in one place. Every lesson, simulation and credential lands in the learner’s record.',
    forLearners:
      'Start where your skills already are, skip what you’ve proved, and see every gain land on your record.',
    features: [
      {
        title: 'Pathways and cohorts',
        body: 'Build career pathways and run cohorts on your own calendar.',
      },
      {
        title: 'Attendance and activity',
        body: 'Take attendance in a tap, export it, and see time on task for learners working on their own.',
      },
      {
        title: 'Progress dashboards',
        body: 'Instructors and case managers see who is thriving and who needs help.',
      },
      {
        title: 'Credentials',
        body: 'Issue badges and certificates tied to skills learners have shown.',
      },
      {
        title: 'Outcome reporting',
        body: 'Export the results funders and accreditors ask for.',
      },
    ],
  },
  {
    id: 'micro-learning',
    name: 'Micro Learning',
    role: 'Spark',
    tagline: 'Short lessons and live office hours.',
    status: 'soon',
    headline: 'Learning that fits in a scroll',
    pitch:
      'Bite-sized "Micro-Lessons" from instructors and the education creators already going viral, brought into the pathway, plus live office hours. Every short lesson ends in a real-world exercise.',
    forLearners: 'Learn on your phone, between shifts, and never get stuck alone.',
    features: [
      {
        title: 'Short-form lessons',
        body: 'Videos that teach one skill, then put it to work.',
      },
      {
        title: 'Connected content',
        body: 'We are connecting to the platforms and providers creators already use, so their lessons can sit in the pathway instead of being rebuilt.',
      },
      {
        title: 'Engaging creators',
        body: 'Industry creators who make tough topics click, in a curated library.',
      },
      {
        title: 'Office hours',
        body: 'Live drop-in sessions with instructors and mentors to get unstuck.',
      },
    ],
  },
  {
    id: 'skill-simulator',
    name: 'Skill Simulator',
    role: 'Practice',
    tagline: 'AI-powered scenarios drawn from real jobs.',
    status: 'available',
    href: 'https://interviewdifferently.com/dashboard',
    external: true,
    headline: 'Practice the job before day one',
    pitch:
      'AI-powered simulations of real workplace scenarios, working alongside AI agents the way modern teams do. Short exercises build up to full simulations of the job.',
    forLearners: 'Walk into interviews with proof, not just a certificate.',
    features: [
      {
        title: 'Real-job scenarios',
        body: 'A help desk queue, a data request, a client brief: tasks from actual roles.',
      },
      {
        title: 'Work with AI agents',
        body: 'Practice directing, checking and improving an agent’s work.',
      },
      {
        title: 'Instant coaching',
        body: 'Feedback on every attempt, with instructors looped in when it matters.',
      },
      {
        title: 'Skills evidence',
        body: 'Every exercise adds to a verified skills profile, starting in week one.',
      },
    ],
  },
  {
    id: 'job-board-match',
    name: 'Job Board Match',
    role: 'Opportunity',
    tagline: 'Roles matched to the skills learners have proven.',
    status: 'soon',
    headline: 'Jobs that fit what you can actually do',
    pitch:
      'Roles from partner employers and the job sources we connect to, matched to the skills a learner has proven, not the titles on a resume. Each match shows the gap to the next job and the lessons that close it.',
    forLearners: 'See the gap to your next role, and apply with your simulation work attached.',
    features: [
      {
        title: 'Connected to job sources',
        body: 'Postings come from partner employers and the job sources we connect to, so learners are not sent to yet another job site.',
      },
      {
        title: 'Matched on proven skills',
        body: 'Roles ranked against the verified skills profile, not keywords, with the gap to each role and the lesson that covers it.',
      },
      {
        title: 'Apply with evidence',
        body: 'Simulation work and verified skills travel with the application.',
      },
      {
        title: 'Demand flows back',
        body: 'What employers ask for most feeds the next pathway and lesson.',
      },
    ],
  },
  {
    id: 'talent-match',
    name: 'Talent Match',
    role: 'Placement',
    tagline: 'Employers find and hire verified talent.',
    status: 'soon',
    headline: 'Hire from proof, not keywords',
    pitch:
      'Employers search candidates by verified skills, review real work samples from simulations, and hire from partner cohorts who are ready on day one.',
    forLearners: 'Be found for what you have proven, by employers your program already works with.',
    features: [
      {
        title: 'Search by verified skills',
        body: 'Filter candidates by skills they have shown, not words on a resume.',
      },
      {
        title: 'Real work samples',
        body: 'Watch or read the simulation work behind every skill.',
      },
      {
        title: 'Partner cohorts',
        body: 'Hire from the programs you fund or sponsor, with the training record attached and the hire recorded.',
      },
      {
        title: 'Learner-controlled sharing',
        body: 'Learners choose which organizations may see their profile and resume.',
      },
    ],
  },
]

/** Public site: every piece, built or not, opens its own product page. */
export const productPagePath = (p: Product): string => `/products/${p.id}`
