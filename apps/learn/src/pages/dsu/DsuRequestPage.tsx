import { useUser } from '@clerk/react'
import type { CatalogIntake, CatalogOffering, LearnerJoinPending } from '@id/types'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { authConfigured } from '../../auth'
import { ApiError, useApiSend } from '../../dashboard/api'
import { usePublic } from '../../public-api'
import { DSU, EDUCATION_OPTIONS, FUNDING_OPTIONS } from './dsuContent'

type Href = (path: string) => string

interface Props {
  tenant: string
  courseId: string
  href: Href
}

/**
 * Request enrollment in one program: a short intake. On the demonstration site anyone can fill it in,
 * but a signed-out visitor's answers are never sent (shown as a demonstration only). Signed in, the
 * request is really sent and lands with staff, so the whole flow can be shown end to end.
 */
export function DsuRequestPage(props: Props) {
  const { data: c, error } = usePublic<CatalogOffering>(
    `/learn/public/${props.tenant}/courses/${encodeURIComponent(props.courseId)}`
  )
  if (error)
    return (
      <p className="dsu-error">
        That program could not be found. <a href={props.href('/')}>See all programs</a>
      </p>
    )
  if (!c) return <p className="dsu-muted">Loading…</p>
  return (
    <div className="dsu-narrow">
      <h1 className="dsu-h1">Request enrollment</h1>
      <p className="dsu-lead">
        <strong>{c.title}</strong>
      </p>
      {!c.acceptsRequests ? (
        <p>
          This program is not taking requests online right now. Call {DSU.phone} or email{' '}
          <a href={`mailto:${DSU.email}`}>{DSU.email}</a>.
        </p>
      ) : authConfigured ? (
        <WithSignIn {...props} title={c.title} />
      ) : (
        <IntakeForm {...props} title={c.title} send={null} who={null} />
      )}
    </div>
  )
}

function WithSignIn(props: Props & { title: string }) {
  const { isLoaded, isSignedIn, user } = useUser()
  if (!isLoaded) return <p className="dsu-muted">Loading…</p>
  if (!isSignedIn) return <IntakeForm {...props} send={null} who={null} />
  return (
    <LiveIntake
      {...props}
      who={user.fullName ?? user.primaryEmailAddress?.emailAddress ?? 'you'}
      email={user.primaryEmailAddress?.emailAddress ?? null}
    />
  )
}

/** Signed in: the request is really sent (useApiSend needs the Clerk session). */
function LiveIntake(props: Props & { title: string; who: string; email: string | null }) {
  const api = useApiSend()
  const send = (form: unknown) =>
    api<LearnerJoinPending>(
      'POST',
      `/learn/me/catalog/${encodeURIComponent(props.tenant)}/courses/${encodeURIComponent(props.courseId)}/request`,
      form
    )
  return <IntakeForm {...props} send={send} />
}

type Field = 'phone' | 'education' | 'employment' | 'funding'

const REQUIRED: Record<Field, string> = {
  phone: 'Enter a phone number.',
  education: 'Choose your highest education.',
  employment: 'Say whether you are working now.',
  funding: 'Choose how you plan to pay.',
}

