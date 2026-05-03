import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { SignIn, SignUp } from '@clerk/clerk-react'
import { LandingPage } from '@/pages/LandingPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { BriefingPage } from '@/pages/BriefingPage'
import { SimulationPage } from '@/pages/SimulationPage'
import { FeedbackPage } from '@/pages/FeedbackPage'
import { ImmersiveSimulationPage } from '@/pages/ImmersiveSimulationPage'
import { ImmersiveFeedbackPage } from '@/pages/ImmersiveFeedbackPage'
import { BuilderListPage } from '@/pages/BuilderListPage'
import { BuilderSetupPage } from '@/pages/BuilderSetupPage'
import { BuilderCanvasPage } from '@/pages/BuilderCanvasPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { WelcomePage } from '@/pages/WelcomePage'
import { AdminInstitutionsPage } from '@/pages/AdminInstitutionsPage'
import { AdminInstitutionAnalyticsPage } from '@/pages/AdminInstitutionAnalyticsPage'
import { AdminInstitutionEngagementPage } from '@/pages/AdminInstitutionEngagementPage'
import { AdminStudentDetailPage } from '@/pages/AdminStudentDetailPage'
import { RequestScenarioPage } from '@/pages/RequestScenarioPage'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AdminRoute } from '@/components/AdminRoute'
import { useUserSync } from '@/hooks/useUserSync'

function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const [searchParams] = useSearchParams()
  const redirectUrl = searchParams.get('redirect_url') ?? '/dashboard'

  // Route brand-new sign-ups through /welcome so they get the institution
  // self-join flow before landing on the dashboard. Pass `next` so the
  // welcome page can forward them to wherever they were originally headed.
  const signUpRedirect =
    redirectUrl === '/dashboard'
      ? '/welcome'
      : `/welcome?next=${encodeURIComponent(redirectUrl)}`

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      {mode === 'sign-in' ? (
        <SignIn routing="path" path="/sign-in" forceRedirectUrl={redirectUrl} />
      ) : (
        <SignUp routing="path" path="/sign-up" forceRedirectUrl={signUpRedirect} />
      )}
    </div>
  )
}

export default function App() {
  useUserSync()
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/scenario/:scenarioId/briefing" element={<BriefingPage />} />
      <Route path="/scenario/:scenarioId/play" element={<SimulationPage />} />
      <Route path="/request-scenario" element={<RequestScenarioPage />} />

      {/* Auth pages — /* catches Clerk's internal sub-routes */}
      <Route path="/sign-in/*" element={<AuthPage mode="sign-in" />} />
      <Route path="/sign-up/*" element={<AuthPage mode="sign-up" />} />

      {/* Protected */}
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/scenario/:scenarioId/feedback" element={<ProtectedRoute><FeedbackPage /></ProtectedRoute>} />
      <Route path="/scenario/:scenarioId/feedback/:resultId" element={<ProtectedRoute><FeedbackPage /></ProtectedRoute>} />
      <Route path="/scenario/:scenarioId/immersive" element={<ProtectedRoute><ImmersiveSimulationPage /></ProtectedRoute>} />
      <Route path="/scenario/:scenarioId/immersive/:sessionId/feedback" element={<ProtectedRoute><ImmersiveFeedbackPage /></ProtectedRoute>} />
      <Route path="/builder" element={<AdminRoute><BuilderListPage /></AdminRoute>} />
      <Route path="/builder/new" element={<AdminRoute><BuilderSetupPage /></AdminRoute>} />
      <Route path="/builder/:scenarioId" element={<AdminRoute><BuilderCanvasPage /></AdminRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/welcome" element={<ProtectedRoute><WelcomePage /></ProtectedRoute>} />
      {/* Legacy alias — old admin-only path now goes to the unified settings page */}
      <Route path="/admin/settings" element={<Navigate to="/settings" replace />} />
      <Route path="/admin/institutions" element={<AdminRoute><AdminInstitutionsPage /></AdminRoute>} />
      <Route path="/admin/institutions/:institutionId/analytics" element={<AdminRoute><AdminInstitutionAnalyticsPage /></AdminRoute>} />
      <Route path="/admin/institutions/:institutionId/engagement" element={<AdminRoute><AdminInstitutionEngagementPage /></AdminRoute>} />
      <Route path="/admin/institutions/:institutionId/students/:userId" element={<AdminRoute><AdminStudentDetailPage /></AdminRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
