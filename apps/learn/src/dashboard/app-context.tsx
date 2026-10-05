import { createContext, useContext, type ReactNode } from 'react'
import { withContext, type AppContext } from '../brand'

const Context = createContext<AppContext>({
  tenant: null,
  fixedTenant: false,
  brand: 'learn',
  query: '',
})

export function AppProvider({ value, children }: { value: AppContext; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>
}

/** Tenant, brand, and `href()` to build links that keep the visitor's ?site=/?brand=. */
export function useApp() {
  const ctx = useContext(Context)
  return { ...ctx, href: (path: string) => withContext(ctx, path) }
}
