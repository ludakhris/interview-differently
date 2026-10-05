import { SignIn } from '@clerk/clerk-react'
import { authConfigured } from '../auth'
import { SimpleShell } from './SimpleShell'

export function SignInPage() {
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
  return (
    <SimpleShell>
      <div className="ld-signin">
        <SignIn routing="path" path="/sign-in" fallbackRedirectUrl="/" />
      </div>
    </SimpleShell>
  )
}
