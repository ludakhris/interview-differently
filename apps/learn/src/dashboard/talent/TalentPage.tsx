import './talent.css'

/**
 * #69 B and C, staff: search, filter and export the participants of a provider.
 * Mounted at /lms/talent in a provider workspace only. `providerId` is the workspace's institution id. Stub.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub: the props are used once the feature is built
export function TalentPage(_props: { providerId: string; workspace: string }) {
  return (
    <>
      <h1 className="dash-h2">Talent</h1>
      <p className="dash-muted tl-placeholder">Participants will appear here.</p>
    </>
  )
}
