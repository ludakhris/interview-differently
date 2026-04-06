import { Routes, Route, Navigate } from 'react-router-dom'
import { LandingPage } from '@/pages/LandingPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { BriefingPage } from '@/pages/BriefingPage'
import { SimulationPage } from '@/pages/SimulationPage'
import { FeedbackPage } from '@/pages/FeedbackPage'
import { BuilderListPage } from '@/pages/BuilderListPage'
import { BuilderSetupPage } from '@/pages/BuilderSetupPage'
import { BuilderCanvasPage } from '@/pages/BuilderCanvasPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/scenario/:scenarioId/briefing" element={<BriefingPage />} />
      <Route path="/scenario/:scenarioId/play" element={<SimulationPage />} />
      <Route path="/scenario/:scenarioId/feedback" element={<FeedbackPage />} />
      <Route path="/builder" element={<BuilderListPage />} />
      <Route path="/builder/new" element={<BuilderSetupPage />} />
      <Route path="/builder/:scenarioId" element={<BuilderCanvasPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
