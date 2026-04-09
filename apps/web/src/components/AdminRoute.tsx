import { useAuth, useUser } from '@clerk/clerk-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const location = useLocation()
  const navigate = useNavigate()

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

  const isAdmin = user?.publicMetadata?.role === 'admin'

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <p className="font-display font-bold text-[18px] text-[#f5f3ee] mb-2">Access restricted</p>
          <p className="text-[14px] text-slate-mid mb-6">The builder is only available to administrators.</p>
          <button
            onClick={() => navigate('/')}
            className="text-[13px] font-semibold text-green-light hover:text-green transition-colors"
          >
            ← Back to home
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
