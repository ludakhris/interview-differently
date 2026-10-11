import { useUser } from '@clerk/clerk-react'
import { ApiError } from './api'
import { useApp } from './app-context'
import { Notice } from './DashboardShell'
import { overallRole, roleIn } from './roleAccess'

export function errorNotice(error: Error) {
  if (error instanceof ApiError && error.status === 403) {
    return (
      <Notice title="Your account does not have access">
        You can open the workspaces your account has been added to. Ask an administrator of this
        workspace to give you access.
      </Notice>
    )
  }
  if (error instanceof ApiError && error.status === 404) {
    return <Notice title="Not found">That record could not be found for this agency.</Notice>
  }
  return (
    <Notice title="Could not load the report">
      Something went wrong reaching the reporting service. Try again in a moment.
    </Notice>
  )
}

/**
 * What the signed-in person is across the app: 'system-admin' for a platform administrator (the
 * only role kept on the account), otherwise the highest role they hold in any workspace. The
 * workspace list is loaded once and shared, so this costs no request.
 */
export function useRole(): string | undefined {
  const { user } = useUser()
  const { workspaces } = useApp()
  const accountRole = (user?.publicMetadata as { role?: string } | undefined)?.role
  return overallRole(accountRole, workspaces)
}

/** The person's role in one workspace (by subdomain), for pages about that workspace. */
export function useWorkspaceRole(subdomain: string | null | undefined): string | undefined {
  const { workspaces } = useApp()
  return roleIn(workspaces, subdomain)
}
