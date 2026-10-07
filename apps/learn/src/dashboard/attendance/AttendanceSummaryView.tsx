import type { AttendanceSummary } from '@id/types'
import { STATUS_LABEL, STATUS_LETTER, rateLabel } from './attendanceLogic'

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/**
 * Learners down, held sessions across, in the Roster table's style: a letter and a colour per mark,
 * the attendance rate, and a corner flag where the mark has a staff note (its text is the tooltip).
 * Each name links to the learner's record page.
 */
export function AttendanceSummaryView({
  data,
  href,
  cohortId,
  onlyUserIds,
}: {
  data: AttendanceSummary
  href: (path: string) => string
  cohortId: string
  /** Show only these learners (the "below 75%" filter). */
  onlyUserIds?: string[] | null
}) {
  const rows = onlyUserIds ? data.rows.filter((r) => onlyUserIds.includes(r.userId)) : data.rows
  return (
    <div>
      <p className="dash-muted at-legend">
        P present, A absent (also no mark in a session that was taken), L late, E excused, · not
        counted. A corner flag means a note: hover the cell to read it.
      </p>
      <p className="dash-muted at-scroll-hint">Scroll sideways to see every session.</p>
      {rows.length === 0 ? (
        <p className="dash-muted">No learners to show.</p>
      ) : data.sessionList.length === 0 ? (
        <p className="dash-muted">No sessions have been held yet.</p>
      ) : (
        <div
          className="dash-tablewrap at-grid-wrap"
          tabIndex={0}
          role="region"
          aria-label="Attendance by learner"
        >
          <table className="dash-table at-grid">
            <thead>
              <tr>
                <th scope="col" className="at-g-name">
                  Learner
                </th>
                <th scope="col">Rate</th>
                {data.sessionList.map((s) => (
                  <th scope="col" key={s.id} title={s.title}>
                    <span className="dash-visually-hidden">
                      {s.title}, {day(s.startsAt)}
                      {s.taken ? '' : ', attendance not taken yet'}
                    </span>
                    <span className="at-g-title" aria-hidden="true">
                      {s.title}
                    </span>
                    <span className="dash-muted at-g-date" aria-hidden="true">
                      {day(s.startsAt)}
                    </span>
                    {!s.taken && (
                      <span className="dash-muted at-g-date" aria-hidden="true">
                        not taken yet
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId}>
                  <th scope="row" className="at-g-name">
                    <a href={href(`/lms/cohorts/${cohortId}/learners/${r.userId}`)}>{r.name}</a>
                  </th>
                  <td className="at-g-rate">{rateLabel(r.ratePct)}</td>
                  {data.sessionList.map((s) => {
                    const st = r.marks[s.id]
                    const skip = r.skipped[s.id]
                    const note = r.notes?.[s.id]
                    const word = st
                      ? STATUS_LABEL[st]
                      : skip === 'before_join'
                        ? 'before enrolled, not counted'
                        : 'attendance not taken yet'
                    const label = `${r.name}, ${s.title}: ${word}${note ? `. Note: ${note}` : ''}`
                    return (
                      <td
                        key={s.id}
                        className={`at-cell ${st ? `at-s-${st}` : 'at-s-none'}${note ? ' at-has-note' : ''}`}
                        aria-label={label}
                        title={note ? `${word}. Note: ${note}` : undefined}
                      >
                        <span aria-hidden="true">{st ? STATUS_LETTER[st] : '·'}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
