import { useAuth } from '@clerk/clerk-react'
import { Navigate, useLocation } from 'react-router-dom'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth()
  const location = useLocation()

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-slate-mid text-[14px]">Loading...</p>
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <Navigate
        to={`/sign-in?redirect_url=${encodeURIComponent(location.pathname)}`}
        replace
      />
    )
  }

  return <>{children}</>
}
