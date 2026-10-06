import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BriefingPage } from '@/pages/BriefingPage'
import { SimulationPage } from '@/pages/SimulationPage'
import { ImmersiveSimulationPage } from '@/pages/ImmersiveSimulationPage'
import { useScenario } from '@/hooks/useScenarios'
import { isVoiceInterview } from '@/lib/immersiveLti'
import { captureLtiSession } from '@/services/ltiSession'
import { fetchLtiToolSession } from '@/services/ltiService'
import { applyBrand, NO_BRAND, type AppliedBrand } from '@/lib/brand'
import { LtiBrandProvider } from '@/components/LtiBrandProvider'

/** How long the first screen waits for the brand before showing the default look. */
const BRAND_WAIT_MS = 3000

/**
 * /lti/play/:scenarioId — plays one simulation for a learner launched from
 * LearnDifferently. No Clerk session: the fragment token is the credential.
 */
export function LtiPlayPage() {
  const [token] = useState(() => captureLtiSession())
  const [brand, setBrand] = useState<AppliedBrand | null>(null)

  // The brand is re-validated here; a failed or slow call just means the default look.
  useEffect(() => {
    if (!token) {
      setBrand(NO_BRAND)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => !cancelled && setBrand((b) => b ?? NO_BRAND), BRAND_WAIT_MS)
    fetchLtiToolSession()
      .then((s) => !cancelled && setBrand((b) => b ?? applyBrand(s.brand)))
      .catch(() => !cancelled && setBrand(NO_BRAND))
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [token])

  // Nothing is drawn until the brand is known, so a tenant never sees a flash of the default look.
  if (!brand) return <div className="min-h-screen" />
  return (
    <LtiBrandProvider brand={brand}>
      <LtiPlay token={token} />
    </LtiBrandProvider>
  )
}

function LtiPlay({ token }: { token: string | null }) {
  const { scenarioId } = useParams<{ scenarioId: string }>()
  const [started, setStarted] = useState(false)
  const { scenario } = useScenario(token ? scenarioId : undefined)

  if (!token || !scenarioId) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-6">
        <p className="text-fg text-[15px] text-center max-w-md">
          This page opens from your course. Go back to your course and start again.
        </p>
      </div>
    )
  }

  if (started && !scenario) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
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
