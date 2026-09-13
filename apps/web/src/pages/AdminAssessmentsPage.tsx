import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { useRole } from '@/hooks/useRole'
import { useOwnerOptions, type OwnerOption } from '@/hooks/useOwnerOptions'
import { OwnerBadge } from './AdminDatasetsPage'
import { downloadCsv } from '@/lib/csv'
import { listCohortOptions, type CohortOption } from '@/services/datasetsService'
import {
  createDelivery,
  createInvite,
  deleteAssessment,
  deleteDelivery,
  getAssessment,
  getDeliveryResults,
  importAssessment,
  listAssessments,
  previewAssessment,
  revokeInvite,
  type AssessmentDetail,
  type AssessmentSummary,
  type DeliveryResults,
  type PreviewResult,
} from '@/services/assessmentsService'

/**
 * Admin page for assessments (#25). Master-detail: assessments on the left;
 * the right pane is either the markdown importer (paste → Preview → Import)
 * or the selected assessment's sections, deliveries and per-delivery results.
 */

type GetToken = () => Promise<string | null>

const inputCls =
  'w-full bg-[#111111] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-[#f5f3ee] placeholder:text-white/25 focus:outline-none focus:border-white/30'

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

export function AdminAssessmentsPage() {
  const { getToken } = useAuth()
  const { isAdmin } = useRole()
  const owners = useOwnerOptions()
  const [items, setItems] = useState<AssessmentSummary[]>([])
  const [cohorts, setCohorts] = useState<CohortOption[]>([])
  const [selectedId, setSelectedId] = useState<string | 'import' | null>(null)
  const [detail, setDetail] = useState<AssessmentDetail | null>(null)
  const [importSeed, setImportSeed] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [list, opts] = await Promise.all([listAssessments(getToken), listCohortOptions(getToken)])
      setItems(list)
      setCohorts(opts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assessments')
    }
  }, [getToken])

  const refreshDetail = useCallback(
    async (id: string) => {
      try {
        setDetail(await getAssessment(getToken, id))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load assessment')
      }
    },
    [getToken],
  )

  useEffect(() => {
    setLoading(true)
    refresh().finally(() => setLoading(false))
  }, [refresh])

  useEffect(() => {
    if (!selectedId || selectedId === 'import') {
      setDetail(null)
      return
    }
    refreshDetail(selectedId)
  }, [selectedId, refreshDetail])

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav />
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-1">Admin · Tools</p>
          <h1 className="font-display font-extrabold text-[24px] text-[#f5f3ee] tracking-tight">Assessments</h1>
          <p className="text-[13px] text-slate-mid mt-1">
            Question banks imported from markdown, scheduled to cohorts as pre/post deliveries. Format:{' '}
            <span className="font-mono">docs/assessment-format.md</span>.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 mb-4">
            <p className="text-[13px] text-red-400">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">Assessments</h2>
              <button
                onClick={() => {
                  setImportSeed('')
                  setSelectedId('import')
                }}
                className="text-[12px] font-semibold text-green-light hover:text-green transition-colors"
              >
                + Import
              </button>
            </div>
            {loading ? (
              <p className="text-[13px] text-slate-mid">Loading…</p>
            ) : items.length === 0 ? (
              <p className="text-[13px] text-slate-mid">No assessments yet. Import a markdown bank to start.</p>
            ) : (
              <ul className="space-y-1">
                {items.map((a) => (
                  <li key={a.id}>
                    <button
                      onClick={() => setSelectedId(a.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                        selectedId === a.id ? 'bg-white/10 border border-white/15' : 'border border-transparent hover:bg-white/5'
                      }`}
                    >
                      <p className="text-[13px] font-semibold text-[#f5f3ee] flex items-center gap-2">
                        {a.title}
                        <OwnerBadge institutionName={a.institutionName} />
                      </p>
                      <p className="text-[11px] text-slate-mid">
                        {a.questionCount} q · {a.sectionCount} sections · {a.deliveryCount} deliver{a.deliveryCount === 1 ? 'y' : 'ies'}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="min-w-0">
            {selectedId === 'import' ? (
              <ImportPanel
                getToken={getToken}
                seed={importSeed}
                owners={owners}
                onImported={async (id) => {
                  await refresh()
                  setSelectedId(id)
                }}
              />
            ) : !selectedId ? (
              <div className="bg-[#111111] rounded-xl border border-white/10 px-6 py-12 text-center">
                <p className="text-[13px] text-slate-mid">Select an assessment, or import a new one.</p>
              </div>
            ) : !detail ? (
              <p className="text-[13px] text-slate-mid">Loading…</p>
            ) : (
              <DetailPanel
                key={detail.id}
                getToken={getToken}
                detail={detail}
                canEdit={isAdmin || detail.institutionId !== null}
                cohorts={cohorts}
                onChange={async () => {
                  await Promise.all([refresh(), refreshDetail(detail.id)])
                }}
                onReimport={() => {
                  setImportSeed(detail.sourceMarkdown)
                  setSelectedId('import')
                }}
                onDeleted={async () => {
                  setSelectedId(null)
                  await refresh()
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Import ─────────────────────────────────────────────────────────────────

function ImportPanel({
  getToken,
  seed,
  owners,
  onImported,
}: {
  getToken: GetToken
  seed: string
  owners: OwnerOption[]
  onImported: (id: string) => Promise<void>
}) {
  const [markdown, setMarkdown] = useState(seed)
  const [ownerId, setOwnerId] = useState<string | null>(owners[0]?.id ?? null)
  useEffect(() => {
    if (!owners.some((o) => o.id === ownerId)) setOwnerId(owners[0]?.id ?? null)
  }, [owners, ownerId])
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const doPreview = async () => {
    setBusy('preview')
    setErr(null)
    setPreview(null)
    try {
      setPreview(await previewAssessment(getToken, markdown))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Preview failed')
    } finally {
      setBusy(null)
    }
  }

  const doImport = async () => {
    setBusy('import')
    setErr(null)
    try {
      const r = await importAssessment(getToken, markdown, ownerId)
      await onImported(r.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed')
      setBusy(null)
    }
  }

  const canImport = !!preview && preview.sqlErrors.length === 0

  return (
    <div className="bg-[#111111] rounded-xl border border-white/10 overflow-hidden">
      <div className="p-6 space-y-4">
        {owners.length > 1 && (
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">Owner</span>
            <select value={ownerId ?? ''} onChange={(e) => setOwnerId(e.target.value || null)} className={`${inputCls} mt-1`}>
              {owners.map((o) => (
                <option key={o.id ?? 'platform'} value={o.id ?? ''}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-white/40 mt-1">Only applies to a new slug — re-importing keeps the existing owner.</p>
          </label>
        )}
        <div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">Markdown</span>
          <textarea
            value={markdown}
            onChange={(e) => {
              setMarkdown(e.target.value)
              setPreview(null)
            }}
            spellCheck={false}
            rows={18}
            placeholder={'---\nslug: sql-fundamentals-v1\ntitle: SQL Fundamentals Pre/Post\ndataset: sql-fundamentals\ndraw: 4\n---\n\n## Section 1: Querying Basics\n\n**1.1 (MC)** …'}
            className={`${inputCls} mt-1 font-mono text-[12px] leading-relaxed`}
          />
          <p className="text-[11px] text-white/40 mt-1.5">
            Re-importing a bank with the same <span className="font-mono">slug</span> replaces it; existing deliveries and attempts are kept.
          </p>
        </div>

        {preview && (
          <div className="rounded-lg border border-white/10 bg-[#0d0d0d] p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <p className="text-[13px] font-semibold text-[#f5f3ee]">
                {preview.parsed.title} <span className="font-mono text-[11px] text-white/40 ml-2">{preview.parsed.slug}</span>
              </p>
              <p className="text-[11px] text-slate-mid">
                dataset <span className="font-mono">{preview.parsed.dataset}</span> · default draw {preview.parsed.defaultDraw ?? 'all'}
              </p>
            </div>
            <ul className="space-y-1">
              {preview.parsed.sections.map((s) => {
                const mc = s.questions.filter((q) => q.type === 'mc').length
                const sqlN = s.questions.length - mc
                return (
                  <li key={s.id} className="flex items-baseline justify-between font-mono text-[11px]">
                    <span className="text-[#f5f3ee]/85">
                      {s.number}. {s.title}
                    </span>
                    <span className="text-white/40">
                      {mc} mc · {sqlN} sql · draw {s.draw ?? 'all'}
                    </span>
                  </li>
                )
              })}
            </ul>
            {preview.sqlErrors.length > 0 && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-red-400 mb-1">Reference queries failed</p>
                <ul className="font-mono text-[11px] text-[#f5f3ee]/85 space-y-0.5">
                  {preview.sqlErrors.map((e) => (
                    <li key={e.questionId}>
                      {e.questionId}: {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.parsed.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-amber-400 mb-1">Warnings</p>
                <ul className="text-[11px] text-[#f5f3ee]/75 space-y-0.5">
                  {preview.parsed.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {err && <p className="text-[12px] text-red-400 font-mono whitespace-pre-wrap">{err}</p>}
      </div>
      <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-white/8 bg-[#0d0d0d]">
        <button
          onClick={doPreview}
          disabled={busy !== null || !markdown.trim()}
          className="px-3 py-1.5 rounded-md border border-white/15 hover:border-white/30 text-[12px] font-semibold text-[#f5f3ee] disabled:opacity-50 transition-colors"
        >
          {busy === 'preview' ? 'Checking…' : 'Preview'}
        </button>
        <button
          onClick={doImport}
          disabled={busy !== null || !canImport}
          title={canImport ? undefined : 'Preview first — every reference query must run cleanly'}
          className="px-3 py-1.5 rounded-md bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[12px] font-semibold text-white disabled:opacity-50 transition-colors"
        >
          {busy === 'import' ? 'Importing…' : 'Import'}
        </button>
      </div>
    </div>
  )
}

// ── Detail ─────────────────────────────────────────────────────────────────

function DetailPanel({
  getToken,
  detail,
  canEdit,
  cohorts,
  onChange,
  onReimport,
  onDeleted,
}: {
  getToken: GetToken
  detail: AssessmentDetail
  /** false = institution-admin viewing a platform bank: deliver it, but no re-import/delete. */
  canEdit: boolean
  cohorts: CohortOption[]
  onChange: () => Promise<void>
  onReimport: () => void
  onDeleted: () => Promise<void>
}) {
  const [showNew, setShowNew] = useState(false)
  const [resultsFor, setResultsFor] = useState<string | null>(null)
  const totalQ = detail.sections.reduce((n, s) => n + s.questions.length, 0)

  return (
    <div className="space-y-6">
      <div className="bg-[#111111] rounded-xl border border-white/10 p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-display font-bold text-[18px] text-[#f5f3ee] flex items-center gap-2">
              {detail.title}
              <OwnerBadge institutionName={detail.institutionName} />
            </h2>
            <p className="text-[12px] text-slate-mid mt-0.5">
              <span className="font-mono">{detail.slug}</span> · dataset {detail.dataset.name} · {totalQ} questions · imported{' '}
              {fmt(detail.updatedAt)}
            </p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-3 flex-shrink-0">
              <button onClick={onReimport} className="text-[11px] text-slate-mid hover:text-[#f5f3ee] transition-colors">
                Edit markdown →
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Delete "${detail.title}"? All deliveries and attempts go with it.`)) return
                  await deleteAssessment(getToken, detail.id)
                  await onDeleted()
                }}
                className="text-[11px] text-red-400/70 hover:text-red-400 transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {detail.sections.map((s) => {
            const mc = s.questions.filter((q) => q.type === 'mc').length
            return (
              <li key={s.id} className="bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2">
                <p className="text-[12px] font-semibold text-[#f5f3ee]">
                  {s.number}. {s.title}
                </p>
                <p className="font-mono text-[10px] text-white/40">
                  {mc} mc · {s.questions.length - mc} sql · draw {s.draw ?? 'all'}
                </p>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="bg-[#111111] rounded-xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">Deliveries</h3>
          <button onClick={() => setShowNew((v) => !v)} className="text-[12px] font-semibold text-green-light hover:text-green transition-colors">
            {showNew ? 'Cancel' : '+ Schedule delivery'}
          </button>
        </div>
        {showNew && (
          <NewDeliveryForm
            getToken={getToken}
            assessmentId={detail.id}
            cohorts={cohorts}
            onCreated={async () => {
              setShowNew(false)
              await onChange()
            }}
          />
        )}
        {detail.deliveries.length === 0 ? (
          <p className="text-[13px] text-slate-mid py-2">Not scheduled to any cohort yet.</p>
        ) : (
          <ul className="space-y-1">
            {detail.deliveries.map((d) => (
              <li key={d.id} className="border border-white/10 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#f5f3ee]">
                    <span className="uppercase tracking-widest text-[10px] text-[#2d9e5f] mr-2">{d.label}</span>
                    {d.cohort ? (
                      <>
                        {d.cohort.name} <span className="text-white/40 font-normal">· {d.cohort.institutionName}</span>
                      </>
                    ) : (
                      <span className="text-white/40 font-normal italic">cohort deleted — results kept</span>
                    )}
                  </p>
                  <p className="text-[11px] text-slate-mid">
                    {d.opensAt || d.closesAt ? `${fmt(d.opensAt)} → ${fmt(d.closesAt)}` : 'always open'}
                    {d.timeLimitMinutes && ` · ${d.timeLimitMinutes} min`} · {d.submittedCount}/{d.startedCount} submitted
                  </p>
                  <InviteLink getToken={getToken} deliveryId={d.id} code={d.inviteCode} onChange={onChange} />
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button
                    onClick={() => setResultsFor(resultsFor === d.id ? null : d.id)}
                    className="text-[11px] text-slate-mid hover:text-[#f5f3ee] transition-colors"
                  >
                    {resultsFor === d.id ? 'Hide results' : 'Results →'}
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm('Delete this delivery and every attempt on it?')) return
                      await deleteDelivery(getToken, d.id)
                      if (resultsFor === d.id) setResultsFor(null)
                      await onChange()
                    }}
                    className="text-[11px] text-red-400/70 hover:text-red-400 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {resultsFor && <ResultsPanel key={resultsFor} getToken={getToken} deliveryId={resultsFor} />}
    </div>
  )
}

/**
 * Invite link controls for one delivery. The link joins whoever opens it to
 * the cohort and starts their paper — treat it like a join key.
 */
function InviteLink({
  getToken,
  deliveryId,
  code,
  onChange,
}: {
  getToken: GetToken
  deliveryId: string
  code: string | null
  onChange: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const url = code ? `${window.location.origin}/a/${code}` : null

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      prompt('Copy the invite link:', url)
    }
  }

  return (
    <div className="mt-1.5 flex items-center gap-3 text-[11px]">
      {url ? (
        <>
          <span className="font-mono text-white/50 truncate max-w-[260px]" title={url}>
            {url}
          </span>
          <button onClick={copy} className="font-semibold text-green-light hover:text-green transition-colors flex-shrink-0">
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              if (!confirm('Revoke this invite link? Anyone who already joined keeps their attempt.')) return
              setBusy(true)
              try {
                await revokeInvite(getToken, deliveryId)
                await onChange()
              } finally {
                setBusy(false)
              }
            }}
            className="text-slate-mid hover:text-red-400 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            Revoke
          </button>
        </>
      ) : (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await createInvite(getToken, deliveryId)
              await onChange()
            } finally {
              setBusy(false)
            }
          }}
          className="font-semibold text-green-light hover:text-green disabled:opacity-50 transition-colors"
          title="Anyone with the link signs in, joins this cohort, and starts the paper"
        >
          {busy ? 'Creating…' : '+ Create invite link'}
        </button>
      )}
    </div>
  )
}

