import type { CatalogCourse, CatalogOffering } from '@id/types'
import { useState } from 'react'
import { usePublic } from '../../public-api'
import { AREAS, DSU, FUNDING_OPTIONS, usd } from './dsuContent'

type Href = (path: string) => string

function months(weeks: number | null): string | null {
  if (weeks == null || weeks <= 0) return null
  if (weeks < 8) return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`
  return `${Math.round(weeks / 4.33)} months`
}

function facts(c: CatalogCourse): string[] {
  return [
    months(c.lengthWeeks),
    c.contactHours != null ? `${c.contactHours} hours` : null,
    c.format,
    c.tuitionDollars != null ? usd(c.tuitionDollars) : null,
  ].filter((f): f is string => Boolean(f))
}

/** The office's programs, filtered by area and searched by words, in the course guide's order. */
export function DsuCatalogPage({ tenant, href }: { tenant: string; href: Href }) {
  const { data, error, loading } = usePublic<CatalogCourse[]>(`/learn/public/${tenant}/catalog`)
  const [area, setArea] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()
  const shown = (data ?? [])
    .filter((c) => !area || c.sector === area)
    .filter(
      (c) =>
        !term ||
        [c.title, c.summary, c.credential, ...c.targetRoles]
          .filter(Boolean)
          .some((s) => (s as string).toLowerCase().includes(term))
    )
  const count = (a: string) => (data ?? []).filter((c) => c.sector === a).length
  // The same area filter twice: a side menu on wide screens, a row of buttons above the cards on phones.
  const areaButtons = [
    <button key="all" type="button" aria-pressed={area === null} onClick={() => setArea(null)}>
      All programs {data ? `(${data.length})` : ''}
    </button>,
    ...AREAS.map((a) => (
      <button key={a} type="button" aria-pressed={area === a} onClick={() => setArea(a)}>
        {a} {data ? `(${count(a)})` : ''}
      </button>
    )),
  ]

  return (
    <div className="dsu-cols dsu-cols-cat">
      <div className="dsu-body">
        <h1 className="dsu-h1">Find your certificate program</h1>
        <p className="dsu-lead">
          Online, self-paced certificate programs, each preparing you for a certification exam. Pick
          a program and request enrollment here, in one short form, instead of a course guide, a
          booking and a separate intake form.
        </p>
        <label className="dsu-search">
          <span>Search programs</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="For example: coding, CompTIA, HR"
          />
        </label>
        <div className="dsu-chips" role="group" aria-label="Program area">
          {areaButtons}
        </div>
        {loading && <p className="dsu-muted">Loading programs…</p>}
        {error && <p className="dsu-error">The catalog could not be loaded. Try again shortly.</p>}
        {data && (
          <p className="dsu-muted" aria-live="polite">
            {shown.length} {shown.length === 1 ? 'program' : 'programs'}
            {area ? ` in ${area}` : ''}
          </p>
        )}
        <ul className="dsu-cards">
          {shown.map((c) => (
            <li key={c.id} className="dsu-card">
              <p className="dsu-card-area">{c.sector}</p>
              <h2 className="dsu-card-title">
                <a href={href(`/lms/catalog/${encodeURIComponent(c.id)}`)}>{c.title}</a>
              </h2>
              {c.summary && <p className="dsu-card-summary">{c.summary}</p>}
              <p className="dsu-card-facts">{facts(c).join(' · ')}</p>
              {c.credential && (
                <p className="dsu-card-cred">
                  <span>Prepares you for:</span> {c.credential}
                </p>
              )}
            </li>
          ))}
        </ul>
        {data && shown.length === 0 && (
          <p className="dsu-muted">No programs match. Try another word or area.</p>
        )}
      </div>
      {/* After the cards in reading order; shown on the left on wide screens (dsu.css). */}
      <aside className="dsu-side dsu-cat-side">
        <h2 className="dsu-side-head">Programs</h2>
        <ul className="dsu-side-menu">
          {areaButtons.map((b) => (
            <li key={b.key}>{b}</li>
          ))}
        </ul>
        <FundingBox />
      </aside>
    </div>
  )
}

function FundingBox() {
  return (
    <div className="dsu-box">
      <h2 className="dsu-box-head">Help paying for training</h2>
      <p>
        Many students qualify for WIOA funding or support from the Division of Vocational
        Rehabilitation (DVR). Tell us how you plan to pay when you request a program, and we will
        help you with the next steps.
      </p>
      <p>
        <a href={DSU.priorLearning}>Credit for Prior Learning</a>
      </p>
    </div>
  )
}

/** One program: what it covers, what it costs, and the request button. */
export function DsuProgramPage({
  tenant,
  courseId,
  href,
}: {
  tenant: string
  courseId: string
  href: Href
}) {
  const {
    data: c,
    error,
    loading,
  } = usePublic<CatalogOffering>(`/learn/public/${tenant}/courses/${encodeURIComponent(courseId)}`)
  if (loading) return <p className="dsu-muted">Loading…</p>
  if (error || !c)
    return (
      <p className="dsu-error">
        That program could not be found. <a href={href('/')}>See all programs</a>
      </p>
    )
  return (
    <div className="dsu-cols dsu-cols-right">
      <div className="dsu-body">
        <p className="dsu-card-area">{c.sector}</p>
        <h1 className="dsu-h1">{c.title}</h1>
        {c.summary && <p className="dsu-lead">{c.summary}</p>}
        <dl className="dsu-facts">
          {months(c.lengthWeeks) && (
            <div>
              <dt>Length</dt>
              <dd>{months(c.lengthWeeks)}</dd>
            </div>
          )}
          {c.contactHours != null && (
            <div>
              <dt>Course hours</dt>
              <dd>{c.contactHours}</dd>
            </div>
          )}
          {c.format && (
            <div>
              <dt>Format</dt>
              <dd>{c.format}</dd>
            </div>
          )}
          {c.tuitionDollars != null && (
            <div>
              <dt>Tuition</dt>
              <dd>{usd(c.tuitionDollars)}</dd>
            </div>
          )}
        </dl>
        {c.credential && (
          <>
            <h2 className="dsu-h2">Certification</h2>
            <p>
              Prepares you for the certification exam: {c.credential}. Ask the office about any
              other requirements for sitting the exam.
            </p>
          </>
        )}
        {c.outcomes.length > 0 && (
          <>
            <h2 className="dsu-h2">What you will learn</h2>
            <ul className="dsu-list">
              {c.outcomes.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </>
        )}
        {c.targetRoles.length > 0 && (
          <>
            <h2 className="dsu-h2">Jobs it prepares you for</h2>
            <p>{c.targetRoles.join(', ')}</p>
          </>
        )}
        {c.prerequisite && (
          <>
            <h2 className="dsu-h2">Before you start</h2>
            <p>{c.prerequisite}.</p>
          </>
        )}
        <p className="dsu-muted">
          {c.tuitionDollars != null && 'Tuition includes a $35 nonrefundable registration fee. '}
          Details from the <a href={DSU.courseGuide}>ACE course guide</a>.
        </p>
      </div>
      <aside className="dsu-side">
        <div className="dsu-box dsu-cta">
          <h2 className="dsu-box-head">Ready to start?</h2>
          {c.acceptsRequests ? (
            <>
              <p>
                Request enrollment in one short form. In the live service, the ACE team calls you to
                plan your start and funding.
              </p>
              <a
                className="dsu-button"
                href={href(`/lms/catalog/${encodeURIComponent(c.id)}/request`)}
              >
                Request enrollment
              </a>
            </>
          ) : (
            <p>
              This program is not taking requests online right now. Call {DSU.phone} or email{' '}
              <a href={`mailto:${DSU.email}`}>{DSU.email}</a>.
            </p>
          )}
        </div>
        <div className="dsu-box">
          <h2 className="dsu-box-head">Ways students often pay</h2>
          <p>Ask the office which of these fits this program and your situation.</p>
          <ul className="dsu-list">
            {FUNDING_OPTIONS.filter((f) => f.value !== 'unsure').map((f) => (
              <li key={f.value}>{f.label}</li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
