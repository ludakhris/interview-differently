import type { LearnerActivityReport, LearnerRecord, ParticipantNoteDto } from '@id/types'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useApiSend, useLoad } from '../api'
import { useApp } from '../app-context'
import { StatTile } from '../charts'
import { DayRows } from '../activity/ActivityPage'
import { dayLabel, formatDuration, localTz, presetRange } from '../activity/activityLogic'
import { STATUS_LABEL, STATUS_LETTER } from '../attendance/attendanceLogic'
import { dateShort } from '../format'
import { errorNotice } from '../shared'
import { StaffOnlyNotice } from '../StaffOnlyNotice'
import { SupportSection } from '../talent/SupportSection'
import {
  PROFILE_LABEL,
  SKIPPED_LABEL,
  attendanceTag,
  dateIn,
  dateTimeIn,
  mergeFeed,
  readinessLine,
  type FeedItem,
} from './learnerRecordLogic'
import './learnerRecord.css'

const NOTE_MAX = 4000
const STATUS_WORD = {
  enrolled: 'Enrolled',
  completed: 'Completed',
  withdrawn: 'Withdrawn',
} as const
const SECTIONS = [
  { id: 'lr-attendance', label: 'Attendance' },
  { id: 'lr-activity', label: 'Activity' },
  { id: 'lr-notes', label: 'Notes' },
  { id: 'lr-support', label: 'Support follow-ups' },
] as const

/**
 * Staff view of one learner in one cohort: attendance, activity and notes on one page.
 * Mounted at /lms/cohorts/:cohortId/learners/:userId. The server decides what the viewer may see;
 * a viewer who is not staff of the learner's provider gets `notes.restricted` and no note box.
 */
export function LearnerRecordPage({ cohortId, userId }: { cohortId: string; userId: string }) {
  const { href } = useApp()
  const tz = useMemo(localTz, [])
  const record = useLoad<LearnerRecord>(
    `/learn/cohorts/${encodeURIComponent(cohortId)}/learners/${encodeURIComponent(userId)}/record?tz=${encodeURIComponent(tz)}`
  )
  const [counted, setCounted] = useState<number | null>(null)
  const back = (
    <p className="dash-back">
      <a href={href(`/lms/cohorts/${encodeURIComponent(cohortId)}`)}>← Back to the cohort</a>
    </p>
  )
  if (record.error) {
    return (
      <>
        {back}
        {errorNotice(record.error)}
        <p>
          <button type="button" className="dash-btn-secondary" onClick={record.reload}>
            Try again
          </button>
        </p>
      </>
    )
  }
  if (!record.data) {
    return (
      <>
        {back}
        <p className="dash-loading">Loading the record…</p>
      </>
    )
  }
  const r = record.data
  const openCount =
    counted ??
    (r.notes.support ?? []).filter((i) => i.status === 'open' || i.status === 'in_progress').length
  return (
    <div className="lr">
      {back}
      <Header record={r} cohortId={cohortId} />
      <SectionNav openCount={openCount} restricted={r.notes.restricted} />
      <AttendanceSection record={r} tz={tz} />
      <ActivitySection record={r} cohortId={cohortId} userId={userId} tz={tz} />
      <NotesSection record={r} cohortId={cohortId} userId={userId} tz={tz} />
      <SupportFollowUps record={r} userId={userId} onOpenCount={setCounted} />
    </div>
  )
}

function Header({ record, cohortId }: { record: LearnerRecord; cohortId: string }) {
  const { href, current } = useApp()
  const h = record.header
  const pct = h.progress.itemsTotal
    ? Math.round((h.progress.itemsDone / h.progress.itemsTotal) * 100)
    : null
  return (
    <header className="lr-head">
      <h1 className="dash-h2">{h.name}</h1>
      <p className="lr-email">{h.email ?? 'No email on file'}</p>
      <p className="lr-chips">
        <span className={`lr-chip lr-chip-${h.status}`}>{STATUS_WORD[h.status]}</span>
        {h.profile && (
          <span className={`lr-chip lr-chip-profile-${h.profile.status}`}>
            {PROFILE_LABEL[h.profile.status]}
            {h.profile.status !== 'none' && h.profile.complete !== null
              ? h.profile.complete
                ? ', complete'
                : ', incomplete'
              : ''}
            {h.profile.fresh === false ? ', out of date' : ''}
          </span>
        )}
        {h.profile?.status === 'shared' && current?.kind === 'provider' && (
          <a href={href(`/lms/talent/${encodeURIComponent(h.userId)}`)}>View their profile</a>
        )}
      </p>
      <dl className="lr-facts">
        <div>
          <dt>Cohort</dt>
          <dd>
            <a href={href(`/lms/cohorts/${encodeURIComponent(cohortId)}`)}>{h.cohortName}</a>
          </dd>
        </div>
        <div>
          <dt>Course</dt>
          <dd>{h.courseTitle}</dd>
        </div>
        <div>
          <dt>Joined</dt>
          <dd>{dateShort(h.joinedAt)}</dd>
        </div>
        <div>
          <dt>Progress</dt>
          <dd>
            {h.progress.itemsDone} of {h.progress.itemsTotal} items
            {pct === null ? '' : ` (${pct}%)`}
          </dd>
        </div>
      </dl>
      <p className="lr-readiness">{readinessLine(h.readiness)}</p>
    </header>
  )
}

