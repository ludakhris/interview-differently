import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import {
  addCohortMember,
  createCohort,
  createInstitution,
  deleteCohort,
  deleteInstitution,
  getInstitution,
  listCohortMembers,
  listInstitutions,
  removeCohortMember,
  type Cohort,
  type CohortMember,
  type Institution,
  type InstitutionDetail,
} from '@/services/institutionsService'

/**
 * Admin page for managing institutions, cohorts, and cohort members.
 *
 * Layout: master-detail. Left column lists institutions; selecting one loads
 * its cohorts on the right, and selecting a cohort expands its members
 * inline. Everything is single-page so an admin can rename, add, and remove
 * without route changes.
 */

export function AdminInstitutionsPage() {
  const { getToken } = useAuth()
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<InstitutionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const refreshInstitutions = useCallback(async () => {
    setError(null)
    try {
      const list = await listInstitutions(getToken)
      setInstitutions(list)
      // If selected disappeared, deselect.
      if (selectedId && !list.find((i) => i.id === selectedId)) {
        setSelectedId(null)
        setDetail(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load institutions')
    }
  }, [getToken, selectedId])

  const refreshDetail = useCallback(
    async (id: string) => {
      setError(null)
      try {
        const d = await getInstitution(getToken, id)
        setDetail(d)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load institution')
      }
    },
    [getToken],
  )

  useEffect(() => {
    setLoading(true)
    refreshInstitutions().finally(() => setLoading(false))
  }, [refreshInstitutions])

  useEffect(() => {
    if (!selectedId) {
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
          <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-1">Admin</p>
          <h1 className="font-display font-extrabold text-[24px] text-[#f5f3ee] tracking-tight">
            Institutions &amp; Cohorts
          </h1>
          <p className="text-[13px] text-slate-mid mt-1">
            Group students into institutions and cohorts. Powers the upcoming analytics dashboards.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 mb-4">
            <p className="text-[13px] text-red-400">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
          {/* ── Institution list ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">
                Institutions
              </h2>
              <button
                onClick={() => setShowCreate((v) => !v)}
                className="text-[12px] font-semibold text-green-light hover:text-green transition-colors"
              >
                {showCreate ? 'Cancel' : '+ New'}
              </button>
            </div>

            {showCreate && (
              <NewInstitutionForm
                onCancel={() => setShowCreate(false)}
                onCreated={async (created) => {
                  setShowCreate(false)
                  await refreshInstitutions()
                  setSelectedId(created.id)
                }}
                getToken={getToken}
              />
            )}

            {loading ? (
              <p className="text-[13px] text-slate-mid">Loading…</p>
            ) : institutions.length === 0 ? (
              <p className="text-[13px] text-slate-mid">No institutions yet. Create one to get started.</p>
            ) : (
              <ul className="space-y-1">
                {institutions.map((inst) => (
                  <li key={inst.id}>
                    <button
                      onClick={() => setSelectedId(inst.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                        selectedId === inst.id
                          ? 'bg-white/10 border border-white/15'
                          : 'border border-transparent hover:bg-white/5'
                      }`}
                    >
                      <p className="text-[13px] font-semibold text-[#f5f3ee]">{inst.name}</p>
                      <p className="text-[11px] text-slate-mid">
                        {inst.emailDomain && <>{inst.emailDomain} · </>}
                        {inst.cohortCount} cohort{inst.cohortCount !== 1 ? 's' : ''} ·{' '}
                        {inst.memberCount} member{inst.memberCount !== 1 ? 's' : ''}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Detail pane ── */}
          <div>
            {!selectedId ? (
              <div className="bg-[#111111] rounded-xl border border-white/10 px-6 py-12 text-center">
                <p className="text-[13px] text-slate-mid">Select an institution to manage its cohorts.</p>
              </div>
            ) : !detail ? (
              <p className="text-[13px] text-slate-mid">Loading…</p>
            ) : (
              <InstitutionDetailView
                detail={detail}
                getToken={getToken}
                onChange={async () => {
                  await Promise.all([refreshInstitutions(), refreshDetail(detail.id)])
                }}
                onDeleted={async () => {
                  setSelectedId(null)
                  setDetail(null)
                  await refreshInstitutions()
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────────────────

function NewInstitutionForm({
  onCancel,
  onCreated,
  getToken,
}: {
  onCancel: () => void
  onCreated: (created: Institution) => void
  getToken: () => Promise<string | null>
}) {
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        setErr(null)
        setSubmitting(true)
        try {
          const created = await createInstitution(getToken, {
            name,
            emailDomain: domain.trim() || null,
          })
          // Backend doesn't return the count fields on create, normalise here.
          onCreated({ ...created, cohortCount: 0, memberCount: 0 } as Institution)
          setName('')
          setDomain('')
        } catch (e) {
          setErr(e instanceof Error ? e.message : 'Failed to create')
        } finally {
          setSubmitting(false)
        }
      }}
      className="bg-[#111111] rounded-xl border border-white/10 p-3 mb-3 space-y-2"
    >
      <input
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Institution name"
        className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-[#f5f3ee] placeholder:text-white/25 focus:outline-none focus:border-white/30"
      />
      <input
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        placeholder="Email domain (optional, e.g. harvard.edu)"
        className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-[#f5f3ee] placeholder:text-white/25 focus:outline-none focus:border-white/30"
      />
      <p className="text-[11px] text-white/40 leading-relaxed px-1">
        Leave blank if students don't share an email domain — they'll join via the cohort key instead.
      </p>
      {err && <p className="text-[12px] text-red-400">{err}</p>}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="text-[12px] text-slate-mid hover:text-[#f5f3ee]">
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-1.5 rounded-md bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create'}
        </button>
      </div>
    </form>
  )
}

function InstitutionDetailView({
  detail,
  getToken,
  onChange,
  onDeleted,
}: {
  detail: InstitutionDetail
  getToken: () => Promise<string | null>
  onChange: () => Promise<void>
  onDeleted: () => Promise<void>
}) {
  const [showNewCohort, setShowNewCohort] = useState(false)
  const [expandedCohort, setExpandedCohort] = useState<string | null>(null)

  return (
    <div className="bg-[#111111] rounded-xl border border-white/10 p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="font-display font-bold text-[18px] text-[#f5f3ee]">{detail.name}</h2>
          <p className="text-[12px] text-slate-mid">
            {detail.emailDomain ? <>{detail.emailDomain} · </> : <span className="italic">no email domain · </span>}
            {detail.memberCount} member{detail.memberCount !== 1 ? 's' : ''} total
          </p>
        </div>
        <button
          onClick={async () => {
            if (!confirm(`Delete "${detail.name}" and all its cohorts? This cannot be undone.`)) return
            try {
              await deleteInstitution(getToken, detail.id)
              await onDeleted()
            } catch (e) {
              alert(e instanceof Error ? e.message : 'Failed to delete')
            }
          }}
          className="text-[11px] text-red-400/70 hover:text-red-400 transition-colors"
        >
          Delete institution
        </button>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">Cohorts</h3>
        <button
          onClick={() => setShowNewCohort((v) => !v)}
          className="text-[12px] font-semibold text-green-light hover:text-green transition-colors"
        >
          {showNewCohort ? 'Cancel' : '+ New cohort'}
        </button>
      </div>

      {showNewCohort && (
        <NewCohortForm
          getToken={getToken}
          institutionId={detail.id}
          onCancel={() => setShowNewCohort(false)}
          onCreated={async () => {
            setShowNewCohort(false)
            await onChange()
          }}
        />
      )}

      {detail.cohorts.length === 0 ? (
        <p className="text-[13px] text-slate-mid py-3">No cohorts yet.</p>
      ) : (
        <ul className="space-y-1">
          {detail.cohorts.map((c) => (
            <li key={c.id}>
              <CohortRow
                cohort={c}
                expanded={expandedCohort === c.id}
                onToggle={() => setExpandedCohort(expandedCohort === c.id ? null : c.id)}
                getToken={getToken}
                onChange={onChange}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NewCohortForm({
  institutionId,
  onCancel,
  onCreated,
  getToken,
}: {
  institutionId: string
  onCancel: () => void
  onCreated: () => Promise<void>
  getToken: () => Promise<string | null>
}) {
  const [name, setName] = useState('')
  const [joinKey, setJoinKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        setErr(null)
        setSubmitting(true)
        try {
          await createCohort(getToken, institutionId, { name, joinKey: joinKey.trim() || null })
          await onCreated()
          setName('')
          setJoinKey('')
        } catch (e) {
          setErr(e instanceof Error ? e.message : 'Failed to create cohort')
        } finally {
          setSubmitting(false)
        }
      }}
      className="bg-[#0a0a0a] rounded-lg border border-white/10 p-3 mb-3 space-y-2"
    >
      <input
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Cohort name (e.g. Fall 2026)"
        className="w-full bg-[#111111] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-[#f5f3ee] placeholder:text-white/25 focus:outline-none focus:border-white/30"
      />
      <input
        value={joinKey}
        onChange={(e) => setJoinKey(e.target.value)}
        placeholder="Join key (optional, for student self-join)"
        className="w-full bg-[#111111] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-[#f5f3ee] placeholder:text-white/25 focus:outline-none focus:border-white/30"
      />
      <p className="text-[11px] text-white/40 leading-relaxed px-1">
        Per-institution — other institutions can use the same key without colliding.
      </p>
      {err && <p className="text-[12px] text-red-400">{err}</p>}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="text-[12px] text-slate-mid hover:text-[#f5f3ee]">
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-1.5 rounded-md bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create'}
        </button>
      </div>
    </form>
  )
}

function CohortRow({
  cohort,
  expanded,
  onToggle,
  getToken,
  onChange,
}: {
  cohort: Cohort
  expanded: boolean
  onToggle: () => void
  getToken: () => Promise<string | null>
  onChange: () => Promise<void>
}) {
  const [members, setMembers] = useState<CohortMember[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const refreshMembers = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const ms = await listCohortMembers(getToken, cohort.id)
      setMembers(ms)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }, [getToken, cohort.id])

  useEffect(() => {
    if (expanded && members === null) refreshMembers()
  }, [expanded, members, refreshMembers])

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
      >
        <div>
          <p className="text-[13px] font-semibold text-[#f5f3ee]">{cohort.name}</p>
          <p className="text-[11px] text-slate-mid">
            {cohort.memberCount} member{cohort.memberCount !== 1 ? 's' : ''}
            {cohort.joinKey && <> · join key: <span className="font-mono">{cohort.joinKey}</span></>}
          </p>
        </div>
        <span className="text-[12px] text-slate-mid">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="border-t border-white/10 p-4 bg-[#0a0a0a]">
          <AddMemberForm
            getToken={getToken}
            cohortId={cohort.id}
            onAdded={async () => {
              await refreshMembers()
              await onChange()
            }}
          />

          {err && <p className="text-[12px] text-red-400 mt-2">{err}</p>}

          {loading ? (
            <p className="text-[12px] text-slate-mid mt-3">Loading members…</p>
          ) : !members || members.length === 0 ? (
            <p className="text-[12px] text-slate-mid mt-3">No members yet.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {members.map((m) => (
                <li
                  key={m.membershipId}
                  className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
                >
                  <div>
                    <p className="text-[13px] text-[#f5f3ee]">{m.displayName ?? m.email ?? m.userId}</p>
                    {m.email && m.displayName && <p className="text-[11px] text-slate-mid">{m.email}</p>}
                  </div>
                  <button
                    onClick={async () => {
                      if (!confirm('Remove this member from the cohort?')) return
                      try {
                        await removeCohortMember(getToken, cohort.id, m.membershipId)
                        await refreshMembers()
                        await onChange()
                      } catch (e) {
                        alert(e instanceof Error ? e.message : 'Failed to remove')
                      }
                    }}
                    className="text-[11px] text-slate-mid hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 pt-3 border-t border-white/5 flex justify-end">
            <button
              onClick={async () => {
                if (!confirm(`Delete cohort "${cohort.name}"? Members will lose this cohort tag (the users themselves are not deleted).`)) return
                try {
                  await deleteCohort(getToken, cohort.id)
                  await onChange()
                } catch (e) {
                  alert(e instanceof Error ? e.message : 'Failed to delete')
                }
              }}
              className="text-[11px] text-red-400/70 hover:text-red-400 transition-colors"
            >
              Delete cohort
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AddMemberForm({
  cohortId,
  onAdded,
  getToken,
}: {
  cohortId: string
  onAdded: () => Promise<void>
  getToken: () => Promise<string | null>
}) {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  return (
    <div>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setErr(null)
          setSubmitting(true)
          try {
            await addCohortMember(getToken, cohortId, { email })
            setEmail('')
            await onAdded()
          } catch (e) {
            setErr(e instanceof Error ? e.message : 'Failed to add member')
          } finally {
            setSubmitting(false)
          }
        }}
        className="flex items-center gap-2"
      >
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Add by email (user must have signed in once)"
          className="flex-1 bg-[#111111] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-[#f5f3ee] placeholder:text-white/25 focus:outline-none focus:border-white/30"
        />
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-2 rounded-md bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[12px] font-semibold text-white disabled:opacity-50 whitespace-nowrap"
        >
          {submitting ? 'Adding…' : 'Add'}
        </button>
      </form>
      {err && <p className="text-[11px] text-red-400 mt-2">{err}</p>}
    </div>
  )
}
