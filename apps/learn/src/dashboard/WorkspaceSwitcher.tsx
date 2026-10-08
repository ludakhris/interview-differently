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
  return `/lms/dashboard?${params.toString()}`
}

/**
 * Where the select goes: stay on the same section (Talent, Courses, Cohorts, Activity) when the
 * new workspace has it, otherwise its dashboard. Detail pages belong to one workspace, so they fall back to the section list.
 */
export function switchHref(
  pathname: string,
  search: string,
  target: { subdomain: string; kind: string }
): string {
  const section = /^\/lms\/(talent|courses|cohorts|activity)(?:\/|$)/.exec(pathname)
  if (!section || (section[1] === 'talent' && target.kind !== 'provider')) {
    return workspaceHref(search, target.subdomain)
  }
  const params = new URLSearchParams(search)
  params.set('site', target.subdomain)
  return `/lms/${section[1]}?${params.toString()}`
}

/** The workspaces with each one under the agency or organization it reports to, and its depth for indenting. */
export function workspaceTree<T extends { id: string; parentId: string | null }>(
  list: T[]
): { w: T; depth: number }[] {
  const ids = new Set(list.map((w) => w.id))
  const out: { w: T; depth: number }[] = []
  const add = (w: T, depth: number) => {
    out.push({ w, depth })
    for (const c of list.filter((x) => x.parentId === w.id)) add(c, depth + 1)
  }
  // A workspace whose parent is not in the list (not visible to this person) stands at the top.
  for (const w of list.filter((x) => !x.parentId || !ids.has(x.parentId))) add(w, 0)
  return out
}

/** Workspace bar at the top of the page. Hidden on a tenant host, where the host fixes the workspace. */
export function WorkspaceSwitcher() {
  const { fixedTenant, tenant, workspaces: data } = useApp()
  // The learner pages belong to the person, and the admin tools to the platform: neither is in a workspace.
  const { pathname } = window.location
  if (pathname.startsWith('/lms/learning') || pathname.startsWith('/lms/admin')) return null
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
          onChange={(e) => {
            const target = data.find((w) => w.subdomain === e.target.value)
            if (target) {
              window.location.assign(switchHref(pathname, window.location.search, target))
            }
          }}
        >
          {!tenant && <option value="">Choose…</option>}
          {workspaceTree(data).map(({ w, depth }) => (
            <option key={w.id} value={w.subdomain}>
              {'\u2003'.repeat(depth * 2)}
              {w.featuredDemo ? '⭐ ' : ''}
              {w.name}
              {w.kind === 'agency' ? '' : ` (${KIND_LABEL[w.kind] ?? w.kind})`}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
