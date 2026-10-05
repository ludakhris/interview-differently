import React, { type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { resolveContext } from './brand'
import { resolveSite } from './site'
import { AuthProvider } from './auth'
import { HomePage } from './pages/HomePage'
import { DelawarePage } from './pages/DelawarePage'
import { PrivacyPage } from './pages/PrivacyPage'
import { SignInPage } from './pages/SignInPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProductPage } from './pages/ProductPage'
import { DashboardApp } from './dashboard/DashboardApp'

const { hostname, pathname, search } = window.location
const site = resolveSite(hostname, search)

// Keep in sync with the rewrites in vercel.json; any other path is served 404.html.
function page(): ReactNode {
  if (pathname === '/privacy') return <PrivacyPage />
  if (pathname === '/sign-in' || pathname.startsWith('/sign-in/')) return <SignInPage />
  if (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/') ||
    pathname === '/courses' ||
    pathname.startsWith('/courses/')
  ) {
    // Same page on delaware.learndifferently.tech and on learndifferently.tech?site=delaware;
    // only the skin differs (see brand.ts).
    return (
      <DashboardApp
        context={resolveContext(hostname, search)}
        pathname={pathname}
        search={search}
      />
    )
  }
  const product = /^\/products\/([a-z-]+)\/?$/.exec(pathname)
  if (product) return <ProductPage id={product[1]} />
  if (pathname !== '/') return <NotFoundPage />
  if (site === 'delaware') {
    document.title = 'Career Readiness Tool — Delaware Department of Labor (demonstration)'
    return <DelawarePage />
  }
  return <HomePage />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>{page()}</AuthProvider>
  </React.StrictMode>
)
