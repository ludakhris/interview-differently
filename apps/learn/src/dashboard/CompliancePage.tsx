import type { ComplianceFramework, ComplianceRequirement, ComplianceStatus } from '@id/types'
import { useMemo, useState } from 'react'
import { useApiSend, useLoad } from './api'
import { SYSTEM_ADMIN } from './AdminPages'
import { useApp } from './app-context'
import { Notice } from './DashboardShell'
import { errorNotice, useRole } from './shared'
import './compliance.css'

export const STATUS_LABEL: Record<ComplianceStatus, string> = {
  satisfied: 'Satisfied',
  partial: 'Partly satisfied',
  not_satisfied: 'Not satisfied',
  not_applicable: 'Not applicable',
}
const STATUSES = Object.keys(STATUS_LABEL) as ComplianceStatus[]
const ISSUES_URL = 'https://github.com/ludakhris/interview-differently/issues/'
const ORDER: ComplianceStatus[] = ['partial', 'not_satisfied', 'satisfied', 'not_applicable']

/**
 * Admin toolbox: Compliance. Each governing agency's requirements on us as a vendor (Delaware DTI first) and where
 * we stand on each, with how we get there for the rest. Platform admins only; the rows are imported from a file
 * and never kept in the repo, which is public.
 */
export function CompliancePage() {
  const role = useRole()
  const { href } = useApp()
  if (role !== SYSTEM_ADMIN)
    return (
      <Notice title="Your account does not have access">
        The admin tools are only open to platform administrators.
      </Notice>
    )
  return (
    <>
      <a className="dash-back" href={href('/lms/admin')}>
        ← Admin
      </a>
      <div className="dash-head">
        <div>
          <h1 className="dash-h2">Compliance</h1>
          <p className="dash-sub">
            Each governing agency’s requirements for vendors like us, and where we stand on each
            one.
          </p>
        </div>
      </div>
      <ComplianceBody />
    </>
  )
}

function ComplianceBody() {
  const loaded = useLoad<ComplianceFramework[]>('/learn/admin/compliance')
  const [picked, setPicked] = useState<string | null>(null)
  if (loaded.error) return errorNotice(loaded.error)
  if (!loaded.data) return <p className="dash-loading">Loading…</p>
  const frameworks = loaded.data
  const current = frameworks.find((f) => f.key === picked) ?? frameworks[0]
  return (
    <div className="cp">
      <div className="cp-tabs" role="tablist" aria-label="Governing agency">
        {frameworks.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            className="cp-tab"
            aria-selected={f.key === current.key}
            onClick={() => setPicked(f.key)}
          >
            {f.name}
          </button>
        ))}
      </div>
      {current ? (
        <Framework key={current.key} framework={current} />
      ) : (
        <p className="cp-muted">
          No requirements yet. Import a governing agency’s requirements file to start.
        </p>
      )}
      <ImportFile onDone={loaded.reload} />
    </div>
  )
}

function Framework({ framework }: { framework: ComplianceFramework }) {
  const [status, setStatus] = useState<ComplianceStatus | null>(null)
  const [search, setSearch] = useState('')
  const [mustOnly, setMustOnly] = useState(false)
  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ComplianceStatus, number>
    for (const r of framework.requirements) c[r.status]++
    return c
  }, [framework])
  const recommended = framework.requirements.filter((r) => r.strength === 'SHOULD').length
  const term = search.trim().toLowerCase()
  const shown = framework.requirements.filter(
    (r) =>
      (!status || r.status === status) &&
      (!mustOnly || r.strength === 'MUST') &&
      (!term || haystack(r).includes(term))
  )
  const areas = new Map<string, ComplianceRequirement[]>()
  for (const r of framework.requirements) areas.set(r.area, [])
  for (const r of shown) areas.get(r.area)?.push(r)

  return (
    <>
      <div className="cp-framework">
        <h2>{framework.name}</h2>
        <p className="cp-muted">
          {framework.requirements.length} requirements · imported{' '}
          {new Date(framework.importedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
        </p>
      </div>
      <div className="cp-tiles" role="group" aria-label="Filter by status">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`cp-tile cp-${s}`}
            aria-pressed={status === s}
            onClick={() => setStatus(status === s ? null : s)}
          >
            <span>{STATUS_LABEL[s]}</span>
            <strong>{counts[s]}</strong>
          </button>
        ))}
      </div>
      <div className="cp-tools">
        <input
          className="cp-search"
          type="search"
          aria-label="Search requirements"
          placeholder="Search, for example MFA, encryption or IAM-12"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="dash-check">
          <input
            type="checkbox"
            checked={mustOnly}
            onChange={(e) => setMustOnly(e.target.checked)}
          />{' '}
          Required only (hides the {recommended} recommended)
        </label>
      </div>
      <p className="cp-muted" aria-live="polite">
        {shown.length === framework.requirements.length
          ? `Showing all ${shown.length}`
          : `Showing ${shown.length} of ${framework.requirements.length}`}
      </p>
      {shown.length === 0 && (
        <p className="cp-muted">Nothing matches. Clear the search or the status filter.</p>
      )}
      {[...areas].map(([area, rows]) =>
        rows.length ? (
          <Area key={area} area={area} all={framework.requirements} rows={rows} />
        ) : null
      )}
    </>
  )
}

