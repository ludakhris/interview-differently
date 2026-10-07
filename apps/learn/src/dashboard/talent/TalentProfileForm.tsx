import type { LearnerProfileState, ProfileDto } from '@id/types'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useApiSend } from '../api'
import { dateShort } from '../format'
import { ChipInput } from './ChipInput'
import { ResumeBox } from './ResumeBox'
import {
  EDUCATION_OPTIONS,
  INDUSTRY_SUGGESTIONS,
  MAX_EDUCATIONS,
  ROLE_SUGGESTIONS,
  blankEducation,
  checklist,
  missingFromSaved,
  requirementText,
  toInput,
  toValues,
  validate,
  type EducationValues,
  type FieldErrors,
  type FormValues,
} from './profileForm'
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

function Section(props: { title: string; lede?: string; children: ReactNode }) {
  const id = useId()
  return (
    <section className="tl-section" aria-labelledby={id}>
      <h2 id={id} className="tl-section-h">
        {props.title}
      </h2>
      {props.lede && <p className="tl-section-lede">{props.lede}</p>}
      {props.children}
    </section>
  )
}

const FIELD_NAMES: Record<string, string> = {
  yearsExperience: 'Years of experience',
  industries: 'Industries',
  targetRoles: 'Jobs you want',
  availableFrom: 'Available from',
  previousCompensation: 'Last pay',
  targetCompensation: 'Target pay',
  education: 'Education',
}
/** "education.1.level" -> "Education 2". */
function problemLabel(key: string): string {
  const m = /^education\.(\d+)\./.exec(key)
  return m ? `Education ${Number(m[1]) + 1}` : (FIELD_NAMES[key] ?? 'Profile')
}

/** Where the person stands: complete or not, and one plain card for each cohort that asks for it. */
export function ProfileStatus({
  state,
  values,
}: {
  state: LearnerProfileState
  values: FormValues
}) {
  const p = state.profile
  const missing = missingFromSaved(p)
  const checks = checklist(values)
  return (
    <section className="tl-status" aria-label="Profile status">
      <p
        className={p.complete ? 'tl-status-line tl-status-ok' : 'tl-status-line'}
        role="status"
        data-testid="profile-status"
      >
        {p.complete
          ? 'Profile complete'
          : `Almost there: add ${missing.length ? missing.join(', ') : 'the missing details'}`}
      </p>
      <p className="tl-checks">
        Your profile counts as complete when you have:{' '}
        {checks.map((c, i) => (
          <span key={c.label} className={c.done ? 'tl-check tl-check-on' : 'tl-check'}>
            <span aria-hidden="true">{c.done ? '✓' : '○'}</span>
            <span className="dash-visually-hidden">
              {c.done ? 'Done: ' : 'Still needed: '}
            </span>{' '}
            {c.label}
            {i < checks.length - 1 ? '; ' : '.'}
          </span>
        ))}
      </p>
      {state.requirements.map((r) => {
        const t = requirementText(r, p, dateShort)
        return (
          <div
            key={r.cohortId}
            className={t.tone === 'ok' ? 'tl-req tl-req-ok' : 'tl-req tl-req-todo'}
          >
            <strong>{t.tone === 'ok' ? r.providerName : `Required by ${r.providerName}`}</strong>
            <span className="dash-muted"> ({r.cohortName})</span>
            <div>{t.text}</div>
          </div>
        )
      })}
    </section>
  )
}

/**
 * The learner's one profile, as a form. Used on My profile and as the course item. Saving is one
 * action; completeness is computed by the server and shown, never chosen.
 */
