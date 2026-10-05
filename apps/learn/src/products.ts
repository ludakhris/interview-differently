/**
 * The five connected apps. Every one will share a single learner record. The
 * list lives here once so menus, switchers and any future product page read the
 * same thing. Only list a piece as 'available' when it can be opened today.
 */
export type ProductStatus = 'available' | 'soon'

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
}

export const PRODUCTS: Product[] = [
  {
    id: 'lms',
    name: 'Learning Management',
    role: 'Structure',
    tagline: 'Pathways, cohorts, progress and credentials.',
    status: 'available',
    href: '/dashboard',
  },
  {
    id: 'micro-learning',
    name: 'Micro Learning',
    role: 'Spark',
    tagline: 'Short lessons and live office hours.',
    status: 'soon',
  },
  {
    id: 'skill-simulator',
    name: 'Skill Simulator',
    role: 'Practice',
    tagline: 'AI-powered scenarios drawn from real jobs.',
    status: 'available',
    href: 'https://interviewdifferently.com/dashboard',
    external: true,
  },
  {
    id: 'job-board-match',
    name: 'Job Board Match',
    role: 'Opportunity',
    tagline: 'Roles matched to the skills learners have proven.',
    status: 'soon',
  },
  {
    id: 'talent-match',
    name: 'Talent Match',
    role: 'Placement',
    tagline: 'Employers find and hire verified talent.',
    status: 'soon',
  },
]

/** Public site: every piece, built or not, opens its own product page. */
export const productPagePath = (p: Product): string => `/products/${p.id}`
