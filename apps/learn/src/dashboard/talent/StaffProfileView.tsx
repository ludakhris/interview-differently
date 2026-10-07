import type { TalentCompensation } from '@id/types'
import type { TalentProfileStaffView } from './legacyTypes'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useApiFetch } from '../api'
import { dateOnly } from '../format'
import { educationLabel, fileSize, money } from './profileForm'
import './talent.css'

const list = (xs: string[]) => (xs.length ? xs.join(', ') : 'Not given')

function Row(props: { label: string; children: ReactNode }) {
  return (
    <div className="tl-row">
      <dt>{props.label}</dt>
      <dd>{props.children}</dd>
    </div>
  )
}

/**
 * A participant's profile as staff see it. Read-only. Pay is not in the profile response: it is
 * fetched (and audited) only when staff click Show, held in component state only, and dropped on Hide.
 */
export function StaffProfileView(props: {
  profile: TalentProfileStaffView | null
  /** GET path of the compensation endpoint for this participant. */
  compensationPath: string
  onOpenResume: () => void
  resumeBusy?: boolean
  resumeError?: string | null
  /** Set when the browser blocked the new tab: the link is shown for the person to click. */
  resumeFallbackUrl?: string | null
}) {
  const apiFetch = useApiFetch()
  const [pay, setPay] = useState<TalentCompensation | null>(null)
  const [payBusy, setPayBusy] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const payId = useId()
  const showBtn = useRef<HTMLButtonElement>(null)
  const refocusShow = useRef(false)
  useEffect(() => {
    // After Hide the Show button comes back; keep keyboard focus there, not on the page body.
    if (!pay && refocusShow.current) {
      refocusShow.current = false
      showBtn.current?.focus()
    }
  }, [pay])
  const p = props.profile
  if (!p) return <p className="dash-muted">This person has not started a profile yet.</p>
  async function revealPay() {
    setPayBusy(true)
    setPayError(null)
    try {
      setPay((await (await apiFetch(props.compensationPath)).json()) as TalentCompensation)
    } catch (err) {
      setPayError((err as Error).message)
    } finally {
      setPayBusy(false)
    }
  }
  return (
    <div className="tl-staff">
      <p className="dash-muted">
        {p.completedAt ? `Completed ${dateOnly(p.completedAt)}.` : 'Not finished yet.'} This is the
        person&apos;s own answer; staff cannot change it.
      </p>
      <dl className="tl-facts">
        <Row label="Industries">{list(p.industries)}</Row>
        <Row label="Jobs wanted">{list(p.targetRoles)}</Row>
        <Row label="Years of experience">{p.yearsExperience ?? 'Not given'}</Row>
        <Row label="Available from">
          {p.availableFrom ? dateOnly(p.availableFrom) : 'Not given'}
        </Row>
        <Row label="Education">
          {[educationLabel(p.educationLevel), p.fieldOfStudy, p.school, p.graduationYear]
            .filter((x) => x && x !== '—')
            .join(', ') || 'Not given'}
        </Row>
        <Row label="OK to share with employers">{p.shareWithEmployers ? 'Yes' : 'No'}</Row>
        <Row label="Resume">
          {p.resume ? (
            <>
              {p.resume.name} <span className="dash-muted">({fileSize(p.resume.size)})</span>{' '}
              <button
                type="button"
                className="dash-btn-quiet"
                onClick={props.onOpenResume}
                disabled={props.resumeBusy}
              >
                Download resume
              </button>
            </>
          ) : (
            'None'
          )}
        </Row>
      </dl>
      {props.resumeError && (
        <p className="dash-error" role="alert">
          {props.resumeError}
        </p>
      )}
      {props.resumeFallbackUrl && (
        <p>
          Your browser blocked the new tab.{' '}
          <a href={props.resumeFallbackUrl} target="_blank" rel="noopener noreferrer">
            Download {p.resume?.name ?? 'the resume'}
          </a>
        </p>
      )}
      {p.resume && <p className="dash-hint">Opening a resume is recorded in the access log.</p>}

      <section className="tl-pay-box" aria-label="Compensation">
        <h3 className="tl-pay-h">Compensation</h3>
        {!p.hasCompensation ? (
          <p className="dash-muted">This person did not give pay information.</p>
        ) : pay ? (
          <>
            <dl id={payId} className="tl-facts">
              <Row label="Earned in last job">{money(pay.previousCompensation)}</Row>
              <Row label="Hopes to earn">{money(pay.targetCompensation)}</Row>
            </dl>
            <button
              type="button"
              className="dash-btn-quiet"
              onClick={() => {
                refocusShow.current = true
                setPay(null)
              }}
            >
              Hide compensation
            </button>
          </>
        ) : (
          <>
            <p className="dash-muted">
              Private. Only staff of this provider can see it. Showing it is recorded in the access
              log.
            </p>
            <button
              type="button"
              ref={showBtn}
              className="dash-btn-secondary"
              aria-expanded={false}
              aria-controls={payId}
              disabled={payBusy}
              onClick={revealPay}
            >
              {payBusy ? 'Loading…' : 'Show compensation'}
            </button>
            {payError && (
              <p className="dash-error" role="alert">
                {payError}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
