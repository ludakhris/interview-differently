import type { CatalogCourse, CatalogOffering } from '@id/types'
import { useState, type FormEvent } from 'react'
import { usePublic } from '../public-api'
import { useApp } from './app-context'
import { dateShort } from './format'
import { Notice } from './DashboardShell'

const meta = (c: CatalogCourse) =>
  [
    c.provider,
    c.lengthWeeks ? `${c.lengthWeeks} weeks` : null,
    c.credential ? `Credential: ${c.credential}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

/** An agency's training catalog: public, searchable, one card per offering. */
export function CatalogPage() {
  const { tenant, href } = useApp()
  const initial = new URLSearchParams(window.location.search).get('q') ?? ''
  const [q, setQ] = useState(initial)
  const [applied, setApplied] = useState(initial)
  const { data, error, loading } = usePublic<CatalogCourse[]>(
    tenant
      ? `/learn/public/${encodeURIComponent(tenant)}/catalog${applied ? `?q=${encodeURIComponent(applied)}` : ''}`
      : null
  )

  function search(e: FormEvent) {
    e.preventDefault()
    setApplied(q.trim())
    const url = new URL(window.location.href)
    if (q.trim()) url.searchParams.set('q', q.trim())
    else url.searchParams.delete('q')
    window.history.replaceState(null, '', url)
  }

  if (error) {
    return (
      <Notice title="The catalog is not available">
        Something went wrong loading the training catalog. Try again in a moment.
      </Notice>
    )
  }
  return (
    <>
      <div className="dash-head">
        <div>
          <h1 className="dash-h2">Training catalog</h1>
          <p className="dash-sub">
            Approved training offerings. Sample entries with fictional providers.
          </p>
        </div>
      </div>
      <form className="dash-inline-form dash-catalog-search" role="search" onSubmit={search}>
        <label className="dash-field">
          <span>Search by program, sector, credential or provider</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. healthcare, CNA, IT support"
          />
        </label>
        <button type="submit" className="dash-btn-secondary">
          Search
        </button>
      </form>

      {loading || !data ? (
        <p className="dash-loading">Loading the catalog…</p>
      ) : data.length === 0 ? (
        <div className="dash-empty">
          <h2 className="dash-card-title">No offerings match</h2>
          <p>Try a different word, or clear the search to see everything.</p>
        </div>
      ) : (
        <ul className="dash-courselist">
          {data.map((c) => (
            <li key={c.id} className="dash-card dash-course">
              <div className="dash-course-main">
                {c.sector && <p className="dash-kicker">{c.sector}</p>}
                <a className="dash-course-title" href={href(`/catalog/${c.id}`)}>
                  {c.title}
                </a>
                <p className="dash-sub">{meta(c)}</p>
                {c.targetRoles.length > 0 && (
                  <p className="dash-leads">
                    <span className="dash-muted">Prepares you for:</span>{' '}
                    {c.targetRoles.slice(0, 3).join(' · ')}
                  </p>
                )}
              </div>
              <div className="dash-learner-progress">
                <span className="dash-muted">
                  {c.nextStart
                    ? `Next start ${dateShort(c.nextStart)}`
                    : c.openCohorts
                      ? 'Cohort in progress'
                      : 'No cohort scheduled'}
                </span>
              </div>
              <div className="dash-course-side">
                <a className="dash-btn-secondary dash-btn-link" href={href(`/catalog/${c.id}`)}>
                  View offering
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** One offering: what it covers, who runs it, when the next cohort starts, and how to join. */
export function OfferingPage({ courseId }: { courseId: string }) {
  const { tenant, href } = useApp()
  const { data, error, loading } = usePublic<CatalogOffering>(
    tenant
      ? `/learn/public/${encodeURIComponent(tenant)}/courses/${encodeURIComponent(courseId)}`
      : null
  )
  if (error) {
    return (
      <Notice title="Offering not found">
        That offering is not in the catalog. <a href={href('/catalog')}>Back to the catalog</a>.
      </Notice>
    )
  }
  if (loading || !data) return <p className="dash-loading">Loading…</p>
  return (
    <>
      <p className="dash-back">
        <a href={href('/catalog')}>← Training catalog</a>
      </p>
      <div className="dash-head">
        <div>
          {data.sector && <p className="dash-kicker">{data.sector}</p>}
          <h1 className="dash-h2">{data.title}</h1>
          <p className="dash-sub">{meta(data)}</p>
        </div>
      </div>
      {data.summary && <p className="dash-offering-summary">{data.summary}</p>}

      <div className="dash-learner-grid">
        <section aria-labelledby="h-outcomes">
          {data.outcomes.length > 0 && (
            <>
              <h2 className="dash-card-title" id="h-outcomes">
                What you will be able to do
              </h2>
              <ul className="dash-outcomes">
                {data.outcomes.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </>
          )}
          {data.targetRoles.length > 0 && (
            <>
              <h2 className="dash-card-title">Jobs this prepares you for</h2>
              <ul className="dash-roles">
                {data.targetRoles.map((r, i) => (
                  <li key={i} className="dash-chip">
                    {r}
                  </li>
                ))}
              </ul>
            </>
          )}
          <h2 className="dash-card-title" id="h-covers">
            How the course runs
          </h2>
          {data.modules.length === 0 ? (
            <p className="dash-muted">The outline is being prepared.</p>
          ) : (
            <ol className="dash-offering-modules">
              {data.modules.map((m, i) => (
                <li key={i} className="dash-card">
                  <strong>{m.title}</strong>
                  <span className="dash-muted">
                    {m.items} {m.items === 1 ? 'activity' : 'activities'}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <aside>
          <div className="dash-card dash-record">
            <h2 className="dash-card-title">Join a cohort</h2>
            {data.cohorts.length === 0 ? (
              <p className="dash-muted">No cohort is scheduled yet. Check back soon.</p>
            ) : (
              <ul className="dash-offering-cohorts">
                {data.cohorts.map((k, i) => (
                  <li key={i}>
                    <strong>{k.name}</strong>
                    <span className="dash-muted">
                      {k.status === 'running' ? 'In progress' : `Starts ${dateShort(k.startsAt)}`} ·
                      ends {dateShort(k.endsAt)}
                      {k.seatsLeft !== null &&
                        (k.seatsLeft > 0 ? ` · ${k.seatsLeft} places left` : ' · Full')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="dash-muted dash-record-note">
              Your training provider gives you a join code. Sign in, then enter it on My learning.
            </p>
            <a className="dash-btn dash-btn-link" href={href('/learning')}>
              Sign in and join
            </a>
          </div>
        </aside>
      </div>
    </>
  )
}