function SectionNav({ openCount, restricted }: { openCount: number; restricted: boolean }) {
  function go(e: React.MouseEvent, id: string) {
    e.preventDefault()
    const el = document.getElementById(id)
    el?.scrollIntoView?.({ block: 'start' })
    el?.querySelector<HTMLElement>('h2')?.focus()
  }
  return (
    <nav className="lr-nav" aria-label="On this page">
      <ul>
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} onClick={(e) => go(e, s.id)}>
              {s.label}
              {s.id === 'lr-support' && !restricted && (
                <span className="lr-count" aria-label={`, ${openCount} open`}>
                  {openCount}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function AttendanceSection({ record, tz }: { record: LearnerRecord; tz: string }) {
  const a = record.attendance
  return (
    <section id="lr-attendance" className="lr-section" aria-labelledby="lr-h-attendance">
      <h2 className="dash-h2 lr-h" id="lr-h-attendance" tabIndex={-1}>
        Attendance
      </h2>
      {a.marks.length === 0 ? (
        <p className="dash-muted">No sessions have been held for this cohort yet.</p>
      ) : (
        <>
          <p className="lr-summary">
            <strong>{a.ratePct === null ? 'No rate yet' : `${a.ratePct}% attendance`}</strong>
            <span className="dash-muted">
              {' '}
              over {a.sessionsCounted} counted {a.sessionsCounted === 1 ? 'session' : 'sessions'}
            </span>
          </p>
          <div className="dash-tablewrap">
            <table className="dash-table lr-table">
              <thead>
                <tr>
                  <th scope="col">Session</th>
                  <th scope="col">Date and time</th>
                  <th scope="col">Status</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {a.marks.map((m) => (
                  <tr key={m.sessionId} id={`lr-session-${m.sessionId}`} tabIndex={-1}>
                    <th scope="row" data-label="Session">
                      {m.title}
                    </th>
                    <td data-label="Date and time">{dateTimeIn(m.startsAt, tz)}</td>
                    <td data-label="Status">
                      {m.status ? (
                        <span className={`lr-status lr-status-${m.status}`}>
                          <span className="lr-letter" aria-hidden="true">
                            {STATUS_LETTER[m.status]}
                          </span>{' '}
                          {STATUS_LABEL[m.status]}
                        </span>
                      ) : (
                        <span className="dash-muted">
                          {m.skipped ? SKIPPED_LABEL[m.skipped] : 'Not counted'}
                        </span>
                      )}
                    </td>
                    <td data-label="Note" className="lr-note-cell">
                      {m.note ?? <span className="dash-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function ActivitySection({
  record,
  cohortId,
  userId,
  tz,
}: {
  record: LearnerRecord
  cohortId: string
  userId: string
  tz: string
}) {
  const [preset, setPreset] = useState<'last30' | 'last7'>('last30')
  // The record already holds the last 30 days; only the 7-day view asks again (that call is not audited).
  const range = presetRange('last7', new Date(), tz)
  const week = useLoad<LearnerActivityReport>(
    preset === 'last7'
      ? `/learn/cohorts/${encodeURIComponent(cohortId)}/activity/learners/${encodeURIComponent(userId)}?from=${range.from}&to=${range.to}&tz=${encodeURIComponent(tz)}`
      : null
  )
  const report = preset === 'last7' ? week.data : record.activity
  return (
    <section id="lr-activity" className="lr-section" aria-labelledby="lr-h-activity">
      <h2 className="dash-h2 lr-h" id="lr-h-activity" tabIndex={-1}>
        Activity
      </h2>
      <div className="ac-presets" role="group" aria-label="Date range">
        {(
          [
            ['last30', 'Last 30 days'],
            ['last7', 'Last 7 days'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="ac-preset"
            aria-pressed={preset === id}
            onClick={() => setPreset(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {week.error && preset === 'last7' ? (
        <div role="alert">
          <p className="dash-error">Could not load the activity. {week.error.message}</p>
          <button type="button" className="dash-btn-secondary" onClick={week.reload}>
            Try again
          </button>
        </div>
      ) : !report ? (
        <p className="dash-loading">Loading activity…</p>
      ) : (
        <>
          <p className="dash-sub">
            {dayLabel(report.from)} to {dayLabel(report.to)}, in your local time.
          </p>
          <div className="dash-tiles lr-tiles">
            <StatTile label="Total time" value={formatDuration(report.totalSeconds)} />
            <StatTile
              label="Active days"
              value={`${report.activeDays}`}
              note="Days with any time"
            />
            <StatTile
              label="Average per active day"
              value={formatDuration(report.averagePerActiveDaySeconds)}
            />
          </div>
          {report.days.length === 0 ? (
            <p className="dash-muted">No activity was recorded for this learner in this period.</p>
          ) : (
            <div className="dash-tablewrap">
              <table className="dash-table ac-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">First start</th>
                    <th scope="col">Last activity end</th>
                    <th scope="col" className="num">
                      Total
                    </th>
                    <th scope="col">Sessions</th>
                  </tr>
                </thead>
                {report.days.map((d) => (
                  <DayRows key={d.day} day={d} tz={tz} />
                ))}
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function NotesSection({
  record,
  cohortId,
  userId,
  tz,
}: {
  record: LearnerRecord
  cohortId: string
  userId: string
  tz: string
}) {
  const send = useApiSend()
  const n = record.notes
  const providerId = record.header.providerId
  const [added, setAdded] = useState<ParticipantNoteDto[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)

  const feed = useMemo(
    () =>
      mergeFeed(n.participant ? [...added, ...n.participant] : null, n.attendance, n.cohortNames),
    [n.participant, n.attendance, n.cohortNames, added]
  )

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      const saved = await send<ParticipantNoteDto>(
        'POST',
        `/learn/providers/${encodeURIComponent(providerId)}/participants/${encodeURIComponent(userId)}/notes`,
        { body: text, cohortId }
      )
      setAdded((a) => [saved, ...a])
      setText('')
      setMessage({ kind: 'ok', text: 'Note added.' })
      box.current?.focus()
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id="lr-notes" className="lr-section" aria-labelledby="lr-h-notes">
      <h2 className="dash-h2 lr-h" id="lr-h-notes" tabIndex={-1}>
        Notes
      </h2>
      <StaffOnlyNotice />
      {n.restricted ? (
        <p className="dash-muted">
          Staff notes and support items are kept by the learner&apos;s provider, so only its staff
          can see or add them. Notes written with attendance are shown below.
        </p>
      ) : (
        <form onSubmit={add} className="lr-form">
          <label className="dash-field">
            <span>Add a note</span>
            <textarea
              ref={box}
              rows={3}
              value={text}
              maxLength={NOTE_MAX}
              onChange={(e) => setText(e.target.value)}
              placeholder="What would the next instructor want to know?"
            />
          </label>
          <p className="dash-muted lr-saved-to">
            Saved to {record.header.cohortName}. Notes follow this person across all your cohorts.
          </p>
          <div className="lr-actions">
            <button type="submit" className="dash-btn" disabled={busy || !text.trim()}>
              Add note
            </button>
          </div>
          <p
            role="status"
            className={
              message?.kind === 'error' ? 'dash-error lr-status-msg' : 'dash-muted lr-status-msg'
            }
          >
            {message?.text ?? ''}
          </p>
        </form>
      )}

      {feed.length === 0 ? (
        <p className="dash-muted">No notes yet.</p>
      ) : (
        <ol className="lr-feed" aria-label="Notes, newest first">
          {feed.map((f) => (
            <FeedEntry key={f.id} item={f} tz={tz} />
          ))}
        </ol>
      )}
    </section>
  )
}

function FeedEntry({ item, tz }: { item: FeedItem; tz: string }) {
  return (
    <li className="lr-entry">
      <p className="lr-meta">
        <span className="lr-tag">{item.tag}</span> <strong>{item.author}</strong> ·{' '}
        {dateIn(item.at, tz)}
      </p>
      {item.kind === 'attendance' && (
        <p className="lr-detail">
          <a
            href={`#lr-session-${item.sessionId}`}
            onClick={(e) => {
              const row = document.getElementById(`lr-session-${item.sessionId}`)
              if (!row) return
              e.preventDefault()
              row.scrollIntoView?.({ block: 'center' })
              row.focus()
            }}
          >
            {attendanceTag(item.sessionTitle, item.startsAt, tz)}
          </a>
        </p>
      )}
      <p className="lr-body">{item.body}</p>
    </li>
  )
}

/** Things staff track to help this person succeed. Provider staff manage them here; others see why not. */
function SupportFollowUps({
  record,
  userId,
  onOpenCount,
}: {
  record: LearnerRecord
  userId: string
  onOpenCount: (n: number) => void
}) {
  const n = record.notes
  return (
    <section id="lr-support" className="lr-section" aria-labelledby="lr-h-support">
      <h2 className="dash-h2 lr-h" id="lr-h-support" tabIndex={-1}>
        Support follow-ups
      </h2>
      {n.support === null ? (
        <p className="dash-muted">Support follow-ups are visible to provider staff only.</p>
      ) : (
        <>
          <p className="dash-sub lr-helper">
            Things you are tracking to help this person succeed, such as transportation or
            childcare.
          </p>
          <SupportSection
            providerId={record.header.providerId}
            userId={userId}
            initial={n.support}
            embedded
            onOpenCount={onOpenCount}
          />
        </>
      )}
    </section>
  )
}
