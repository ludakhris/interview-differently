import type {
  AssessmentDeliveryResults,
  CheckpointEvidence,
  CheckpointHistoryEntry,
  CohortAssessmentMonitor,
  CohortSqlMonitor,
} from './monitor-types'

/**
 * What the Simulator tells the LMS about a cohort's learners while they work. The LMS depends on
 * this port and never on Simulator code; the Simulator provides it (apps/api/src/simulator/simulator-feed).
 * Read-only, and the LMS decides who may ask: the Simulator trusts that check.
 */
export interface SimulatorFeed {
  assessmentMonitor(institutionId: string, cohortId: string): Promise<CohortAssessmentMonitor>
  sqlMonitor(cohortId: string): Promise<CohortSqlMonitor>
  /** Graded results for one delivery; refuses a delivery that was not made to this cohort. */
  assessmentResults(cohortId: string, deliveryId: string): Promise<AssessmentDeliveryResults>
  /**
   * Every answer and pass learners gave in the cohort's checkpoints (all of them, or these learners), oldest first:
   * the evidence the LMS turns into skills (GitHub issue #90).
   */
  checkpointEvidence(cohortId: string, userIds?: string[]): Promise<CheckpointEvidence[]>
  /** What one learner saw and did in the cohort's checkpoints, in order, for staff to replay their view. */
  checkpointHistory(cohortId: string, userId: string): Promise<CheckpointHistoryEntry[]>
}

export const SIMULATOR_FEED = Symbol('SIMULATOR_FEED')