function NewDeliveryForm({
  getToken,
  assessmentId,
  cohorts,
  onCreated,
}: {
  getToken: GetToken
  assessmentId: string
  cohorts: CohortOption[]
  onCreated: () => Promise<void>
}) {
  const [cohortId, setCohortId] = useState(cohorts[0]?.id ?? '')
  const [label, setLabel] = useState('pre')
  const [opensAt, setOpensAt] = useState('')
  const [closesAt, setClosesAt] = useState('')
  const [timeLimit, setTimeLimit] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        setErr(null)
        setSubmitting(true)
        try {
          await createDelivery(getToken, assessmentId, {
            cohortId,
            label,
            opensAt: opensAt ? new Date(opensAt).toISOString() : null,
            closesAt: closesAt ? new Date(closesAt).toISOString() : null,
            timeLimitMinutes: timeLimit ? Number(timeLimit) : null,
          })
          await onCreated()
        } catch (e) {
          setErr(e instanceof Error ? e.message : 'Failed to schedule')
        } finally {
          setSubmitting(false)
        }
      }}
      className="bg-[#0a0a0a] rounded-lg border border-white/10 p-4 mb-3 grid grid-cols-1 sm:grid-cols-2 gap-3"
    >
      <label className="block sm:col-span-2">
        <span className="text-[11px] text-white/40">Cohort</span>
        <select value={cohortId} onChange={(e) => setCohortId(e.target.value)} className={`${inputCls} mt-1`} required>
          {cohorts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.institutionName} — {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-[11px] text-white/40">Label</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="pre / post" className={`${inputCls} mt-1`} required />
      </label>
      <label className="block">
        <span className="text-[11px] text-white/40">Time limit (minutes, optional)</span>
        <input value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} type="number" min={1} placeholder="e.g. 45" className={`${inputCls} mt-1`} />
      </label>
      <label className="block">
        <span className="text-[11px] text-white/40">Opens (optional)</span>
        <input value={opensAt} onChange={(e) => setOpensAt(e.target.value)} type="datetime-local" className={`${inputCls} mt-1`} />
      </label>
      <label className="block">
        <span className="text-[11px] text-white/40">Closes (optional)</span>
        <input value={closesAt} onChange={(e) => setClosesAt(e.target.value)} type="datetime-local" className={`${inputCls} mt-1`} />
      </label>
      {err && <p className="text-[12px] text-red-400 sm:col-span-2">{err}</p>}
      <div className="sm:col-span-2 flex justify-end">
        <button
          type="submit"
          disabled={submitting || !cohortId}
          className="px-3 py-1.5 rounded-md bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Scheduling…' : 'Schedule'}
        </button>
      </div>
    </form>
  )
}

