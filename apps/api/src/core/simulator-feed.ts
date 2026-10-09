import type {
  AssessmentDeliveryResults,
  CohortAssessmentMonitor,
  CohortSqlMonitor,
} from './monitor-types'

/**
 * What the Simulator tells the LMS about a cohort's learners while they work. The LMS depends on
 * this port and never on Simulator code; the Simulator provides it (apps/api/src/simulator-feed).
 * Read-only, and the LMS decides who may ask: the Simulator trusts that check.
 */
export interface SimulatorFeed {
  assessmentMonitor(institutionId: string, cohortId: string): Promise<CohortAssessmentMonitor>
  sqlMonitor(cohortId: string): Promise<CohortSqlMonitor>
  /** Graded results for one delivery; refuses a delivery that was not made to this cohort. */
  assessmentResults(cohortId: string, deliveryId: string): Promise<AssessmentDeliveryResults>
}

export const SIMULATOR_FEED = Symbol('SIMULATOR_FEED')
