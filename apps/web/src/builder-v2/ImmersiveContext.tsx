// Immersive-mode context for the document editor (#24 Phase H). Decision
// blocks read the rendered-media asset for their node and report renders
// back; the editor exposes the audio script field only when this is set.

import { createContext, useContext } from 'react'
import type { ScenarioMediaAsset } from '@id/types'

export interface ImmersiveState {
  scenarioId: string
  assets: Record<string, ScenarioMediaAsset>
  onRendered: (asset: ScenarioMediaAsset) => void
}

const ImmersiveContext = createContext<ImmersiveState | null>(null)
export const ImmersiveProvider = ImmersiveContext.Provider
/** null when the scenario is text-mode. */
export const useImmersive = () => useContext(ImmersiveContext)
