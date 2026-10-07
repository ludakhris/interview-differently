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
  educationBlank,
  formatMoney,
  requirementText,
  timeShort,
  toInput,
  toValues,
  validate,
  type EducationValues,
  type FieldErrors,
  type FormValues,
} from './profileForm'
import './talent.css'

function Tag({ id, tag }: { id: string; tag?: string }) {
  if (!tag) return null
  return (
    <span id={id} className={tag === 'Optional' ? 'tl-opt' : 'tl-need'}>
      {tag}
    </span>
  )
}

function Field(props: {
  label: string
  /** "Needed" or "Optional": shown beside the label and read as part of the field's description. */
  tag?: string
  hint?: string
  error?: string
  /** Fixed id, so the error summary can link to the field. */
  fieldId?: string
  className?: string
  children: (a: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode
}) {
  const generated = useId()
  const id = props.fieldId ?? generated
  const tagId = `${id}-tag`
  const hintId = `${id}-hint`
  const errId = `${id}-err`
  const describedBy = [props.tag ? tagId : '', props.hint ? hintId : '', props.error ? errId : '']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={props.className ? `dash-field ${props.className}` : 'dash-field'}>
      <div className="tl-labelrow">
        <label htmlFor={id} className="tl-label">
          {props.label}
        </label>
        <Tag id={tagId} tag={props.tag} />
      </div>
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

function Section(props: { title: string; lede?: string; tag?: string; children: ReactNode }) {
  const id = useId()
  return (
    <section className="tl-section" aria-labelledby={id}>
      <div className="tl-section-head">
        <h2 id={id} className="tl-section-h">
          {props.title}
        </h2>
        <Tag id={`${id}-tag`} tag={props.tag} />
      </div>
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
  previousCompensation: 'Pay you earned before',
  targetCompensation: 'Pay you hope to earn',
  education: 'Education',
}
/** "education.1.level" -> "Education 2". */
function problemLabel(key: string): string {
  const m = /^education\.(\d+)\./.exec(key)
  return m ? `Education ${Number(m[1]) + 1}` : (FIELD_NAMES[key] ?? 'Profile')
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/**
 * Where the person stands: one status line, the short list of what counts as complete (shown once),
 * and one plain card for each cohort that asks for it. Not a live region: it changes as the person
 * types, and only a save is announced.
 */
export function ProfileStatus({
  state,
  values,
}: {
  state: LearnerProfileState
  values: FormValues
}) {
  const p = state.profile
  const checks = checklist(values)
  const missing = checks.filter((c) => !c.done).map((c) => c.label)
  return (
    <section className="tl-status" aria-label="Profile status">
      <p
        className={
          p.complete && missing.length === 0 ? 'tl-status-line tl-status-ok' : 'tl-status-line'
        }
        data-testid="profile-status"
      >
        {missing.length > 0
          ? `Almost there: add ${missing.join(', ')}`
          : p.complete
            ? 'Profile complete'
            : 'Ready to save'}
      </p>
      <div className="tl-checks">
        <p className="tl-checks-h">What counts as complete</p>
        <ul className="tl-checklist">
          {checks.map((c) => (
            <li key={c.label} className={c.done ? 'tl-check tl-check-on' : 'tl-check'}>
              <span aria-hidden="true">{c.done ? '✓' : '○'}</span>
              <span className="dash-visually-hidden">
                {c.done ? 'Done: ' : 'Still needed: '}
              </span>{' '}
              {cap(c.label)}
            </li>
          ))}
        </ul>
      </div>
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
  const formId = useId()
  const fid = (k: string) => `${formId}-${k}`
  const [state, setState] = useState<LearnerProfileState>(props.state)
  const [v, setV] = useState<FormValues>(() => toValues(props.state))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const summary = useRef<HTMLDivElement>(null)
  const addEdu = useRef<HTMLButtonElement>(null)
  const [failedTries, setFailedTries] = useState(0)
  // After a failed save, bring the list of problems fully into view and move focus to it.
  useEffect(() => {
    if (failedTries > 0) {
      summary.current?.focus({ preventScroll: true })
      summary.current?.scrollIntoView?.({ block: 'start' })
    }
  }, [failedTries])

  /** Error key -> the field to land on. The "too many educations" error has no field of its own. */
  const focusField = (key: string) => {
    const el = document.getElementById(fid(key === 'education' ? 'education.0.level' : key))
    if (!el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView?.({ block: 'center' })
  }

  const clearError = (...keys: string[]) =>
    setErrors((cur) => {
      if (!keys.some((k) => cur[k])) return cur
      const rest = { ...cur }
      for (const k of keys) delete rest[k]
      return rest
    })
  const edited = () => {
    setDirty(true)
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
  /** Removing the only entry clears it: one (empty) entry always stays. */
  const removeEdu = (i: number) => {
    setV((cur) => ({
      ...cur,
      educations:
        cur.educations.length > 1 ? cur.educations.filter((_, j) => j !== i) : [blankEducation()],
    }))
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
      setFailedTries((n) => n + 1)
      return
    }
    setBusy(true)
    try {
      const next = await send<LearnerProfileState>('PUT', '/learn/me/profile', toInput(v))
      setState(next)
      setV(toValues(next))
      setDirty(false)
      setSavedAt(timeShort(new Date()))
      props.onSaved?.(next)
    } catch (err) {
      setServerError((err as Error).message)
      setFailedTries((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }

  const problems = Object.entries(errors).map(([k, m]) => ({
    key: k,
    text: `${problemLabel(k)}: ${m}`,
  }))
  const resumeChanged = (p: ProfileDto) => setState((s) => ({ ...s, profile: p }))
  const err = (k: string) => errors[k]
  const moneyLabel = {
    previousCompensation: 'What you earned before (per year)',
    targetCompensation: 'What you hope to earn (per year)',
  }

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

      <div className="tl-main">
        {(problems.length > 0 || serverError) && (
          <div
            ref={summary}
            tabIndex={-1}
            className="dash-banner dash-banner-error tl-errors"
            role="alert"
          >
            {serverError ? (
              serverError
            ) : (
              <>
                Please fix {problems.length === 1 ? 'this' : 'these'} before saving:
                <ul>
                  {problems.map((p) => (
                    <li key={p.key}>
                      <a
                        href={`#${fid(p.key === 'education' ? 'education.0.level' : p.key)}`}
                        onClick={(e) => {
                          e.preventDefault()
                          focusField(p.key)
                        }}
                      >
                        {p.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <Section
          title="Resume"
          tag="Optional"
          lede="Shared only with the organizations you choose below."
        >
          <ResumeBox resume={state.profile.resume} onChange={resumeChanged} />
        </Section>

        <Section title="Your work">
          <Field
            label="Years of work experience"
            tag="Needed"
            hint="Use 0 if you are just starting out."
            error={err('yearsExperience')}
            fieldId={fid('yearsExperience')}
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
            tag="Needed (this or jobs you want)"
            error={err('industries')}
            value={v.industries}
            onChange={(x) => set('industries', x)}
            suggestions={INDUSTRY_SUGGESTIONS}
            inputId={fid('industries')}
          />
          <ChipInput
            label="Jobs you want"
            tag="Needed (this or industries)"
            error={err('targetRoles')}
            value={v.targetRoles}
            onChange={(x) => set('targetRoles', x)}
            suggestions={ROLE_SUGGESTIONS}
            inputId={fid('targetRoles')}
          />
          <Field
            label="Available from"
            tag="Optional"
            error={err('availableFrom')}
            fieldId={fid('availableFrom')}
          >
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

        <Section
          title="Education"
          lede="List each school or program. One entry with a level is needed; leave it blank only if you have none."
        >
          {err('education') && <p className="dash-error">{err('education')}</p>}
          {v.educations.map((ed, i) => (
            <fieldset key={ed.key} className="tl-edu">
              <legend>Education {i + 1}</legend>
              <div className="tl-edu-grid">
                <Field
                  label="Level"
                  tag={i === 0 ? 'Needed' : 'Needed for this entry'}
                  error={err(`education.${i}.level`)}
                  fieldId={fid(`education.${i}.level`)}
                  className="tl-edu-level"
                >
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
                <Field
                  label="Graduation year"
                  tag="Optional"
                  error={err(`education.${i}.graduationYear`)}
                  fieldId={fid(`education.${i}.graduationYear`)}
                  className="tl-edu-year"
                >
                  {(a) => (
                    <input
                      id={a.id}
                      type="number"
                      inputMode="numeric"
                      value={ed.graduationYear}
                      aria-describedby={a.describedBy}
                      aria-invalid={a.invalid}
                      onChange={(e) => setEdu(i, { graduationYear: e.target.value })}
                    />
                  )}
                </Field>
                <Field
                  label="Field of study"
                  tag="Optional"
                  error={err(`education.${i}.fieldOfStudy`)}
                  fieldId={fid(`education.${i}.fieldOfStudy`)}
                >
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
                <Field
                  label="School"
                  tag="Optional"
                  error={err(`education.${i}.school`)}
                  fieldId={fid(`education.${i}.school`)}
                >
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
              </div>
              {(v.educations.length > 1 || !educationBlank(ed)) && (
                <div>
                  <button
                    type="button"
                    className="dash-btn-quiet tl-dangerbtn"
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
              Add another school or program
            </button>
          </div>
        </Section>

        <Section
          title="Pay"
          lede="Optional. Whole dollars per year. Only organizations you share with can see this."
        >
          <div className="tl-moneyrow">
            {(['previousCompensation', 'targetCompensation'] as const).map((k) => (
              <Field key={k} label={moneyLabel[k]} tag="Optional" error={err(k)} fieldId={fid(k)}>
                {(a) => (
                  <span className="tl-money">
                    <span className="tl-prefix" aria-hidden="true">
                      $
                    </span>
                    <input
                      id={a.id}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      enterKeyHint="done"
                      value={v[k]}
                      aria-describedby={a.describedBy}
                      aria-invalid={a.invalid}
                      onChange={(e) => set(k, e.target.value)}
                      onBlur={() => {
                        const f = formatMoney(v[k])
                        if (f !== v[k]) setV((cur) => ({ ...cur, [k]: f }))
                      }}
                    />
                  </span>
                )}
              </Field>
            ))}
          </div>
        </Section>

        <Section
          title="Who can see this profile"
          lede="Choose who can see everything on this page, including your pay and resume. They will also see your name and email from your account. Nothing is shared until you tick a box."
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
                          Also let {o.name} show my profile to employers it works with (for example
                          a hiring manager at a partner company)
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
          {/* The only live region: it speaks when a save lands, never while the person types. */}
          <span className="dash-muted" role="status">
            {savedAt && !dirty ? `Saved at ${savedAt}` : ''}
          </span>
          <span className="dash-muted">{dirty ? 'Unsaved changes' : ''}</span>
          {props.children}
        </div>
      </div>
    </form>
  )
}
