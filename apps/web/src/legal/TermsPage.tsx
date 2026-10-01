import { Link } from 'react-router-dom'
import { LegalLayout } from './LegalLayout'
import { LEGAL } from './legalConfig'

export function TermsPage() {
  const { companyName, contactEmail, governingLaw } = LEGAL
  return (
    <LegalLayout title="Terms of Service" version={LEGAL.versions.terms}>
      <p>
        These Terms govern your use of Interview Differently (the “Service”), operated by{' '}
        {companyName} (“we”, “us”). By creating an account or using the Service you agree to them
        and to our <Link to="/privacy">Privacy Policy</Link>. If you do not agree, do not use the
        Service.
      </p>

      <h2>1. What the Service is</h2>
      <p>
        Interview Differently provides interview-practice simulations, SQL sandboxes and
        assessments, and AI-generated feedback. It is a learning and practice tool.{' '}
        <strong>
          Scores and feedback are automated, can be wrong, and are not employment, hiring, academic
          or professional advice.
        </strong>{' '}
        No one should rely on them as the sole basis for a decision about you, and we do not use
        them to make automated decisions with legal or similarly significant effect. If your school
        or organisation uses the Service, it decides how it uses your results — ask them.
      </p>

      <h2>2. Eligibility and accounts</h2>
      <p>
        You must be at least 16 years old (or the age of digital consent where you live, if higher)
        and able to form a binding contract. You are responsible for your account credentials and
        for activity under your account. Give us accurate information and tell us promptly if you
        suspect unauthorised access.
      </p>

      <h2>3. Schools, cohorts and administrators</h2>
      <p>
        If you join an institution or cohort (by invite link, join key or matching email domain),
        that institution’s administrators can see your name, email, activity, scores, assessment
        attempts and SQL sandbox queries for that cohort, as described in the Privacy Policy. Your
        recordings and transcripts are visible to you and to our platform administrators, not to
        institution administrators. You can leave a cohort at any time in Settings.
      </p>

      <h2>4. Your content</h2>
      <p>
        “Your Content” means what you submit: written answers, SQL queries, audio or video
        recordings and their transcripts, and scenario requests.
      </p>
      <ul>
        <li>
          <strong>You own Your Content.</strong> We do not claim ownership of it.
        </li>
        <li>
          You give us a worldwide, non-exclusive, royalty-free licence to host, process, transcribe,
          analyse, display and back up Your Content, and to send it to our service providers, solely
          to operate the Service for you (including generating your feedback and letting your
          institution see what Section 3 describes).
        </li>
        <li>
          We do not sell Your Content, and we do not use it to train AI models. Our AI providers
          process it on our behalf under their API terms.
        </li>
        <li>
          Do not submit content you do not have the right to share, other people’s personal data,
          confidential employer information, or anything unlawful, harassing or infringing. We may
          remove content that breaks these Terms.
        </li>
        <li>
          Recordings are deleted after {LEGAL.recordingRetentionDays} days; other data is kept until
          you delete your account (see the Privacy Policy).
        </li>
      </ul>

      <h2>5. Our content</h2>
      <p>
        The Service, its scenarios, case material, questions, datasets, scoring rubrics, software
        and branding belong to us or our licensors and are protected by law. You get a personal,
        non-transferable, revocable licence to use them through the Service for your own practice
        and learning. You may not copy, scrape, republish, resell, reverse-engineer, or use them (or
        the AI feedback) to build a competing product or to train AI models.
      </p>

      <h2>6. Acceptable use</h2>
      <p>Do not:</p>
      <ul>
        <li>attempt to access accounts, data or systems you are not authorised to;</li>
        <li>probe, overload, or bypass rate limits or security controls of the Service;</li>
        <li>use automation, bots or scripts to submit answers, run queries or drive the avatar;</li>
        <li>use the SQL sandbox or assessments to attack, mine, or harm any system;</li>
        <li>impersonate another person or misrepresent your identity or affiliation;</li>
        <li>cheat in an assessment your institution has told you to complete unaided.</li>
      </ul>

      <h2>7. Third-party services</h2>
      <p>
        The Service relies on third parties (for example for sign-in, AI processing, speech-to-text,
        avatar video, storage and hosting) listed in the Privacy Policy. Their availability and
        terms are outside our control.
      </p>

      <h2>8. Suspension and termination</h2>
      <p>
        You can delete your account at any time in Settings. We may suspend or end access if you
        break these Terms or if needed to protect the Service or other users. Sections that by
        nature should survive (ownership, disclaimers, liability, dispute resolution) do.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        The Service is provided “as is” and “as available”. To the fullest extent permitted by law
        we disclaim all warranties, including merchantability, fitness for a particular purpose and
        non-infringement, and we do not promise that the Service will be uninterrupted or
        error-free, or that using it will improve your interview or exam results.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, we are not liable for indirect, incidental, special,
        consequential or punitive damages, or for lost profits, opportunities or data, arising from
        your use of the Service. Our total liability for any claim is limited to the greater of the
        amount you paid us in the 12 months before the claim or US$100. Nothing in these Terms
        limits liability that cannot be limited by law, including for fraud or for death or personal
        injury caused by negligence, or your statutory consumer rights.
      </p>

      <h2>11. Indemnity</h2>
      <p>
        You will defend and indemnify us against third-party claims arising from Your Content or
        your breach of these Terms, to the extent permitted by law. This does not apply to consumers
        where the law forbids it.
      </p>

      <h2>12. Disputes and arbitration</h2>
      <p>
        <strong>Please read this section — it affects your legal rights.</strong> This section
        applies to users in the United States; if you use the Service from the EU, UK or another
        place where mandatory law gives you the right to bring claims in your local courts, that
        right is not removed.
      </p>
      <ul>
        <li>
          <strong>Informal resolution first.</strong> Email {contactEmail} describing the dispute;
          we will try to resolve it within 60 days.
        </li>
        <li>
          <strong>Binding individual arbitration.</strong> If it is not resolved, any dispute
          arising out of or relating to these Terms or the Service will be resolved by binding
          arbitration administered by the American Arbitration Association under its Consumer
          Arbitration Rules, before a single arbitrator, in your home county or by video. Judgment
          on the award may be entered in any court with jurisdiction.
        </li>
        <li>
          <strong>No class actions.</strong> Claims may be brought only in your individual capacity,
          not as a plaintiff or class member in any class, collective or representative action.
        </li>
        <li>
          <strong>Exceptions.</strong> Either side may bring an individual claim in small-claims
          court, and either side may seek injunctive relief in court for infringement or misuse of
          intellectual property.
        </li>
        <li>
          <strong>Opt out.</strong> You may opt out of arbitration and the class waiver within 30
          days of first accepting these Terms by emailing {contactEmail} with your name and the
          email on your account.
        </li>
      </ul>
      <p>
        These Terms are governed by the laws of {governingLaw}, without regard to conflict-of-law
        rules, except where your local mandatory law applies.
      </p>

      <h2>13. Changes</h2>
      <p>
        We may update these Terms. For material changes we will ask you to accept the new version
        before you continue; continuing to use the Service after a non-material change means you
        accept it.
      </p>

      <h2>14. Contact</h2>
      <p>
        {companyName}, {LEGAL.companyAddress}. Email: {contactEmail}.
      </p>
    </LegalLayout>
  )
}
