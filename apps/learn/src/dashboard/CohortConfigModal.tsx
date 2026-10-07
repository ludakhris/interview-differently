import './cohortConfig.css'
import type { CohortDetail } from '@id/types'
import { useId, useState, type FormEvent } from 'react'
import { useApiSend } from './api'
import { dateOnly } from './format'
import { Modal } from './Modal'

const REFRESH_MONTHS = [3, 6, 12]

/** The cohort's settings in a dialog, in labelled groups. The PUT body is unchanged from the old inline form. */
export function CohortConfigModal({
  cohort,
  onClose,
  onSaved,
}: {
  cohort: CohortDetail
  onClose: () => void
  onSaved: (c: CohortDetail) => void
}) {
  const send = useApiSend()
  const formId = useId()
  const [needsApproval, setNeedsApproval] = useState(!!cohort.requiresApproval)
  const [needsProfile, setNeedsProfile] = useState(!!cohort.requiresProfile)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const upcoming = cohort.status === 'upcoming'

  const err = (name: string) => (errors[name] ? `${formId}-${name}-err` : undefined)
  const fieldError = (name: string) =>
    errors[name] && (
      <small className="dash-error" id={`${formId}-${name}-err`}>
        {errors[name]}
      </small>
    )

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const limit = String(f.get('maxLearners') ?? '').trim()
    const found: Record<string, string> = {}
    if (String(f.get('name') ?? '').trim() === '') found.name = 'Enter a name.'
    if (limit && !(Number.isInteger(Number(limit)) && Number(limit) >= 1 && Number(limit) <= 5000))
      found.maxLearners = 'Enter a whole number from 1 to 5000, or leave it blank.'
    if (needsApproval && String(f.get('joinContact') ?? '').trim() === '')
      found.joinContact = 'Enter a contact learners can reach.'
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) {
      ;(e.currentTarget.elements.namedItem(first) as HTMLElement | null)?.focus()
      return
    }
    const body: Record<string, unknown> = {
      name: f.get('name'),
      maxLearners: limit ? Number(limit) : null,
    }
    if (f.get('startsAt')) body.startsAt = f.get('startsAt')
    body.delivery = f.get('delivery')
    body.requiresApproval = needsApproval
    body.joinContact = needsApproval ? String(f.get('joinContact') ?? '').trim() : null
    body.requiresProfile = needsProfile
    const months = Number(f.get('profileRefreshMonths'))
    body.profileRefreshMonths = needsProfile && months ? months : null
    setSaving(true)
    setFormError(null)
    try {
      onSaved(await send<CohortDetail>('PUT', `/learn/cohorts/${cohort.id}`, body))
    } catch (ex) {
      setFormError((ex as Error).message || 'Could not save the configuration.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Edit cohort configuration"
      onClose={onClose}
      dirty={dirty}
      footer={
        <>
          <button type="submit" form={formId} className="dash-btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="dash-btn-quiet"
            onClick={() => {
              if (dirty && !window.confirm('You have unsaved changes. Close without saving?'))
                return
              onClose()
            }}
          >
            Cancel
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="cfg"
        onSubmit={submit}
        onChange={() => setDirty(true)}
        noValidate
      >
        <fieldset className="cfg-group">
          <legend>Basics</legend>
          <div className="cfg-grid">
            <label className="cfg-field">
              <span>Name</span>
              <input
                name="name"
                required
                maxLength={120}
                defaultValue={cohort.name}
                data-autofocus
                aria-invalid={!!errors.name}
                aria-describedby={err('name')}
              />
              {fieldError('name')}
            </label>
            <label className="cfg-field">
              <span>Maximum learners</span>
              <input
                name="maxLearners"
                type="number"
                min={1}
                max={5000}
                defaultValue={cohort.maxLearners ?? ''}
                placeholder="No limit"
                aria-invalid={!!errors.maxLearners}
                aria-describedby={err('maxLearners')}
              />
              <small className="dash-muted">Blank means no limit.</small>
              {fieldError('maxLearners')}
            </label>
            <label className="cfg-field">
              <span>Start date</span>
              <input
                name="startsAt"
                type="date"
                disabled={!upcoming}
                defaultValue={cohort.startsAt?.slice(0, 10) ?? ''}
              />
              {!upcoming && (
                <small className="dash-muted">
                  The start date can only change before the cohort starts.
                </small>
              )}
            </label>
            <label className="cfg-field">
              <span>End date</span>
              <input type="text" readOnly disabled value={dateOnly(cohort.endsAt)} />
              <small className="dash-muted">Follows the start date and the course length.</small>
            </label>
          </div>
        </fieldset>

        <fieldset className="cfg-group">
          <legend>How it meets</legend>
          <label className="cfg-field">
            <span>Delivery</span>
            <select name="delivery" defaultValue={cohort.delivery}>
              <option value="online">Online (self-paced)</option>
              <option value="live">Live (sessions)</option>
              <option value="hybrid">Hybrid (both)</option>
            </select>
            <small className="dash-muted">Live and hybrid cohorts get attendance.</small>
          </label>
        </fieldset>

        <fieldset className="cfg-group">
          <legend>Joining</legend>
          <label className="cfg-check">
            <input
              type="checkbox"
              checked={needsApproval}
              onChange={(e) => setNeedsApproval(e.target.checked)}
            />
            <span>Ask an admin to approve people who join with the code</span>
          </label>
          {needsApproval && (
            <label className="cfg-field">
              <span>Contact for learners (shown while they wait)</span>
              <input
                name="joinContact"
                required
                maxLength={200}
                defaultValue={cohort.joinContact ?? ''}
                aria-invalid={!!errors.joinContact}
                aria-describedby={err('joinContact')}
              />
              <small className="dash-muted">
                Name and email or phone; learners see it next to their pending request.
              </small>
              {fieldError('joinContact')}
            </label>
          )}
        </fieldset>

        <fieldset className="cfg-group">
          <legend>Profile</legend>
          <label className="cfg-check">
            <input
              type="checkbox"
              checked={needsProfile}
              onChange={(e) => setNeedsProfile(e.target.checked)}
            />
            <span>
              Learners must complete their profile first
              <small className="dash-muted">
                Learners choose whether your organization can read their profile.
              </small>
            </span>
          </label>
          {needsProfile && (
            <label className="cfg-field">
              <span>Ask learners to refresh it</span>
              <select
                name="profileRefreshMonths"
                defaultValue={String(cohort.profileRefreshMonths ?? '')}
              >
                <option value="">Never</option>
                {REFRESH_MONTHS.map((m) => (
                  <option key={m} value={m}>
                    Every {m} months
                  </option>
                ))}
                {cohort.profileRefreshMonths &&
                  !REFRESH_MONTHS.includes(cohort.profileRefreshMonths) && (
                    <option value={cohort.profileRefreshMonths}>
                      Every {cohort.profileRefreshMonths} months
                    </option>
                  )}
              </select>
            </label>
          )}
        </fieldset>

        {formError && (
          <p className="dash-error" role="alert">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  )
}
