import type { LearnWorkspace, LearnWorkspaceSummary } from '@id/types'
import { DashboardShell } from './DashboardShell'
import { useApp } from './app-context'
import { useLoad } from './api'
import { workspaceHref } from './WorkspaceSwitcher'

type Workspace = LearnWorkspace & Partial<LearnWorkspaceSummary>

const SVG = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/** One picture per workspace type: a civic building, a graduation cap, two people. */
function TypeIcon({ kind }: { kind: string }) {
  if (kind === 'agency')
    return (
      <svg {...SVG}>
        <path d="M3 10 12 4l9 6" />
        <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" />
        <path d="M3 21h18" />
      </svg>
    )
  if (kind === 'provider')
    return (
      <svg {...SVG}>
        <path d="m2 9 10-5 10 5-10 5z" />
        <path d="M6 11.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5" />
        <path d="M22 9v6" />
      </svg>
    )
  return (
    <svg {...SVG}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17.5" cy="9" r="2.3" />
      <path d="M17 14.2c2.4.2 4.5 2.2 4.5 4.8" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg {...SVG} width={18} height={18}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.6v.1" />
    </svg>
  )
}

/** Order within an agency: providers first, then the organizations that run their courses. */
const CHILD_ORDER = ['provider', 'organization', 'academic']

/** The three workspace types, as the help panel explains them. Colleges count as organizations. */
const TYPES = [
  {
    key: 'agency',
    name: 'Agency',
    what: 'A government or funding body that oversees training programs, such as a state Department of Labor.',
    can: 'See results across every provider and organization under it: enrollments, completions, scores and readiness. Reports only; nothing is edited here.',
  },
  {
    key: 'provider',
    name: 'Provider',
    what: 'A training provider that builds and teaches courses. It reports to an agency.',
    can: 'Build courses, offer them to organizations, run cohorts and follow learners as they progress.',
  },
  {
    key: 'organization',
    name: 'Organization',
    what: 'A community partner, college or university that sends learners through courses. It reports to an agency.',
    can: 'Run cohorts on the courses a provider offers it, and follow its own learners.',
  },
] as const

const typeName = (kind: string): string =>
  kind === 'agency' ? 'Agency' : kind === 'provider' ? 'Provider' : 'Organization'

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`

/** The counts worth showing for this type of workspace, in reading order. */
function facts(w: Workspace): string | null {
  if (w.learners === undefined) return null // the counts have not arrived yet
  const learners = plural(w.learners ?? 0, 'learner')
  const cohorts = plural(w.cohorts ?? 0, 'cohort')
  if (w.kind === 'agency')
    return [
      plural(w.providers ?? 0, 'provider'),
      plural(w.organizations ?? 0, 'organization'),
      cohorts,
      learners,
    ].join(' · ')
  if (w.kind === 'provider')
    return [plural(w.courses ?? 0, 'course'), cohorts, learners].join(' · ')
  return [cohorts, learners].join(' · ')
}

function Card({ w }: { w: Workspace }) {
  const line = facts(w)
  return (
    <a
      className={`dash-ws-card dash-ws-${w.kind === 'agency' ? 'agency' : 'child'}`}
      href={workspaceHref(window.location.search, w.subdomain)}
    >
      <span className="dash-ws-icon">
        <TypeIcon kind={w.kind} />
      </span>
      <span className="dash-ws-body">
        <span className="dash-ws-type">{typeName(w.kind)}</span>
        <span className="dash-ws-name">{w.name}</span>
        {line && <span className="dash-ws-facts">{line}</span>}
      </span>
    </a>
  )
}

/** A short key to the three workspace types, beside the list. */
function TypesGuide() {
  return (
    <aside className="dash-types" aria-label="What the workspace types are">
      <h2>
        <InfoIcon /> Workspace types
      </h2>
      <p className="dash-types-tree">
        <strong>Agency</strong> oversees <strong>Providers</strong> and{' '}
        <strong>Organizations</strong>
      </p>
      {TYPES.map((t) => (
        <section key={t.key} className={`dash-type dash-type-${t.key}`}>
          <h3>
            <span className="dash-type-icon">
              <TypeIcon kind={t.key} />
            </span>
            {t.name}
          </h3>
          <p>{t.what}</p>
          <p className="dash-type-can">
            <strong>You can: </strong>
            {t.can}
          </p>
        </section>
      ))}
    </aside>
  )
}

/** No workspace picked yet: open the only one, or let the person choose. */
export function WorkspaceChooser() {
  const { workspaces, href } = useApp()
  const { data: summaries } = useLoad<LearnWorkspaceSummary[]>('/learn/workspaces/summary')
  if (!workspaces) return null
  if (workspaces.length === 1) {
    window.location.replace(workspaceHref(window.location.search, workspaces[0].subdomain))
    return null
  }
  if (workspaces.length === 0) {
    // Not staff anywhere: this is a learner, so their home is My learning.
    window.location.replace(href('/lms/learning'))
    return null
  }
  // The cards show at once; the counts join them when they arrive.
  const list: Workspace[] = summaries ?? workspaces
  const rank = (w: Workspace) => CHILD_ORDER.indexOf(w.kind)
  const byOrder = (a: Workspace, b: Workspace) => rank(a) - rank(b) || a.name.localeCompare(b.name)
  const agencies = list.filter((w) => w.kind === 'agency')
  const agencyIds = new Set(agencies.map((a) => a.id))
  // Anything whose agency is not in the list is shown on its own.
  const standalone = list.filter((w) => w.kind !== 'agency' && !agencyIds.has(w.parentId ?? ''))
  return (
    <DashboardShell>
      <h1 className="dash-h2">Choose a workspace</h1>
      <p className="dash-sub">
        Each agency is shown with the providers and organizations that report to it.
      </p>
      <div className="dash-chooser">
        <div className="dash-chooser-list">
          {agencies.map((a) => {
            const kids = list.filter((w) => w.parentId === a.id).sort(byOrder)
            return (
              <section key={a.id} className="dash-tree">
                <Card w={a} />
                {kids.length > 0 && (
                  <ul className="dash-tree-kids">
                    {kids.map((k) => (
                      <li key={k.id}>
                        <Card w={k} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
          {standalone.length > 0 && (
            <section className="dash-tree">
              <h2 className="dash-group-title">
                {agencies.length > 0 ? 'Other workspaces' : 'Your workspaces'}
              </h2>
              <ul className="dash-tree-kids dash-tree-flat">
                {standalone.sort(byOrder).map((w) => (
                  <li key={w.id}>
                    <Card w={w} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <TypesGuide />
      </div>
    </DashboardShell>
  )
}
