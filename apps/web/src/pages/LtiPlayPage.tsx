import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { BriefingPage } from '@/pages/BriefingPage'
import { SimulationPage } from '@/pages/SimulationPage'
import { captureLtiSession } from '@/services/ltiSession'

/**
 * /lti/play/:scenarioId — plays one simulation for a learner launched from
 * LearnDifferently. No Clerk session: the fragment token is the credential.
 */
export function LtiPlayPage() {
  const { scenarioId } = useParams<{ scenarioId: string }>()
  // Runs before any child renders so their first fetches already carry the token.
  const [token] = useState(() => captureLtiSession())
  const [started, setStarted] = useState(false)

  if (!token || !scenarioId) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-6">
        <p className="text-[#f5f3ee] text-[15px] text-center max-w-md">
          This page opens from your course. Go back to your course and start again.
        </p>
      </div>
    )
  }

  return started ? (
    <SimulationPage ltiMode />
  ) : (
    <BriefingPage ltiMode onBegin={() => setStarted(true)} />
  )
}
