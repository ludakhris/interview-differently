import type { LearnWorkspace } from '@id/types'
import { useLoad } from './api'
import { DashboardShell, Notice } from './DashboardShell'
import { errorNotice } from './shared'
import { workspaceHref } from './WorkspaceSwitcher'

/** /dashboard with no workspace picked: open the only one, or let the person choose. */
export function WorkspaceChooser() {
  const { data, error, loading } = useLoad<LearnWorkspace[]>('/learn/workspaces')
  if (error) return <DashboardShell>{errorNotice(error)}</DashboardShell>
  if (loading || !data)
    return (
      <DashboardShell>
        <p className="dash-loading">Loading workspaces…</p>
      </DashboardShell>
    )
  if (data.length === 1) {
    window.location.replace(workspaceHref(window.location.search, data[0].subdomain))
    return null
  }
  if (data.length === 0) {
    return (
      <DashboardShell>
        <Notice title="No workspaces yet">
          Your account is not connected to an agency or institution. Ask an administrator to add
          you.
        </Notice>
      </DashboardShell>
    )
  }
  return (
    <DashboardShell>
      <h1 className="dash-h2">Choose a workspace</h1>
      <p className="dash-sub">Pick the agency or institution whose results you want to see.</p>
      <ul className="dash-workspaces">
        {data.map((w) => (
          <li key={w.id}>
            <a href={workspaceHref(window.location.search, w.subdomain)}>{w.name}</a>
          </li>
        ))}
      </ul>
    </DashboardShell>
  )
}