function IntakeForm({
  href,
  title,
  who,
  email,
  send,
}: Props & {
  title: string
  who: string | null
  email?: string | null
  /** null: a demonstration, nothing is sent. */
  send: ((form: unknown) => Promise<LearnerJoinPending>) | null
}) {
  const [form, setForm] = useState({
    phone: '',
    education: '',
    employment: '' as CatalogIntake['employment'] | '',
    employer: '',
    funding: '',
    language: '',
    reason: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ReactNode>(null)
  const [missing, setMissing] = useState<Field[]>([])
  const [sent, setSent] = useState<{ live: boolean } | null>(null)
  const doneRef = useRef<HTMLHeadingElement>(null)
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))
  useEffect(() => {
    if (sent) doneRef.current?.focus()
  }, [sent])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const gaps = (Object.keys(REQUIRED) as Field[]).filter((k) => !form[k].trim())
    setMissing(gaps)
    if (gaps.length) {
      setError(null)
      document.getElementById(`dsu-${gaps[0]}`)?.focus()
      return
    }
    if (!send) {
      setSent({ live: false })
      return
    }
    setBusy(true)
    setError(null)
    try {
      await send(form)
      setSent({ live: true })
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401 ? (
          <>
            Your sign-in has ended.{' '}
            <a href={`/sign-in?redirect_url=${encodeURIComponent(window.location.href)}`}>
              Sign in again
            </a>{' '}
            and send the form once more.
          </>
        ) : (
          (err as Error).message
        )
      )
    } finally {
      setBusy(false)
    }
  }

  const invalid = (k: Field) =>
    missing.includes(k)
      ? { 'aria-invalid': true as const, 'aria-describedby': `dsu-${k}-error` }
      : {}
  const fieldError = (k: Field) =>
    missing.includes(k) ? (
      <span className="dsu-field-error" id={`dsu-${k}-error`}>
        {REQUIRED[k]}
      </span>
    ) : null

  if (sent) {
    return (
      <div className="dsu-box dsu-done">
        <h2 className="dsu-box-head" tabIndex={-1} ref={doneRef}>
          {sent.live ? 'Request sent (demonstration)' : 'Demonstration only: nothing was sent'}
        </h2>
        {sent.live ? (
          <p>
            Your request for <strong>{title}</strong> is saved and waiting for staff to approve it.
            This is a demonstration, so no one at DSU receives it.
          </p>
        ) : (
          <p>
            In the live service this would send your request for <strong>{title}</strong> to the
            Adult &amp; Continuing Education team. On this demonstration site your answers are not
            sent or kept anywhere.
          </p>
        )}
        <h3 className="dsu-h3">What would happen next in the live service</h3>
        <ol className="dsu-list">
          <li>ACE staff review your request and answers.</li>
          <li>They call you to talk through funding and your schedule.</li>
          <li>Once approved, the program shows up in My learning.</li>
        </ol>
        <p>
          {sent.live && (
            <>
              <a className="dsu-button" href={href('/lms/learning')}>
                Go to My learning
              </a>{' '}
            </>
          )}
          <a href={href('/')}>Back to programs</a>
        </p>
      </div>
    )
  }

  return (
    <form className="dsu-form" onSubmit={submit} noValidate>
      {who ? (
        <>
          <p className="dsu-form-note">
            <strong>Demonstration:</strong> you are signed in, so this request is really sent to
            Learn Differently, which runs this demonstration, not to DSU. Please don&apos;t enter
            real details.
          </p>
          <p>
            Requesting as <strong>{who}</strong>
            {email && who !== email ? ` (${email})` : ''}.
          </p>
        </>
      ) : (
        <p className="dsu-form-note">
          <strong>Demonstration:</strong> try the form freely. Nothing you type here is sent or
          kept. In the live service you would sign in first, so your request and later your
          coursework stay in one place.
        </p>
      )}
      <label>
        <span>Phone number</span>
        <input
          id="dsu-phone"
          type="tel"
          autoComplete="tel"
          required
          value={form.phone}
          onChange={(e) => set('phone')(e.target.value)}
          placeholder="302-555-0100"
          {...invalid('phone')}
        />
        {fieldError('phone')}
      </label>
      <label>
        <span>Highest education</span>
        <select
          id="dsu-education"
          required
          value={form.education}
          onChange={(e) => set('education')(e.target.value)}
          {...invalid('education')}
        >
          <option value="">Choose one</option>
          {EDUCATION_OPTIONS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        {fieldError('education')}
      </label>
      <fieldset role="radiogroup" aria-required="true" {...invalid('employment')}>
        <legend>Are you working now?</legend>
        {(
          [
            ['employed', 'Yes'],
            ['not-employed', 'No'],
          ] as const
        ).map(([value, label], n) => (
          <label key={value} className="dsu-choice">
            <input
              id={n === 0 ? 'dsu-employment' : undefined}
              type="radio"
              name="employment"
              checked={form.employment === value}
              onChange={() => set('employment')(value)}
            />{' '}
            {label}
          </label>
        ))}
        {fieldError('employment')}
      </fieldset>
      {form.employment === 'employed' && (
        <label>
          <span>Employer and job title (optional)</span>
          <input value={form.employer} onChange={(e) => set('employer')(e.target.value)} />
        </label>
      )}
      <fieldset role="radiogroup" aria-required="true" {...invalid('funding')}>
        <legend>How do you plan to pay?</legend>
        {FUNDING_OPTIONS.map((f, n) => (
          <label key={f.value} className="dsu-choice">
            <input
              id={n === 0 ? 'dsu-funding' : undefined}
              type="radio"
              name="funding"
              checked={form.funding === f.value}
              onChange={() => set('funding')(f.value)}
            />{' '}
            {f.label}
          </label>
        ))}
        {fieldError('funding')}
      </fieldset>
      <label>
        <span>Preferred language (optional)</span>
        <input
          value={form.language}
          onChange={(e) => set('language')(e.target.value)}
          placeholder="English"
        />
      </label>
      <label>
        <span>Why are you interested in this program? (optional)</span>
        <textarea rows={3} value={form.reason} onChange={(e) => set('reason')(e.target.value)} />
      </label>
      {error && (
        <p className="dsu-error" role="alert">
          {error}
        </p>
      )}
      <button className="dsu-button" type="submit" disabled={busy}>
        {busy ? 'Sending…' : 'Send my request'}
      </button>
      <p className="dsu-muted">
        See our <a href={href('/privacy')}>Privacy page</a> for how we keep and delete what you
        send.
      </p>
    </form>
  )
}
