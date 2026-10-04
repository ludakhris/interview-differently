import { CONTACT_EMAIL } from '../contact'
import { SimpleShell } from './SimpleShell'

// Stub until the full policy is written (data lifecycle and legal: #43).
export function PrivacyPage() {
  return (
    <SimpleShell>
      <h1 className="ld-h2">Privacy</h1>
      <p className="ld-sub">
        Our full privacy policy is being written and will be published on this page. Until then,
        email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with any question about how
        learner data is collected, used, or deleted.
      </p>
    </SimpleShell>
  )
}
