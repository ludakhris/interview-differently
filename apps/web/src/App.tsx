import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { SignIn, SignUp } from '@clerk/clerk-react'
import { LandingPage } from '@/pages/LandingPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { BriefingPage } from '@/pages/BriefingPage'
import { SimulationPage } from '@/pages/SimulationPage'
import { FeedbackPage } from '@/pages/FeedbackPage'
import { BuilderListPage } from '@/pages/BuilderListPage'
import { BuilderSetupPage } from '@/pages/BuilderSetupPage'
import { BuilderCanvasPage } from '@/pages/BuilderCanvasPage'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AdminRoute } from '@/components/AdminRoute'

function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const [searchParams] = useSearchParams()
  const redirectUrl = searchParams.get('redirect_url') ?? '/dashboard'

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      {mode === 'sign-in' ? (
        <SignIn routing="path" path="/sign-in" forceRedirectUrl={redirectUrl} />
      ) : (
        <SignUp routing="path" path="/sign-up" forceRedirectUrl={redirectUrl} />
      )}
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/scenario/:scenarioId/briefing" element={<BriefingPage />} />
      <Route path="/scenario/:scenarioId/play" element={<SimulationPage />} />

      {/* Auth pages — /* catches Clerk's internal sub-routes */}
      <Route path="/sign-in/*" element={<AuthPage mode="sign-in" />} />
      <Route path="/sign-up/*" element={<AuthPage mode="sign-up" />} />

      {/* Protected */}
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/scenario/:scenarioId/feedback" element={<ProtectedRoute><FeedbackPage /></ProtectedRoute>} />
      <Route path="/builder" element={<AdminRoute><BuilderListPage /></AdminRoute>} />
      <Route path="/builder/new" element={<AdminRoute><BuilderSetupPage /></AdminRoute>} />
      <Route path="/builder/:scenarioId" element={<AdminRoute><BuilderCanvasPage /></AdminRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
