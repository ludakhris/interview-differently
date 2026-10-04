import React, { type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { resolveSite } from './site'
import { HomePage } from './pages/HomePage'
import { DelawarePage } from './pages/DelawarePage'
import { PrivacyPage } from './pages/PrivacyPage'
import { SignInPage } from './pages/SignInPage'

const { hostname, pathname, search } = window.location
const site = resolveSite(hostname, search)

function page(): ReactNode {
  if (pathname === '/privacy') return <PrivacyPage />
  if (pathname === '/sign-in' || pathname.startsWith('/sign-in/')) return <SignInPage />
  if (site === 'delaware') {
    document.title = 'Career Readiness Tool — Delaware Department of Labor (demonstration)'
    return <DelawarePage />
  }
  return <HomePage />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{page()}</React.StrictMode>
)