export function TalentProfileForm(props: {
  state: LearnerProfileState
  /** Called after every successful save, with the fresh state. */
  onSaved?: (state: LearnerProfileState) => void
  /** Shown in the save bar, for example the way back to the course. */
  children?: ReactNode
}) {
  const send = useApiSend()
  const [state, setState] = useState<LearnerProfileState>(props.state)
  const [v, setV] = useState<FormValues>(() => toValues(props.state))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const summary = useRef<HTMLDivElement>(null)
  const addEdu = useRef<HTMLButtonElement>(null)
  const [failedTries, setFailedTries] = useState(0)
  // After a failed save, move to the list of problems so keyboard and screen reader users land on it.
  useEffect(() => {
    if (failedTries > 0) summary.current?.focus()
  }, [failedTries])

  const clearError = (...keys: string[]) =>
    setErrors((cur) => {
      if (!keys.some((k) => cur[k])) return cur
      const rest = { ...cur }
      for (const k of keys) delete rest[k]
      return rest
    })
  const edited = () => {
    setSaved(false)
    setServerError(null)
  }
  const set = <K extends keyof FormValues>(k: K, value: FormValues[K]) => {
    setV((cur) => ({ ...cur, [k]: value }))
    edited()
    clearError(k)
  }
  const setEdu = (i: number, patch: Partial<EducationValues>) => {
    setV((cur) => ({
      ...cur,
      educations: cur.educations.map((e, j) => (j === i ? { ...e, ...patch } : e)),
    }))
    edited()
    clearError(...Object.keys(patch).map((f) => `education.${i}.${f}`), 'education')
  }
  const removeEdu = (i: number) => {
    setV((cur) => ({ ...cur, educations: cur.educations.filter((_, j) => j !== i) }))
    edited()
    setErrors((cur) =>
      Object.fromEntries(Object.entries(cur).filter(([k]) => !/^education/.test(k)))
    )
    setTimeout(() => addEdu.current?.focus(), 0)
  }
  const setShare = (id: string, patch: Partial<FormValues['shares'][string]>) => {
    setV((cur) => ({ ...cur, shares: { ...cur.shares, [id]: { ...cur.shares[id], ...patch } } }))
    edited()
  }

  async function save() {
    const found = validate(v)
    setErrors(found)
    setServerError(null)
    if (Object.keys(found).length > 0) {
      setSaved(false)
      setFailedTries((n) => n + 1)
      return
    }
    setBusy(true)
    try {
      const next = await send<LearnerProfileState>('PUT', '/learn/me/profile', toInput(v))
      setState(next)
      setV(toValues(next))
      setSaved(true)
      props.onSaved?.(next)
    } catch (err) {
      setSaved(false)
      setServerError((err as Error).message)
      setFailedTries((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }

  const problems = Object.entries(errors).map(([k, m]) => `${problemLabel(k)}: ${m}`)
  const resumeChanged = (p: ProfileDto) => setState((s) => ({ ...s, profile: p }))
  const err = (k: string) => errors[k]

  return (
    <form
      className="tl-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <ProfileStatus state={state} values={v} />

      {(problems.length > 0 || serverError) && (
        <div ref={summary} tabIndex={-1} className="dash-banner dash-banner-error" role="alert">
          {serverError ? (
            serverError
          ) : (
            <>
              Please fix {problems.length === 1 ? 'this' : 'these'} before saving:
              <ul>
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <Section title="Resume" lede="Optional but helpful.">
        <ResumeBox resume={state.profile.resume} onChange={resumeChanged} />
      </Section>

      <Section title="Your work">
        <Field
          label="Years of work experience"
          hint="Use 0 if you are just starting out."
          error={err('yearsExperience')}
        >
          {(a) => (
            <input
              id={a.id}
              type="number"
              min={0}
              max={60}
              step={1}
              inputMode="numeric"
              className="tl-narrow"
              value={v.yearsExperience}
              aria-describedby={a.describedBy}
              aria-invalid={a.invalid}
              onChange={(e) => set('yearsExperience', e.target.value)}
            />
          )}
        </Field>
        <ChipInput
          label="Industries you have worked in"
          hint="Pick from the list or type your own, then press Enter."
          error={err('industries')}
          value={v.industries}
          onChange={(x) => set('industries', x)}
          suggestions={INDUSTRY_SUGGESTIONS}
        />
        <ChipInput
          label="Jobs you want"
          hint="Pick from the list or type your own, then press Enter."
          error={err('targetRoles')}
          value={v.targetRoles}
          onChange={(x) => set('targetRoles', x)}
          suggestions={ROLE_SUGGESTIONS}
        />
        <Field label="Available from" error={err('availableFrom')}>
          {(a) => (
            <input
              id={a.id}
              type="date"
              className="tl-narrow"
              value={v.availableFrom}
              aria-describedby={a.describedBy}
              aria-invalid={a.invalid}
              onChange={(e) => set('availableFrom', e.target.value)}
            />
          )}
        </Field>
      </Section>

      <Section title="Education" lede="Add each school or program you want to list.">
        {err('education') && <p className="dash-error">{err('education')}</p>}
        {v.educations.map((ed, i) => (
          <fieldset key={ed.key} className="tl-edu">
            <legend>Education {i + 1}</legend>
            <Field label="Level" error={err(`education.${i}.level`)}>
              {(a) => (
                <select
                  id={a.id}
                  value={ed.level}
                  aria-describedby={a.describedBy}
                  aria-invalid={a.invalid}
                  onChange={(e) => setEdu(i, { level: e.target.value })}
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
            <Field label="Field of study" error={err(`education.${i}.fieldOfStudy`)}>
              {(a) => (
                <input
                  id={a.id}
                  value={ed.fieldOfStudy}
                  aria-describedby={a.describedBy}
                  aria-invalid={a.invalid}
                  onChange={(e) => setEdu(i, { fieldOfStudy: e.target.value })}
                />
              )}
            </Field>
            <Field label="School" error={err(`education.${i}.school`)}>
              {(a) => (
                <input
                  id={a.id}
                  value={ed.school}
                  aria-describedby={a.describedBy}
                  aria-invalid={a.invalid}
                  onChange={(e) => setEdu(i, { school: e.target.value })}
                />
              )}
            </Field>
            <Field label="Graduation year" error={err(`education.${i}.graduationYear`)}>
              {(a) => (
                <input
                  id={a.id}
                  type="number"
                  inputMode="numeric"
                  className="tl-narrow"
                  value={ed.graduationYear}
                  aria-describedby={a.describedBy}
                  aria-invalid={a.invalid}
                  onChange={(e) => setEdu(i, { graduationYear: e.target.value })}
                />
              )}
            </Field>
            {v.educations.length > 1 && (
              <div>
                <button
                  type="button"
                  className="dash-btn-quiet"
                  aria-label={`Remove education ${i + 1}`}
                  onClick={() => removeEdu(i)}
                >
                  Remove
                </button>
              </div>
            )}
          </fieldset>
        ))}
        <div>
          <button
            ref={addEdu}
            type="button"
            className="dash-btn-secondary"
            disabled={v.educations.length >= MAX_EDUCATIONS}
            onClick={() => {
              setV((cur) => ({ ...cur, educations: [...cur.educations, blankEducation()] }))
              edited()
            }}
          >
            Add another
          </button>
        </div>
      </Section>

      <Section
        title="Pay"
        lede="Optional. Only organizations you share with can see this. Whole dollars per year."
      >
        <div className="tl-moneyrow">
          {(['previousCompensation', 'targetCompensation'] as const).map((k) => (
            <Field
              key={k}
              label={
                k === 'previousCompensation' ? 'What you earned before' : 'What you hope to earn'
              }
              error={err(k)}
            >
              {(a) => (
                <span className="tl-money">
                  <span className="tl-prefix" aria-hidden="true">
                    $
                  </span>
                  <input
                    id={a.id}
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    autoComplete="off"
                    value={v[k]}
                    aria-describedby={a.describedBy}
                    aria-invalid={a.invalid}
                    onChange={(e) => set(k, e.target.value)}
                  />
                </span>
              )}
            </Field>
          ))}
        </div>
      </Section>

      <Section
        title="Who can see this profile"
        lede="Nothing is shared until you tick a box. You can change this any time."
      >
        {state.organizations.length === 0 ? (
          <p className="dash-muted">
            Once you join a program, the organizations behind it will be listed here.
          </p>
        ) : (
          <ul className="tl-orgs">
            {state.organizations.map((o) => {
              const c = v.shares[o.institutionId] ?? { shared: false, allowEmployers: false }
              const noteId = `tl-org-${o.institutionId}`
              return (
                <li key={o.institutionId} className="tl-org">
                  <label className="dash-check tl-orgcheck">
                    <input
                      type="checkbox"
                      checked={c.shared}
                      aria-describedby={noteId}
                      onChange={(e) =>
                        setShare(o.institutionId, {
                          shared: e.target.checked,
                          allowEmployers: e.target.checked ? c.allowEmployers : false,
                        })
                      }
                    />
                    <span>{o.name}</span>
                  </label>
                  <p id={noteId} className="tl-orgnote">
                    {o.why.charAt(0).toUpperCase() + o.why.slice(1)}.
                    {o.required &&
                      ` ${o.name} asked for this as part of your course; you decide whether they can read it.`}
                  </p>
                  {c.shared && (
                    <label className="dash-check tl-suborg">
                      <input
                        type="checkbox"
                        checked={c.allowEmployers}
                        onChange={(e) =>
                          setShare(o.institutionId, { allowEmployers: e.target.checked })
                        }
                      />
                      <span>
                        They may share it with employers who partner with them
                        <span className="dash-visually-hidden"> ({o.name})</span>
                      </span>
                    </label>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <div className="tl-savebar">
        <button type="submit" className="dash-btn" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <span className="dash-muted" role="status">
          {saved ? 'Saved just now' : ''}
        </span>
        {props.children}
      </div>
    </form>
  )
}
