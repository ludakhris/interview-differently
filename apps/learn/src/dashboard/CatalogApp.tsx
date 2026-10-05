import type { AppContext } from '../brand'
import { AppProvider } from './app-context'
import { CatalogPage, OfferingPage } from './CatalogPages'
import { DashboardShell } from './DashboardShell'

/** Public catalog pages: /catalog and /catalog/:id. No sign-in; the workspace comes from the host or ?site=. */
export function CatalogApp({ context, pathname }: { context: AppContext; pathname: string }) {
  const offering = /^\/catalog\/([^/]+)\/?$/.exec(pathname)
  return (
    <AppProvider value={context}>
      <DashboardShell>
        {offering ? <OfferingPage courseId={decodeURIComponent(offering[1])} /> : <CatalogPage />}
      </DashboardShell>
    </AppProvider>
  )
}
