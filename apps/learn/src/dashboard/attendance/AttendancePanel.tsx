import './attendance.css'

/**
 * #69 D: sessions and whole-cohort attendance marking. CohortPage mounts it only when the cohort's
 * delivery is 'live' or 'hybrid'. Stub.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub: the props are used once the feature is built
export function AttendancePanel(_props: { cohortId: string }) {
  return (
    <section className="dash-section" aria-labelledby="h-attendance">
      <h2 className="dash-h2" id="h-attendance">
        Attendance
      </h2>
      <p className="dash-muted at-placeholder">Sessions and attendance will appear here.</p>
    </section>
  )
}
