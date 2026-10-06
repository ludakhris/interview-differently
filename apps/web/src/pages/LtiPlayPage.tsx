import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { BriefingPage } from '@/pages/BriefingPage'
import { SimulationPage } from '@/pages/SimulationPage'
import { ImmersiveSimulationPage } from '@/pages/ImmersiveSimulationPage'
import { useScenario } from '@/hooks/useScenarios'
import { isVoiceInterview } from '@/lib/immersiveLti'
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
  const { scenario } = useScenario(token ? scenarioId : undefined)

  if (!token || !scenarioId) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-6">
        <p className="text-[#f5f3ee] text-[15px] text-center max-w-md">
          This page opens from your course. Go back to your course and start again.
        </p>
      </div>
    )
  }

  if (started && !scenario) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-slate-mid text-[14px]">Loading...</p>
      </div>
    )
  }

  // a voice interview has its own player; every other scenario is the text simulation
  const voice = scenario ? isVoiceInterview(scenario) : false
  return started ? (
    voice ? (
      <ImmersiveSimulationPage ltiMode />
    ) : (
      <SimulationPage ltiMode />
    )
  ) : (
    <BriefingPage ltiMode onBegin={() => setStarted(true)} />
  )
}
