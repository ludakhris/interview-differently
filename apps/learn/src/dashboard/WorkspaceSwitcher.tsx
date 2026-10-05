import { useApp } from './app-context'

export const KIND_LABEL: Record<string, string> = {
  agency: 'Agency',
  provider: 'Provider',
  organization: 'Organization',
  academic: 'Academic',
}

export const KIND_PLURAL: Record<string, string> = {
  agency: 'Agencies',
  provider: 'Providers',
  organization: 'Organizations',
  academic: 'Academic institutions',
}

/** Where to go when another workspace is picked: its dashboard, same skin choice. */
export function workspaceHref(search: string, slug: string): string {
  const params = new URLSearchParams(search)
  params.set('site', slug)
  return `/dashboard?${params.toString()}`
}

/** Workspace bar at the top of the page. Hidden on a tenant host, where the host fixes the workspace. */
export function WorkspaceSwitcher() {
  const { fixedTenant, tenant, workspaces: data } = useApp()
  if (fixedTenant || !data || data.length === 0) return null
  return (
    <div className="dash-workspace">
      <span className="dash-switcher-label" id="dash-workspace-label">
        Workspace
      </span>
      {data.length === 1 ? (
        <strong>{data[0].name}</strong>
      ) : (
        <select
          aria-labelledby="dash-workspace-label"
          value={tenant ?? ''}
          onChange={(e) =>
            window.location.assign(workspaceHref(window.location.search, e.target.value))
          }
        >
          {!tenant && <option value="">Choose…</option>}
          {data.map((w) => (
            <option key={w.id} value={w.subdomain}>
              {w.name}
              {w.kind === 'agency' ? '' : ` (${KIND_LABEL[w.kind] ?? w.kind})`}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
