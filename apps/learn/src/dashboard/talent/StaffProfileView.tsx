import type { TalentProfileStaffView } from '@id/types'
import { useId, useState, type ReactNode } from 'react'
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

/** A participant's profile as staff see it. Read-only. Pay stays out of the page until it is asked for. */
export function StaffProfileView(props: {
  profile: TalentProfileStaffView | null
  onOpenResume: () => void
  resumeBusy?: boolean
  resumeError?: string | null
}) {
  const [showPay, setShowPay] = useState(false)
  const payId = useId()
  const p = props.profile
  if (!p) return <p className="dash-muted">This person has not started a profile yet.</p>
  const hasPay = p.previousCompensation !== null || p.targetCompensation !== null
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
      {p.resume && <p className="dash-hint">Opening a resume is recorded in the access log.</p>}

      <section className="tl-pay-box" aria-label="Compensation">
        <h3 className="tl-pay-h">Compensation</h3>
        {!hasPay ? (
          <p className="dash-muted">This person did not give pay information.</p>
        ) : showPay ? (
          <>
            <dl id={payId} className="tl-facts">
              <Row label="Earned in last job">{money(p.previousCompensation)}</Row>
              <Row label="Hopes to earn">{money(p.targetCompensation)}</Row>
            </dl>
            <button type="button" className="dash-btn-quiet" onClick={() => setShowPay(false)}>
              Hide compensation
            </button>
          </>
        ) : (
          <>
            <p className="dash-muted">
              Private. Only staff of this provider can see it. Viewing this profile is recorded in
              the access log.
            </p>
            <button
              type="button"
              className="dash-btn-secondary"
              aria-expanded={false}
              aria-controls={payId}
              onClick={() => setShowPay(true)}
            >
              Show compensation
            </button>
          </>
        )}
      </section>
    </div>
  )
}
