import './activity.css'

/**
 * #69 E, staff: daily per-learner and per-cohort activity with CSV export.
 * Mounted at /lms/activity, and at /lms/activity/:cohortId (the link on the cohort page) with `cohortId` set. Stub.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub: the props are used once the feature is built
export function ActivityPage(_props: { workspace: string; cohortId?: string }) {
  return (
    <>
      <h1 className="dash-h2">Activity</h1>
      <p className="dash-muted ac-placeholder">Learner activity will appear here.</p>
    </>
  )
}
