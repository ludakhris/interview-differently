import './talent.css'

/**
 * #69 B and C, staff: one participant's profile, notes and support items.
 * Mounted at /lms/talent/:userId in a provider workspace only. Stub.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub: the props are used once the feature is built
export function TalentParticipantPage(_props: { providerId: string; userId: string }) {
  return (
    <>
      <h1 className="dash-h2">Participant</h1>
      <p className="dash-muted tl-placeholder">The participant record will appear here.</p>
    </>
  )
}
