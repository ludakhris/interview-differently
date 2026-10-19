import { CONTACT_EMAIL } from '../contact'
import { SimpleShell } from './SimpleShell'

const UPDATED = 'October 19, 2026'

// Service providers that process learner data on our behalf. Keep in step with the code: a new provider that receives
// learner data is added here in the same change.
const PROVIDERS: [string, string][] = [
  ['Clerk', 'sign-in and accounts'],
  ['Google', 'sign-in, when you choose to sign in with your Google account'],
  ['Railway', 'hosting for our service and database, in the United States'],
  ['Vercel', 'hosting for our web pages, and anonymous page-view and speed statistics'],
  ['Cloudflare R2', 'storage for recordings, resumes and course media'],
  ['Anthropic', 'AI feedback, coaching and written lessons'],
  ['OpenAI', 'turning recorded answers into text (transcription)'],
  ['D-ID', 'the AI avatar video narrator'],
  ['Resend', 'notification emails'],
  ['Better Stack', 'service health checks and our public status page'],
]

export function PrivacyPage() {
  const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
  return (
    <SimpleShell>
      <h1 className="ld-h2">Privacy</h1>
      <p className="ld-sub">Last updated {UPDATED}.</p>
      <p className="ld-sub">
        Learn Differently and its subcomponents (as defined on our Products pages) help people build
        job-ready skills. Most people use them through a training program, college or agency (the
        “program”) that has set up their account. This page explains what we collect, why, who we
        share it with, and the choices you have.
      </p>

      <h2 className="ld-h3">Who is responsible</h2>
      <p className="ld-sub">
        When you use our products through a program, the program decides why your information is
        collected and we process it on its behalf, under our agreement with it. Questions about how
        your program uses your records are best sent to your program first; we will help it answer
        them. When you use Interview Differently on your own, we are responsible for your
        information.
      </p>

      <h2 className="ld-h3">What we collect</h2>
      <ul className="ld-sub">
        <li>
          Account details: your name, email address and the account ID from our sign-in provider. We
          never receive or store passwords.
        </li>
        <li>
          Your learning: courses, cohorts, progress, attendance, assessment and practice answers,
          scores, and the feedback you receive.
        </li>
        <li>
          Recordings: when you choose to record an answer, the audio or video and a text transcript
          of it. Your browser asks your permission before the camera or microphone turns on.
        </li>
        <li>
          Program records: information your program’s staff add, such as notes, support needs,
          resumes and job placement details.
        </li>
        <li>
          Technical data: the pages you use and when, kept to run and improve the service, and error
          records.
        </li>
      </ul>
      <p className="ld-sub">
        We do not ask for Social Security numbers, dates of birth, or bank or card numbers.
      </p>

      <h2 className="ld-h3">How we use it</h2>
      <p className="ld-sub">
        We use your information to run the products for you and your program: to show your plan and
        progress, give feedback on your answers, adapt your practice to what you still need, let
        your program’s staff support you, and keep the service secure and working. We do not sell
        your information or use it for advertising.
      </p>

      <h2 className="ld-h3">AI in our products</h2>
      <p className="ld-sub">
        Some feedback, coaching, lessons and the avatar narrator are produced with AI services. To
        do that, your answers and transcripts are sent to the AI provider listed below. Our AI
        providers do not use your information to train their models. AI-written content is labelled
        in the product, and staff review AI-written practice and lessons before they are reused for
        other learners.
      </p>

      <h2 className="ld-h3">Who we share it with</h2>
      <p className="ld-sub">
        Your program’s authorized staff can see your records, and an instructor sees only their own
        cohort. One program can never see another program’s records. We also use these service
        providers, who process data only to provide their service to us:
      </p>
      <ul className="ld-sub">
        {PROVIDERS.map(([name, use]) => (
          <li key={name}>
            <strong>{name}</strong>: {use}
          </li>
        ))}
      </ul>
      <p className="ld-sub">We may also disclose information when the law requires it.</p>

      <h2 className="ld-h3">Security</h2>
      <p className="ld-sub">
        Information travels over encrypted connections (HTTPS). Each program’s records are kept
        separate in our database, staff access to sensitive records such as notes and resumes is
        recorded in an audit trail, and recordings and resumes are kept in private storage.
      </p>

      <h2 className="ld-h3">How long we keep it</h2>
      <p className="ld-sub">
        We keep records for as long as the program that owns them uses our products, or until it
        asks us to delete them. Records from using Interview Differently on your own are kept until
        you ask us to delete them. Short-lived technical records, such as page-view and error
        records, are deleted automatically after 30 to 90 days.
      </p>

      <h2 className="ld-h3">Your choices</h2>
      <p className="ld-sub">
        If you use our products through a program, the program owns your records: ask your program
        to see, correct or delete them, and we will carry out its request. If someone contacts us
        directly about a program’s records, we pass the request to that program. If you use
        Interview Differently on your own, email {mail} to see, correct or delete your information.
        You can manage your email address and your active sessions from your account screen.
      </p>

      <h2 className="ld-h3">Changes and contact</h2>
      <p className="ld-sub">
        If we change this page in a way that matters, we will update the date above. Email {mail}{' '}
        with any question about your information.
      </p>
    </SimpleShell>
  )
}
