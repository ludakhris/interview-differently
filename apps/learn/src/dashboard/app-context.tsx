import type { LearnerCohortCard, LearnWorkspace } from '@id/types'
import { createContext, useContext, type ReactNode } from 'react'
import { withContext, type AppContext } from '../brand'
import { useLoad } from './api'

const Context = createContext<AppContext>({
  tenant: null,
  fixedTenant: false,
  brand: 'learn',
  query: '',
})

interface WorkspacesState {
  /** null until loaded */
  workspaces: LearnWorkspace[] | null
  error: Error | null
  /** Whether the person is enrolled in anything; null until loaded (or if that could not be loaded). */
  hasLearning: boolean | null
}

const WorkspacesContext = createContext<WorkspacesState>({
  workspaces: null,
  error: null,
  hasLearning: null,
})

export function AppProvider({ value, children }: { value: AppContext; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>
}

/** Loads the workspaces the signed-in person may open, once, for everything below. */
export function WorkspacesProvider({ children }: { children: ReactNode }) {
  const { data, error } = useLoad<LearnWorkspace[]>('/learn/workspaces')
  // Decides whether the navigation offers learner tools. A failed load just leaves them to the workspaces rule.
  const learning = useLoad<LearnerCohortCard[]>('/learn/me/learning')
  const hasLearning = learning.data ? learning.data.length > 0 : learning.error ? false : null
  return (
    <WorkspacesContext.Provider value={{ workspaces: data, error, hasLearning }}>
      {children}
    </WorkspacesContext.Provider>
  )
}

/** Tenant, brand, workspaces, and `href()` to build links that keep ?site=/?brand=. */
export function useApp() {
  const ctx = useContext(Context)
  const { workspaces, error, hasLearning } = useContext(WorkspacesContext)
  const current = workspaces?.find((w) => w.subdomain === ctx.tenant) ?? null
  return {
    ...ctx,
    workspaces,
    workspacesError: error,
    hasLearning,
    current,
    href: (path: string) => withContext(ctx, path),
  }
}
