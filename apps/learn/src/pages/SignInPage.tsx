import { SignIn } from '@clerk/clerk-react'
import { authConfigured } from '../auth'
import { resolveContext, withContext } from '../brand'
import { AppProvider } from '../dashboard/app-context'
import { DashboardShell } from '../dashboard/DashboardShell'
import { SimpleShell } from './SimpleShell'

// The Delaware tenant's sign-in wears the Delaware design system: square corners,
// navy, Open Sans. Everyone else gets the LearnDifferently sign-in.
const DELAWARE_APPEARANCE = {
  variables: {
    colorPrimary: '#05405c',
    colorText: '#353535',
    fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
    borderRadius: '0px',
  },
}

const NOTE =
  'Use the Google account or email you already have. There is no new password to remember.'

export function SignInPage() {
  const ctx = resolveContext(window.location.hostname, window.location.search)
  if (!authConfigured) {
    return (
      <SimpleShell>
        <h1 className="ld-h2">Sign in</h1>
        <p className="ld-sub">
          Sign-in is not configured: set VITE_CLERK_PUBLISHABLE_KEY for this deployment.
        </p>
      </SimpleShell>
    )
  }
  const landing = withContext(ctx, '/dashboard')
  if (ctx.brand === 'delaware') {
    return (
      <AppProvider value={ctx}>
        <DashboardShell>
          <div className="dash-signin">
            <h1 className="dash-h2">Welcome</h1>
            <p className="dash-sub">{NOTE}</p>
            <SignIn
              routing="path"
              path="/sign-in"
              fallbackRedirectUrl={landing}
              appearance={DELAWARE_APPEARANCE}
            />
          </div>
        </DashboardShell>
      </AppProvider>
    )
  }
  return (
    <SimpleShell>
      <div className="ld-signin">
        <SignIn routing="path" path="/sign-in" fallbackRedirectUrl={landing} />
      </div>
      <p className="ld-small ld-faint ld-signin-note">{NOTE}</p>
    </SimpleShell>
  )
}
