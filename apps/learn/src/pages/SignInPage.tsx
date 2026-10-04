import { ClerkProvider, SignIn } from '@clerk/clerk-react'
import { SimpleShell } from './SimpleShell'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// LearnDifferently's own Clerk application (not Interview Differently's).
// Sign-in methods are set in Clerk: email code and Google, no passwords.
export function SignInPage() {
  if (!PUBLISHABLE_KEY || PUBLISHABLE_KEY === 'pk_test_replace_me') {
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
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/" telemetry={false}>
      <SimpleShell>
        <div className="ld-signin">
          <SignIn
            routing="path"
            path="/sign-in"
            fallbackRedirectUrl="/"
            appearance={{
              variables: {
                colorPrimary: '#0b1f2e',
                colorText: '#0b1f2e',
                fontFamily: "'Manrope', system-ui, sans-serif",
                borderRadius: '12px',
              },
            }}
          />
        </div>
      </SimpleShell>
    </ClerkProvider>
  )
}
