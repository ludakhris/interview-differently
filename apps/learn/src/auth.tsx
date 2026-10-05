import { ClerkProvider, useClerk, useUser } from '@clerk/clerk-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

export const authConfigured = Boolean(PUBLISHABLE_KEY) && PUBLISHABLE_KEY !== 'pk_test_replace_me'

// LearnDifferently's own Clerk application (not Interview Differently's).
// Sign-in methods are set in Clerk: email code and Google, no passwords.
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!authConfigured) return <>{children}</>
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY!}
      afterSignOutUrl="/"
      telemetry={false}
      appearance={{
        variables: {
          colorPrimary: '#0b1f2e',
          colorText: '#0b1f2e',
          fontFamily: "'Manrope', system-ui, sans-serif",
          borderRadius: '12px',
        },
      }}
    >
      {children}
    </ClerkProvider>
  )
}

/** Header account slot: `signedOut` for visitors, the account menu once signed in. */
export function AccountMenu({ signedOut }: { signedOut: ReactNode }) {
  if (!authConfigured) return <>{signedOut}</>
  return <ClerkAccountMenu signedOut={signedOut} />
}

function ClerkAccountMenu({ signedOut }: { signedOut: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser()
  // Most visitors are signed out, so show their links while Clerk loads.
  if (!isLoaded || !isSignedIn) return <>{signedOut}</>
  const email = user.primaryEmailAddress?.emailAddress ?? ''
  return (
    <SignedInMenu
      firstName={user.firstName ?? email}
      fullName={user.fullName ?? email}
      email={email}
      imageUrl={user.hasImage ? user.imageUrl : undefined}
    />
  )
}

function SignedInMenu(props: {
  firstName: string
  fullName: string
  email: string
  imageUrl?: string
}) {
  const { openUserProfile, signOut } = useClerk()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="ld-account" ref={ref}>
      <button
        type="button"
        className="ld-account-trigger"
        aria-expanded={open}
        aria-controls="ld-account-menu"
        onClick={() => setOpen(!open)}
      >
        {props.imageUrl ? (
          <img className="ld-account-avatar" src={props.imageUrl} alt="" />
        ) : (
          <span className="ld-account-avatar" aria-hidden="true">
            {props.firstName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="ld-account-name">{props.firstName}</span>
        <span className="ld-account-caret" aria-hidden="true" />
      </button>
      {open && (
        <div id="ld-account-menu" className="ld-account-menu">
          <div className="ld-account-who">
            <strong>{props.fullName}</strong>
            <span>{props.email}</span>
          </div>
          {/* App links (dashboard, courses, reports) go in this list as they are built. */}
          <ul>
            <li>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  openUserProfile()
                }}
              >
                Profile
              </button>
            </li>
            <li>
              <button type="button" onClick={() => signOut({ redirectUrl: '/' })}>
                Sign out
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}
