import { createContext, useContext } from 'react'
import type { PlayGrader } from '@/services/ltiPlayService'

/**
 * The server-side grader of a launched (LTI) text simulation. Present only inside one; every other
 * play (the learner's own practice on this site) grades in the browser as before.
 */
const PlayGraderContext = createContext<PlayGrader | null>(null)

export const PlayGraderProvider = PlayGraderContext.Provider
export const usePlayGrader = (): PlayGrader | null => useContext(PlayGraderContext)
