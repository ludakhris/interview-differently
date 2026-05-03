import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth, useUser } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { MembershipsCard } from '@/components/MembershipsCard'
import { fetchMyMemberships } from '@/services/meService'

/**
 * Post-signup landing page. Offers institution self-join (by email-domain
 * match or cohort key) before sending the user to the dashboard.
 *
 * Short-circuits to the dashboard (or the `?next=` destination) if the
 * user already has a membership — so admin testers and anyone who lands
 * here by accident don't get stuck on a welcome flow they don't need.
 */
export function WelcomePage() {
  const navigate = useNavigate()
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { user } = useUser()
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next') ?? '/dashboard'
  const [checking, setChecking] = useState(true)

  // If they already have a membership, skip past the welcome flow.
  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      navigate('/sign-in')
      return
    }
    fetchMyMemberships(getToken)
      .then((m) => {
        if (m.length > 0) navigate(next, { replace: true })
        else setChecking(false)
      })
      .catch(() => setChecking(false))
  }, [isLoaded, isSignedIn, getToken, navigate, next])

  if (!isLoaded || checking) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-slate-mid text-[14px]">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav />
      <div className="max-w-xl mx-auto px-6 py-12 animate-fade-in">
        <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-2">Welcome</p>
        <h1 className="font-display font-extrabold text-[28px] text-[#f5f3ee] tracking-tight mb-3">
          {user?.firstName ? `Hi ${user.firstName} —` : "Glad you're here —"} let's get you set up
        </h1>
        <p className="text-[14px] text-slate-light leading-relaxed mb-8">
          If your school or organisation uses InterviewDifferently, joining now means your scores feed
          into their cohort analytics. You can change this later in Settings.
        </p>

        <div className="bg-[#111111] rounded-xl border border-white/10 p-6">
          <MembershipsCard
            variant="welcome"
            onJoined={() => navigate(next, { replace: true })}
            onSkip={() => navigate(next, { replace: true })}
          />
        </div>
      </div>
    </div>
  )
}
