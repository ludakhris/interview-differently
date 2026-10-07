import type { TalentParticipantRow } from '@id/types'
import { useMemo, useState } from 'react'
import { downloadFile, useApiFetch, useLoad } from '../api'
import { useApp } from '../app-context'
import { errorNotice } from '../shared'
import { NoteIndicators } from './NoteIndicators'
import { EDUCATION_OPTIONS } from './profileForm'
import './talent.css'

export interface Filters {
  q: string
  cohortId: string
  industry: string
  role: string
  educationLevel: string
  share: boolean
  completed: boolean
  hasResume: boolean
}
export const noFilters: Filters = {
  q: '',
  cohortId: '',
  industry: '',
  role: '',
  educationLevel: '',
  share: false,
  completed: false,
  hasResume: false,
}

/** The query string for a set of filters. Pay is not a filter and is never part of a list request. */
export function filterQuery(f: Filters): string {
  const p = new URLSearchParams()
  if (f.q.trim()) p.set('q', f.q.trim())
  if (f.cohortId) p.set('cohortId', f.cohortId)
  if (f.industry) p.set('industry', f.industry)
  if (f.role) p.set('role', f.role)
  if (f.educationLevel) p.set('educationLevel', f.educationLevel)
  if (f.share) p.set('share', 'true')
  if (f.completed) p.set('completed', 'true')
  if (f.hasResume) p.set('hasResume', 'true')
  return p.toString()
}

