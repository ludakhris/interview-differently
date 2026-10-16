/**
 * What Better Stack Uptime monitors, and where each check sits on the public status page (GitHub issue #92).
 * CI applies this file with scripts/betterstack-sync.ts on every push to main; see docs/monitoring.md.
 *
 * A check is matched to its Better Stack monitor by URL, or by name when only the URL changed, so renaming a check or
 * moving its URL updates the monitor in place. Changing both at once creates a new monitor and reports the old one.
 * Nothing is ever deleted: a check removed from this list is reported, and the owner removes it in Better Stack.
 *
 * Monitors are named `${monitorPrefix} · ${emoji} ${product short name} · ${check name}`, e.g. "Learn Differently · 🕹️
 * Simulator · Simulation scoring" (alerts and incidents use that name, so they say platform, product and check), and all go in the
 * monitor group `monitorGroup`. On the shared public status page the platform has one section, titled `platform`, and
 * each row is named `${platform} · ${emoji} ${product name} · ${check name}`.
 *
 * Every check is a "status code 2xx" check (the health endpoints answer 503 when failing), every 5 minutes, alerting
 * the team by email.
 */

/**
 * How a check's row is drawn on the status page (Better Stack's `widget_type`): 'history' is the status with a bar per
 * day; 'intraday_history' the same with finer bars, so it shows when in the day something failed;
 * 'intraday_response_times' ("with intraday status history and chart") adds a chart of the check's response time.
 */
export type StatusWidget = 'plain' | 'history' | 'intraday_history' | 'intraday_response_times'

export interface Check {
  /** The monitor's and the status page row's name. */
  name: string
  /** Path on `apiBase`. */
  path: string
  /** How its row is drawn; default 'history'. */
  widget?: StatusWidget
  /** What it checks, in plain words: shown in the help icon on its status page row. */
  explanation: string
}

export interface Section {
  /** The product's emoji, also in each monitor's name so an alert says which product it is. */
  emoji: string
  /** The product's name, in its rows on the status page. */
  name: string
  /** The product's short name in monitor names (alerts), e.g. "Simulator". */
  short: string
  checks: Check[]
}

export interface Monitoring {
  /** The platform's full name: its section on the shared public status page, and the start of each row there. */
  platform: string
  /** Put in front of every monitor's name, as the Better Stack account also holds other projects' monitors. */
  monitorPrefix: string
  /** The Better Stack monitor group all our monitors go in, matched by name. */
  monitorGroup: string
  apiBase: string
  /** Seconds between checks. */
  checkFrequency: number
  statusPage: {
    /** The status page's title in Better Stack (`company_name`). */
    name: string
    /**
     * Its address, `<subdomain>.betteruptime.com`. Unique across all of Better Stack, and the key the sync matches the
     * page by: changing it creates a new page (the free plan allows one).
     */
    subdomain: string
  }
  sections: Section[]
}

export const monitoring: Monitoring = {
  platform: 'Learn Differently',
  monitorPrefix: 'Learn Differently',
  monitorGroup: 'Learn Differently',
  apiBase: 'https://api.interviewdifferently.com',
  checkFrequency: 300,
  statusPage: {
    // the account's one status page, shared by every product (Learn, Interview, Audit Differently, …): used as it is,
    // never renamed; `name` is only used if it ever has to be created
    name: 'Chow Works status',
    subdomain: 'chow-works',
  },
  sections: [
    {
      emoji: '🏛️',
      name: 'Learning Management (LMS)',
      short: 'LMS',
      checks: [
        {
          name: 'Platform API',
          path: '/api/health',
          explanation: 'The API every Learn Differently product uses is answering.',
        },
      ],
    },
    {
      emoji: '💡',
      name: 'Micro Learning (Spark)',
      short: 'Spark',
      checks: [
        {
          name: 'Video lessons',
          path: '/api/health/videos/setup',
          explanation:
            'Video lessons can be made for learners, and the lesson player is reachable.',
        },
        {
          name: 'Video lesson failures (last 15 min)',
          path: '/api/health/videos/recent-failures',
          explanation:
            'Down if making a video lesson failed for any learner in the last 15 minutes.',
          // a failure count: finer bars show when in the day failures happened (a chart would only show the
          // check's response time, not the count)
          widget: 'intraday_history',
        },
      ],
    },
    {
      emoji: '🕹️',
      name: 'Skill Simulator',
      short: 'Simulator',
      checks: [
        {
          name: 'Simulation scoring',
          path: '/api/health/grading/self-test',
          explanation:
            'A real scoring run of a learner answer works, checked at most every five minutes.',
        },
        {
          name: 'Simulation scoring failures (last 15 min)',
          path: '/api/health/grading/recent-failures',
          explanation: 'Down if scoring a learner’s answer failed in the last 15 minutes.',
          widget: 'intraday_history',
        },
      ],
    },
  ],
}
