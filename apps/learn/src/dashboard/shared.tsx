import { useUser } from '@clerk/clerk-react'
import { ApiError } from './api'
import { Notice } from './DashboardShell'

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

export function useRole(): string | undefined {
  const { user } = useUser()
  return (user?.publicMetadata as { role?: string } | undefined)?.role
}