const sortedUnique = (xs: string[]) =>
  [...new Set(xs)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

const PROFILE_WORD = { shared: 'Shared', not_shared: 'Not shared', none: 'None' } as const

function status(r: TalentParticipantRow): string {
  if (r.profileStatus === 'none') return '—'
  return (r.complete ? 'Complete' : 'Started') + (r.fresh === false ? ', out of date' : '')
}

/**
 * A cell that comes from the person's shared profile. A person who has not shared it shows a muted
 * "Not shared" and a person with no profile a muted "No profile", never a blank.
 */
function profileCell(r: TalentParticipantRow, value: string | null) {
  if (r.profileStatus === 'not_shared') return <span className="tl-quiet">Not shared</span>
  if (r.profileStatus === 'none') return <span className="tl-quiet">No profile</span>
  return value ?? <span className="tl-quiet">—</span>
}

/** The people in a list, as a table. Exported for tests. */
export function ParticipantTable({
  rows,
  providerName,
  filtered = true,
}: {
  rows: TalentParticipantRow[]
  providerName?: string
  filtered?: boolean
}) {
  const { href } = useApp()
  if (rows.length === 0)
    return (
      <p className="dash-muted">
        {filtered
          ? 'No one matches. Try clearing a filter.'
          : `No one is enrolled in ${providerName ?? 'this provider'}'s cohorts yet. People appear here once they join one of its cohorts.`}
      </p>
    )
  return (
    <div className="dash-tablewrap">
      <table className="dash-table tl-table">
        <caption className="dash-visually-hidden">Participants and their talent profiles</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Cohorts</th>
            <th scope="col">Industries</th>
            <th scope="col" className="num">
              Years
            </th>
            <th scope="col">Profile</th>
            <th scope="col">Status</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId}>
              <th scope="row">
                <a href={href(`/lms/talent/${r.userId}`)}>{r.name}</a>
                {r.email && <div className="dash-muted tl-email">{r.email}</div>}
              </th>
              <td>
                <ul className="tl-cohortchips" aria-label="Cohorts">
                  {r.cohorts.map((c) => (
                    <li
                      key={c.cohortId}
                      className={`tl-cohort${c.enrollmentStatus === 'withdrawn' ? ' tl-cohort-out' : ''}`}
                    >
                      {c.cohortName}
                      {c.enrollmentStatus === 'withdrawn' && (
                        <span className="tl-cohort-mark"> · withdrawn</span>
                      )}
                    </li>
                  ))}
                </ul>
              </td>
              <td>{profileCell(r, r.profile?.industries.join(', ') || null)}</td>
              <td className="num">
                {profileCell(
                  r,
                  r.profile?.yearsExperience === null || r.profile === null
                    ? null
                    : String(r.profile?.yearsExperience)
                )}
              </td>
              <td>
                <span className="dash-pill">{PROFILE_WORD[r.profileStatus]}</span>
                {r.profile?.hasResume && <span className="tl-tag">Resume</span>}
                {r.profile?.allowEmployers && <span className="tl-tag">OK to share</span>}
              </td>
              <td>{status(r)}</td>
              <td>
                {r.noteCount > 0 || r.openSupportItems > 0 ? (
                  <NoteIndicators
                    notes={r.noteCount}
                    openFollowUps={r.openSupportItems}
                    notesHref={href(`/lms/talent/${r.userId}`) + '#notes'}
                    followUpsHref={href(`/lms/talent/${r.userId}`) + '#follow-ups'}
                  />
                ) : (
                  <span className="dash-muted" aria-label="No notes or follow-ups">
                    —
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * #69 B and C, staff: search, filter and export the participants of a provider.
 * Mounted at /lms/talent in a provider workspace only. `providerId` is the workspace's institution id.
 * Pay is never in these rows; it is only in the export, and only when asked for.
 */
export function TalentPage({
  providerId,
  providerName,
}: {
  providerId: string
  workspace: string
  providerName?: string
}) {
  const who = providerName ?? 'your organization'
  const apiFetch = useApiFetch()
  const [draft, setDraft] = useState('')
  const [filters, setFilters] = useState<Filters>(noFilters)
  const [withPay, setWithPay] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const base = `/learn/providers/${providerId}/participants`
  const qs = filterQuery(filters)
  const everyone = useLoad<TalentParticipantRow[]>(base)
  const shown = useLoad<TalentParticipantRow[]>(qs ? `${base}?${qs}` : null)
  const rows = qs ? shown.data : everyone.data

  const options = useMemo(() => {
    const all = everyone.data ?? []
    const cohorts = new Map<string, string>()
    for (const r of all) for (const c of r.cohorts) cohorts.set(c.cohortId, c.cohortName)
    return {
      industries: sortedUnique(all.flatMap((r) => r.profile?.industries ?? [])),
      roles: sortedUnique(all.flatMap((r) => r.profile?.targetRoles ?? [])),
      cohorts: [...cohorts.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    }
  }, [everyone.data])

  if (everyone.error) return errorNotice(everyone.error)
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }))
  const active = qs !== ''

  async function exportCsv() {
    setExporting(true)
    setExportError(null)
    try {
      const params = new URLSearchParams(qs)
      if (withPay) params.set('includeCompensation', 'true')
      const query = params.toString()
      await downloadFile(
        apiFetch,
        `/learn/providers/${providerId}/talent-export.csv${query ? `?${query}` : ''}`,
        'talent.csv'
      )
    } catch (err) {
      setExportError((err as Error).message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <h1 className="dash-h2">Talent</h1>
      <p className="tl-lede">
        Everyone enrolled in {providerName ? `${providerName}'s` : 'your'} cohorts, across all of
        them. Each person appears once with every cohort they are in.
      </p>
      <ul className="tl-legend" aria-label="What the Profile column means">
        <li>
          <strong>Industries</strong> and <strong>Years</strong> show only when the person shared
          their profile with {who}.
        </li>
        <li>
          <span className="dash-pill">Not shared</span> means they have not; you still see whether
          the profile is complete.
        </li>
        <li>
          <span className="dash-pill">None</span> means they have no profile yet.
        </li>
      </ul>

      <form
        className="tl-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          set('q', draft)
        }}
      >
        <label className="dash-field tl-search-box">
          <span>Search by name or email</span>
          <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </label>
        <button type="submit" className="dash-btn-secondary">
          Search
        </button>
      </form>

      <p className="dash-hint tl-filterhint">
        Industry, job, education, resume and experience filters look only at profiles people have
        shared with your organization.
      </p>
      <div className="tl-filters" role="group" aria-label="Filters">
        <label className="dash-field">
          <span>Cohort</span>
          <select value={filters.cohortId} onChange={(e) => set('cohortId', e.target.value)}>
            <option value="">All cohorts</option>
            {options.cohorts.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="dash-field">
          <span>Industry</span>
          <select value={filters.industry} onChange={(e) => set('industry', e.target.value)}>
            <option value="">Any industry</option>
            {options.industries.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label className="dash-field">
          <span>Job wanted</span>
          <select value={filters.role} onChange={(e) => set('role', e.target.value)}>
            <option value="">Any job</option>
            {options.roles.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label className="dash-field">
          <span>Education</span>
          <select
            value={filters.educationLevel}
            onChange={(e) => set('educationLevel', e.target.value)}
          >
            <option value="">Any level</option>
            {EDUCATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="tl-chips" role="group" aria-label="Quick filters">
        {(
          [
            ['completed', 'Profile complete'],
            ['hasResume', 'Has a resume'],
            ['share', 'OK to share with employers'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={filters[k]}
            className={`dash-chip dash-chip-btn${filters[k] ? ' dash-chip-on' : ''}`}
            onClick={() => set(k, !filters[k])}
          >
            {label}
          </button>
        ))}
        {active && (
          <button
            type="button"
            className="dash-btn-quiet"
            onClick={() => {
              setFilters(noFilters)
              setDraft('')
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="tl-export">
        <button
          type="button"
          className="dash-btn-secondary"
          onClick={exportCsv}
          disabled={exporting}
        >
          {exporting ? 'Preparing…' : 'Export to CSV'}
        </button>
        <p className="dash-hint tl-exporthint">
          Export includes shared profiles only. People who have not shared are left out.
        </p>
        <label className="dash-check tl-pay">
          <input type="checkbox" checked={withPay} onChange={(e) => setWithPay(e.target.checked)} />
          <span>Include pay (what each person earned and hopes to earn)</span>
          <small className="dash-hint">
            Pay is private. Each export that includes it is recorded in the access log.
          </small>
        </label>
        {exportError && (
          <p className="dash-error" role="alert">
            {exportError}
          </p>
        )}
      </div>

      {(qs ? shown.loading : everyone.loading) || !rows ? (
        shown.error && qs ? (
          errorNotice(shown.error)
        ) : (
          <p className="dash-loading">Loading…</p>
        )
      ) : (
        <>
          <p className="dash-muted" role="status">
            {rows.length} {rows.length === 1 ? 'person' : 'people'}
            {active ? ' match' : ''}
            <span className="dash-muted"> · people who have withdrawn are included</span>
          </p>
          <ParticipantTable rows={rows} providerName={providerName} filtered={active} />
        </>
      )}
    </>
  )
}
