import { DashboardShell } from './DashboardShell'
import { useApp } from './app-context'
import { KIND_PLURAL, workspaceHref } from './WorkspaceSwitcher'

const KIND_ORDER = ['agency', 'provider', 'organization', 'academic']

/** No workspace picked yet: open the only one, or let the person choose. */
export function WorkspaceChooser() {
  const { workspaces, href } = useApp()
  if (!workspaces) return null
  if (workspaces.length === 1) {
    window.location.replace(workspaceHref(window.location.search, workspaces[0].subdomain))
    return null
  }
  if (workspaces.length === 0) {
    // Not staff anywhere: this is a learner, so their home is My learning.
    window.location.replace(href('/learning'))
    return null
  }
  const kinds = KIND_ORDER.filter((k) => workspaces.some((w) => w.kind === k))
  return (
    <DashboardShell>
      <h1 className="dash-h2">Choose a workspace</h1>
      <p className="dash-sub">Pick the agency, provider or institution you want to work in.</p>
      {kinds.map((k) => (
        <section key={k} className="dash-workspace-group">
          <h2 className="dash-group-title">{KIND_PLURAL[k]}</h2>
          <ul className="dash-workspaces">
            {workspaces
              .filter((w) => w.kind === k)
              .map((w) => (
                <li key={w.id}>
                  <a href={workspaceHref(window.location.search, w.subdomain)}>{w.name}</a>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </DashboardShell>
  )
}