function Area(props: {
  area: string
  all: ComplianceRequirement[]
  rows: ComplianceRequirement[]
}) {
  const inArea = props.all.filter((r) => r.area === props.area)
  const na = inArea.filter((r) => r.status === 'not_applicable').length
  const sat = inArea.filter((r) => r.status === 'satisfied').length
  const rows = [...props.rows].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
  return (
    <section className="cp-area" aria-label={props.area}>
      <header className="cp-area-head">
        <h3>{props.area}</h3>
        <span className="cp-muted">
          {sat} of {inArea.length - na} satisfied{na ? ` · ${na} not applicable` : ''}
        </span>
      </header>
      <ol className="cp-list">
        {rows.map((r) => (
          <li key={r.code} className="cp-item">
            <details open={r.status === 'partial'}>
              <summary>
                <span className="cp-req">
                  <strong>{r.requirement}</strong>
                  <span className="cp-code">
                    {r.code} · {r.strength === 'MUST' ? 'Required' : 'Recommended'} · {r.source}
                  </span>
                </span>
                <span className={`cp-pill cp-${r.status}`}>{STATUS_LABEL[r.status]}</span>
              </summary>
              <div className="cp-body">
                <p>
                  <span className="cp-label">
                    {r.status === 'not_applicable' ? 'Why it does not apply' : 'Where we stand'}
                  </span>
                  {r.standing}
                </p>
                {r.plan && (
                  <p className={`cp-plan cp-plan-${r.status}`}>
                    <span className="cp-label">How we get there</span>
                    {r.plan}
                    {r.issue && (
                      <>
                        {' '}
                        <a href={`${ISSUES_URL}${r.issue}`} target="_blank" rel="noreferrer">
                          Tracked in #{r.issue}
                        </a>
                      </>
                    )}
                  </p>
                )}
              </div>
            </details>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Replace one governing agency's requirements from a JSON file (key, name, requirements). */
function ImportFile({ onDone }: { onDone: () => void }) {
  const send = useApiSend()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const upload = async (file: File) => {
    setBusy(true)
    setMessage(null)
    try {
      let body: unknown
      try {
        body = JSON.parse(await file.text())
      } catch {
        throw new Error('That file is not valid JSON.')
      }
      const out = await send<{ key: string; count: number }>(
        'POST',
        '/learn/admin/compliance/import',
        body
      )
      setMessage({ ok: true, text: `Imported ${out.count} requirements.` })
      onDone()
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="cp-tools">
      <label className={busy ? 'dash-btn-quiet dash-file-disabled' : 'dash-btn-quiet dash-file'}>
        {busy ? 'Importing…' : 'Import requirements'}
        <input
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void upload(f)
          }}
        />
      </label>
      <span className="cp-muted">
        A JSON file for one governing agency. It replaces that agency’s requirements.
      </span>
      {message && (
        <p className={message.ok ? 'cp-muted' : 'dash-error'} role="status">
          {message.text}
        </p>
      )}
    </div>
  )
}

const haystack = (r: ComplianceRequirement) =>
  [r.code, r.requirement, r.area, r.standing, r.plan ?? '', STATUS_LABEL[r.status]]
    .join(' ')
    .toLowerCase()
