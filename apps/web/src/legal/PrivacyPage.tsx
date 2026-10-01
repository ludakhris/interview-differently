import { Link } from 'react-router-dom'
import { LegalLayout } from './LegalLayout'
import { LEGAL } from './legalConfig'

const PROCESSORS: [string, string, string][] = [
  ['Clerk', 'Sign-in and account identity (name, email, credentials)', 'United States'],
  ['Anthropic', 'AI-generated feedback on your answers and session summaries', 'United States'],
  [
    'OpenAI',
    'Speech-to-text transcription of recordings you submit (if you record video, the video file is sent; only the speech is transcribed)',
    'United States',
  ],
  [
    'D-ID',
    'Rendering the interviewer avatar (receives interviewer script text, not your data)',
    'United States / EU',
  ],
  ['Cloudflare R2', 'Storage of your recordings and scenario media', 'Global (Cloudflare)'],
  ['Resend', 'Transactional email (e.g. scenario-request notifications)', 'United States'],
  [
    'Vercel',
    'Web hosting, privacy-friendly page analytics and performance metrics',
    'United States / global edge',
  ],
  ['Railway', 'API and database hosting', 'United States'],
]

export function PrivacyPage() {
  const { companyName, contactEmail } = LEGAL
  return (
    <LegalLayout title="Privacy Policy" version={LEGAL.versions.privacy}>
      <p>
        {companyName} (“we”) runs Interview Differently. This policy explains what personal data we
        collect, why, who sees it, how long we keep it, and your choices. It is part of our{' '}
        <Link to="/terms">Terms of Service</Link>.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li>
          <strong>Account data</strong> — name, email and sign-in credentials, held by our identity
          provider (Clerk); we keep a copy of your name and email.
        </li>
        <li>
          <strong>Your answers</strong> — choices and scores in simulations, written and multiple-
          choice assessment answers, and the SQL you run in the sandbox.
        </li>
        <li>
          <strong>Recordings</strong> — if you choose to answer aloud or on camera in an immersive
          session: the audio or video, and an automatic transcript. Recording is optional and only
          starts after you give explicit consent.
        </li>
        <li>
          <strong>AI-generated output</strong> — feedback and summaries produced about your answers.
        </li>
        <li>
          <strong>Membership data</strong> — the institutions and cohorts you join.
        </li>
        <li>
          <strong>Usage data</strong> — pages you visit (stored against your account for 90 days)
          and privacy-friendly aggregate analytics and performance metrics from Vercel.
        </li>
        <li>
          <strong>Requests you send us</strong> — scenario requests, including any contact details
          you type, plus your IP address and browser user-agent for spam protection.
        </li>
      </ul>
      <p>
        We do not knowingly collect special-category data (for example health or biometric data used
        to identify you). We do not use your recordings for facial or voice recognition, and we do
        not analyse your face or emotions.
      </p>

      <h2>2. Why we use it, and our legal basis (EU/UK)</h2>
      <ul>
        <li>
          <strong>Provide the Service</strong> — run simulations, score you, show your progress
          (contract).
        </li>
        <li>
          <strong>Recordings and AI analysis of them</strong> — only with your explicit consent,
          which you can withdraw at any time by deleting the recording or your account (consent).
        </li>
        <li>
          <strong>Security, abuse prevention, rate limiting, cost control</strong> (legitimate
          interests).
        </li>
        <li>
          <strong>Improve reliability and understand usage</strong> at an aggregate level
          (legitimate interests).
        </li>
        <li>
          <strong>Share results with your institution</strong> when you join its cohort (contract /
          legitimate interests of the institution as your school or programme).
        </li>
        <li>
          <strong>Comply with law</strong> (legal obligation).
        </li>
      </ul>

      <h2>3. Automated scoring</h2>
      <p>
        Scores and feedback are produced by rules and by AI models (Anthropic). They are meant to
        help you practise. We do not make decisions with legal or similarly significant effect about
        you solely by automated means. If an institution you belong to uses results in any decision
        about you, that institution is responsible for that use, and you should ask it how it works
        and how to contest a result. Where the law gives you a right to human review, email{' '}
        {contactEmail}.
      </p>

      <h2>4. Who sees your data</h2>
      <ul>
        <li>
          <strong>You</strong> — everything about you, and you can download it (Settings).
        </li>
        <li>
          <strong>Institution administrators</strong> — for cohorts you join: your name, email,
          activity, scores, assessment attempts and SQL sandbox queries. Not your recordings or
          transcripts.
        </li>
        <li>
          <strong>Our platform administrators</strong> — for support, safety and quality, including
          recordings and transcripts when necessary.
        </li>
        <li>
          <strong>Service providers</strong> (below) acting on our instructions.
        </li>
        <li>
          <strong>Authorities</strong> where legally required.
        </li>
      </ul>
      <p>We do not sell personal data or share it for cross-context behavioural advertising.</p>

      <h3>Service providers (sub-processors)</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px] border-collapse">
          <thead>
            <tr className="text-[#f5f3ee]">
              <th className="py-2 pr-4 border-b border-white/10">Provider</th>
              <th className="py-2 pr-4 border-b border-white/10">Purpose</th>
              <th className="py-2 border-b border-white/10">Location</th>
            </tr>
          </thead>
          <tbody>
            {PROCESSORS.map(([name, purpose, where]) => (
              <tr key={name}>
                <td className="py-2 pr-4 border-b border-white/5 align-top">{name}</td>
                <td className="py-2 pr-4 border-b border-white/5 align-top">{purpose}</td>
                <td className="py-2 border-b border-white/5 align-top">{where}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Anthropic and OpenAI process API data to provide the service to us; under their current
        commercial API terms they do not train their models on it. We will update this list before
        adding a provider that changes how your data is handled.
      </p>

      <h2>5. International transfers</h2>
      <p>
        We and our providers are largely based in the United States. If you are in the EU/UK, your
        data is transferred there under Standard Contractual Clauses or an equivalent mechanism (for
        example the EU–US Data Privacy Framework where the provider is certified).
      </p>

      <h2>6. How long we keep it</h2>
      <ul>
        <li>
          <strong>Recordings:</strong> deleted automatically after {LEGAL.recordingRetentionDays}{' '}
          days.
        </li>
        <li>
          <strong>SQL sandbox query log and page-view log:</strong> 90 days.
        </li>
        <li>
          <strong>Results, answers, transcripts, feedback, memberships and consent records:</strong>{' '}
          until you delete your account.
        </li>
        <li>
          <strong>Scenario requests:</strong> until we have processed them, then reviewed
          periodically; ask us to delete yours at any time.
        </li>
        <li>
          <strong>Backups:</strong> deleted data leaves provider backups within their normal cycle.
        </li>
      </ul>

      <h2>7. Your rights and choices</h2>
      <p>
        <strong>Download</strong> a copy of your data and <strong>delete your account</strong> and
        all associated data (including recordings) yourself in <Link to="/settings">Settings</Link>.
        Deletion also removes your institution-visible results and assessment attempts.
      </p>
      <p>
        Depending on where you live (for example under GDPR, UK GDPR or California law) you may also
        have the right to access, correct, restrict or object to processing, port your data,
        withdraw consent, and lodge a complaint with your data-protection authority. Email{' '}
        {contactEmail} and we will respond within one month (45 days for California requests). We
        will not discriminate against you for exercising these rights.
      </p>

      <h2>8. Cookies</h2>
      <p>
        We use only essential cookies and local storage for sign-in and session security (set by
        Clerk). Vercel Analytics and Speed Insights are cookieless. We do not use advertising or
        cross-site tracking cookies, so we do not show a cookie banner. If that changes, we will ask
        first.
      </p>

      <h2>9. Security</h2>
      <p>
        Data is encrypted in transit; recordings are stored in a private bucket and shown to you
        only through short-lived signed links; access is restricted by role. No system is perfectly
        secure; we will notify affected users and regulators of a breach as the law requires.
      </p>

      <h2>10. Children</h2>
      <p>
        The Service is not for anyone under 16. If you believe a child has given us personal data,
        contact us and we will delete it.
      </p>

      <h2>11. Changes and contact</h2>
      <p>
        We will post updates here and, for material changes, ask you to review them. Controller:{' '}
        {companyName}, {LEGAL.companyAddress}. Contact: {contactEmail}.
      </p>
    </LegalLayout>
  )
}
