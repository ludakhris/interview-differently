import type { LearnerTalentProfileEntry, TalentProfileDto } from './legacyTypes'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useApiSend } from '../api'
import { ResumeBox } from './ResumeBox'
import {
  EDUCATION_OPTIONS,
  toInput,
  toValues,
  validate,
  type FieldErrors,
  type FormValues,
} from './profileForm'

/** Fields the "To finish" note is about: editing one of them retires the note. */
const FINISH_FIELDS: (keyof FormValues)[] = [
  'educationLevel',
  'yearsExperience',
  'industries',
  'targetRoles',
]
import './talent.css'

function Field(props: {
  label: string
  hint?: string
  error?: string
  children: (a: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const errId = `${id}-err`
  const describedBy = [props.hint ? hintId : '', props.error ? errId : ''].filter(Boolean).join(' ')
  return (
    <div className="dash-field">
      <label htmlFor={id}>
        <span>{props.label}</span>
      </label>
      {props.children({ id, describedBy: describedBy || undefined, invalid: !!props.error })}
      {props.hint && (
        <small id={hintId} className="dash-hint">
          {props.hint}
        </small>
      )}
      {props.error && (
        <small id={errId} className="dash-error">
          {props.error}
        </small>
      )}
    </div>
  )
}

/**
 * The talent profile form, for one provider. Used on the learner's profile page and as the course
 * item. `mode: 'item'` finishes the profile on its main button; `page` saves, with an optional finish.
 */
export function TalentProfileForm(props: {
  entry: LearnerTalentProfileEntry
  mode: 'page' | 'item'
  /** Called after every successful save. `completed` is true when this save finished the profile. */
  onSaved?: (profile: TalentProfileDto, completed: boolean) => void
}) {
  const { providerId } = props.entry
  const send = useApiSend()
  const [profile, setProfile] = useState<TalentProfileDto | null>(props.entry.profile)
  const [v, setV] = useState<FormValues>(() => toValues(props.entry.profile))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const summary = useRef<HTMLDivElement>(null)
  const [failedTries, setFailedTries] = useState(0)
  // After a failed check, move to the list of problems so keyboard and screen reader users land on it.
  useEffect(() => {
    if (failedTries > 0) summary.current?.focus()
  }, [failedTries])
  const set = <K extends keyof FormValues>(k: K, value: FormValues[K]) => {
    setV((cur) => ({ ...cur, [k]: value }))
    setSaved(null)
    // A field's message goes away as soon as the person edits it (and the finish note if it was about this field).
    setErrors((cur) => {
      if (!cur[k] && !(cur.finish && FINISH_FIELDS.includes(k))) return cur
      const rest = { ...cur }
      delete rest[k]
      if (FINISH_FIELDS.includes(k)) delete rest.finish
      return rest
    })
  }

  async function save(complete: boolean) {
    const found = validate(v, complete)
    setErrors(found)
    setServerError(null)
    if (Object.keys(found).length > 0) {
      setSaved(null)
      setFailedTries((n) => n + 1)
      return
    }
    setBusy(true)
    try {
      const next = await send<TalentProfileDto>(
        'PUT',
        `/learn/me/talent-profiles/${providerId}`,
        toInput(v, complete)
      )
      setProfile(next)
      setSaved(complete ? 'Saved. Your profile is complete.' : 'Saved.')
      props.onSaved?.(next, complete)
    } catch (err) {
      setSaved(null)
      setServerError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // The education field shows its own message; the finish note already names it.
  const problems = Object.entries(errors)
    .filter(([k, m]) => m && k !== 'educationLevel')
    .map(([, m]) => m as string)
  const completed = !!profile?.completedAt

  return (
    <form
      className="dash-form tl-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void save(props.mode === 'item')
      }}
    >
      {problems.length > 0 && (
        <div ref={summary} tabIndex={-1} className="dash-banner dash-banner-error" role="alert">
          Please fix {problems.length === 1 ? 'this' : 'these'} before saving:
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {serverError && (
        <p className="dash-error" role="alert">
          {serverError}
        </p>
      )}

      <fieldset className="tl-group">
        <legend>About you</legend>
        <Field
          label="Industries you have worked in"
          hint="Separate with commas, for example: Aerospace, Retail."
          error={errors.industries}
        >
          {(a) => (
            <input
              id={a.id}
              value={v.industries}
              aria-describedby={a.describedBy}
              aria-invalid={a.invalid}
              onChange={(e) => set('industries', e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Jobs you are looking for"
          hint="Separate with commas, for example: Data analyst, Project coordinator."
          error={errors.targetRoles}
        >
          {(a) => (
            <input
              id={a.id}
              value={v.targetRoles}
              aria-describedby={a.describedBy}
              aria-invalid={a.invalid}
              onChange={(e) => set('targetRoles', e.target.value)}
            />
          )}
        </Field>
        <Field label="When could you start a new job?" error={errors.availableFrom}>
          {(a) => (
            <input
              id={a.id}
              type="date"
              value={v.availableFrom}
              aria-describedby={a.describedBy}
              aria-invalid={a.invalid}
              onChange={(e) => set('availableFrom', e.target.value)}
            />
          )}
        </Field>
      </fieldset>

      <fieldset className="tl-group">
        <legend>Experience</legend>
        <Field
          label="Years of work experience"
          hint="A whole number. Use 0 if you are just starting out."
          error={errors.yearsExperience}
        >
          {(a) => (
            <input
              id={a.id}
              inputMode="numeric"
              value={v.yearsExperience}
              aria-describedby={a.describedBy}
              aria-invalid={a.invalid}
              onChange={(e) => set('yearsExperience', e.target.value)}
            />
          )}
        </Field>
      </fieldset>

      <fieldset className="tl-group">
        <legend>Education</legend>
        <Field label="Highest level of education" error={errors.educationLevel}>
          {(a) => (
            <select
              id={a.id}
              value={v.educationLevel}
              aria-describedby={a.describedBy}
              aria-invalid={a.invalid}
              onChange={(e) => set('educationLevel', e.target.value)}
            >
              <option value="">Choose one</option>
              {EDUCATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Field of study" error={errors.fieldOfStudy}>
          {(a) => (
            <input
              id={a.id}
              value={v.fieldOfStudy}
              aria-describedby={a.describedBy}
              aria-invalid={a.invalid}
              onChange={(e) => set('fieldOfStudy', e.target.value)}
            />
          )}
        </Field>
        <Field label="School" error={errors.school}>
          {(a) => (
            <input
              id={a.id}
              value={v.school}
              aria-describedby={a.describedBy}
              aria-invalid={a.invalid}
              onChange={(e) => set('school', e.target.value)}
            />
          )}
        </Field>
        <Field label="Year you finished" error={errors.graduationYear}>
          {(a) => (
            <input
              id={a.id}
              inputMode="numeric"
              value={v.graduationYear}
              aria-describedby={a.describedBy}
              aria-invalid={a.invalid}
              onChange={(e) => set('graduationYear', e.target.value)}
            />
          )}
        </Field>
      </fieldset>

      <fieldset className="tl-group">
        <legend>Pay (optional)</legend>
        <p className="tl-note">
          Only your training provider&apos;s staff can see this. It is never shown in lists or
          reports. You can leave it blank.
        </p>
        <Field
          label="What you earned in your last job"
          hint="Whole dollars per year, for example 52000."
          error={errors.previousCompensation}
        >
          {(a) => (
            <input
              id={a.id}
              inputMode="numeric"
              autoComplete="off"
              value={v.previousCompensation}
              aria-describedby={a.describedBy}
              aria-invalid={a.invalid}
              onChange={(e) => set('previousCompensation', e.target.value)}
            />
          )}
        </Field>
        <Field
          label="What you hope to earn next"
          hint="Whole dollars per year."
          error={errors.targetCompensation}
        >
          {(a) => (
            <input
              id={a.id}
              inputMode="numeric"
              autoComplete="off"
              value={v.targetCompensation}
              aria-describedby={a.describedBy}
              aria-invalid={a.invalid}
              onChange={(e) => set('targetCompensation', e.target.value)}
            />
          )}
        </Field>
      </fieldset>

      <fieldset className="tl-group">
        <legend>Resume</legend>
        <ResumeBox
          providerId={providerId}
          resume={profile?.resume ?? null}
          onChange={(p) => {
            setProfile(p)
            props.onSaved?.(p, false)
          }}
        />
      </fieldset>

      <fieldset className="tl-group">
        <legend>Sharing with employers</legend>
        <label className="dash-check tl-consent">
          <input
            type="checkbox"
            checked={v.shareWithEmployers}
            onChange={(e) => set('shareWithEmployers', e.target.checked)}
          />
          <span>Yes, you may share my profile and resume with employers who are hiring.</span>
          <small className="dash-hint">
            Staff at your training provider can see your profile either way, because they run your
            program. Your pay is never shared with employers. You can change your mind at any time.
          </small>
        </label>
      </fieldset>

      <div className="dash-form-actions">
        {props.mode === 'item' ? (
          <>
            <button type="submit" className="dash-btn" disabled={busy}>
              {busy ? 'Saving…' : completed ? 'Save changes' : 'Save and finish'}
            </button>
            <button
              type="button"
              className="dash-btn-secondary"
              disabled={busy}
              onClick={() => void save(false)}
            >
              Save for later
            </button>
          </>
        ) : (
          <>
            <button type="submit" className="dash-btn" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            {!completed && (
              <button
                type="button"
                className="dash-btn-secondary"
                disabled={busy}
                onClick={() => void save(true)}
              >
                Save and mark complete
              </button>
            )}
          </>
        )}
        <span className="dash-muted" role="status">
          {saved ?? (completed ? 'Your profile is complete.' : '')}
        </span>
      </div>
    </form>
  )
}