function ResultsPanel({ getToken, deliveryId }: { getToken: GetToken; deliveryId: string }) {
  const [data, setData] = useState<DeliveryResults | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    getDeliveryResults(getToken, deliveryId)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load results'))
  }, [getToken, deliveryId])

  if (err) return <p className="text-[12px] text-red-400">{err}</p>
  if (!data) return <p className="text-[13px] text-slate-mid">Loading results…</p>

  const exportCsv = () => {
    downloadCsv({
      filename: `${data.delivery.assessmentTitle} — ${data.delivery.label} — ${data.delivery.cohortName}`,
      headers: ['Student', 'Email', 'Started', 'Submitted', 'Late', ...data.sections.map((s) => s.title), 'Overall %'],
      rows: data.attempts.map((a) => [
        a.displayName ?? '',
        a.email ?? '',
        a.startedAt,
        a.submittedAt ?? '',
        a.submittedLate ? 'yes' : '',
        ...data.sections.map((s) => {
          const sc = a.sectionScores?.find((x) => x.sectionId === s.id)
          return sc ? `${sc.correct}/${sc.total}` : ''
        }),
        a.overall?.percent ?? '',
      ]),
    })
  }

  return (
    <div className="bg-[#111111] rounded-xl border border-white/10 p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">
          Results · {data.delivery.label} · {data.delivery.cohortName}
        </h3>
        <button onClick={exportCsv} disabled={data.attempts.length === 0} className="text-[12px] font-semibold text-green-light hover:text-green disabled:opacity-40 transition-colors">
          Export CSV
        </button>
      </div>
      {data.attempts.length === 0 ? (
        <p className="text-[13px] text-slate-mid">No attempts yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-slate-mid">
                <th className="text-left py-2 pr-4 font-bold">Student</th>
                {data.sections.map((s) => (
                  <th key={s.id} className="text-right py-2 px-2 font-bold whitespace-nowrap" title={s.title}>
                    {s.title.length > 14 ? `${s.title.slice(0, 13)}…` : s.title}
                  </th>
                ))}
                <th className="text-right py-2 pl-4 font-bold">Overall</th>
              </tr>
            </thead>
            <tbody>
              {data.attempts.map((a) => (
                <tr key={a.attemptId} className="border-t border-white/5">
                  <td className="py-2 pr-4">
                    <p className="text-[#f5f3ee]">{a.displayName ?? a.email ?? a.userId}</p>
                    <p className="text-[11px] text-white/40">
                      {a.submittedAt ? `submitted ${fmt(a.submittedAt)}${a.submittedLate ? ' · late' : ''}` : 'in progress'}
                    </p>
                  </td>
                  {data.sections.map((s) => {
                    const sc = a.sectionScores?.find((x) => x.sectionId === s.id)
                    return (
                      <td key={s.id} className="text-right py-2 px-2 font-mono text-slate-light">
                        {sc ? `${sc.correct}/${sc.total}` : '—'}
                      </td>
                    )
                  })}
                  <td className="text-right py-2 pl-4 font-mono font-semibold text-[#f5f3ee]">
                    {a.overall ? `${a.overall.percent}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
