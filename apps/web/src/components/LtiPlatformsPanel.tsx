import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useConfirm } from '@/components/ConfirmDialog'
import {
  canReject,
  canToggle,
  describeChange,
  enableConfirmCopy,
  formatDate,
  platformStatus,
  rejectConfirmCopy,
  sortPlatforms,
  type StatusTone,
} from '@/lib/ltiPlatforms'
import {
  listPlatformHistory,
  listPlatformsWithEndpoints,
  PlatformsApiError,
  rejectPlatform,
  setPlatformEnabled,
  type LtiPlatform,
  type PlatformChange,
  type ToolEndpointsResponse,
} from '@/services/ltiPlatformsService'

const CHIP: Record<StatusTone, string> = {
  on: 'bg-green/20 text-green-light',
  off: 'bg-ink/10 text-ink/60',
  waiting: 'bg-amber-400/15 text-amber-300',
  builtin: 'bg-ink/10 text-ink/60',
}

const FORBIDDEN = 'Only full administrators can manage platforms.'
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

/** The platform list: what an admin approves or switches off. Rendered by AdminLtiPlatformsPage. */
export function LtiPlatformsPanel({
  onHowItWorks,
  onEndpoints,
}: {
  /** Opens the "How this works" dialog; shown as a link in the empty state. */
  onHowItWorks?: () => void
  /** Called with the addresses the API sent, if it sent any. */
  onEndpoints?: (e: Partial<ToolEndpointsResponse>) => void
} = {}) {
  const [platforms, setPlatforms] = useState<LtiPlatform[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [announce, setAnnounce] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listPlatformsWithEndpoints()
      setPlatforms(res.platforms)
      if (res.endpoints) onEndpoints?.(res.endpoints)
    } catch (e) {
      setError(
        e instanceof PlatformsApiError && e.status === 403
          ? FORBIDDEN
          : message(e, 'Could not load the platforms.')
      )
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const replace = (updated: LtiPlatform) =>
    setPlatforms((list) => list?.map((p) => (p.id === updated.id ? updated : p)) ?? list)

  const remove = (removed: LtiPlatform) => {
    setPlatforms((list) => list?.filter((p) => p.id !== removed.id) ?? list)
    setAnnounce(`${removed.name} was rejected and removed.`)
    document.getElementById('platforms-heading')?.focus()
  }

  return (
    <div>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      {loading && !platforms ? (
        <p role="status" className="text-[13px] text-slate-mid">
          Loading platforms…
        </p>
      ) : error && !platforms ? (
        <div role="alert" className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3">
          <p className="text-[13px] text-red-400">{error}</p>
          {error !== FORBIDDEN && (
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 px-3 py-1.5 rounded-lg border border-red-400/30 text-[12px] font-semibold text-red-300 hover:bg-red-500/20 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      ) : platforms && platforms.length === 0 ? (
        <div className="rounded-xl border border-edge/10 bg-surface-alt px-6 py-12 text-center">
          <p className="text-[13px] text-slate-mid">
            No platforms yet. When a learning system registers itself it will appear here, switched
            off, waiting for you.
          </p>
          {onHowItWorks && (
            <button
              type="button"
              onClick={onHowItWorks}
              className="mt-3 text-[13px] font-semibold text-green-light hover:text-green underline underline-offset-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-light rounded"
            >
              How does this work?
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-4">
          {sortPlatforms(platforms ?? []).map((p) => (
            <li key={p.id}>
              <PlatformCard
                platform={p}
                onChanged={replace}
                onRemoved={remove}
                onAnnounce={setAnnounce}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PlatformCard({
  platform: p,
  onChanged,
  onRemoved,
  onAnnounce,
}: {
  platform: LtiPlatform
  onChanged: (p: LtiPlatform) => void
  onRemoved: (p: LtiPlatform) => void
  onAnnounce: (text: string) => void
}) {
  const confirm = useConfirm()
  const button = useRef<HTMLButtonElement>(null)
  const rejectButton = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const status = platformStatus(p)

  const toggle = async () => {
    setError(null)
    const turningOn = !p.enabled
    if (turningOn) {
      const ok = await confirm(enableConfirmCopy(p))
      if (!ok) {
        button.current?.focus()
        return
      }
    }
    setBusy(true)
    try {
      onChanged(await setPlatformEnabled(p.id, turningOn))
      onAnnounce(`${p.name} is now ${turningOn ? 'on' : 'off'}.`)
    } catch (e) {
      setError(message(e, 'That did not work. Try again.'))
    } finally {
      setBusy(false)
      button.current?.focus()
    }
  }

  const reject = async () => {
    setError(null)
    if (!(await confirm({ ...rejectConfirmCopy(p), danger: true }))) {
      rejectButton.current?.focus()
      return
    }
    setBusy(true)
    try {
      await rejectPlatform(p.id)
      onRemoved(p)
    } catch (e) {
      setError(message(e, 'That did not work. Try again.'))
      setBusy(false)
      rejectButton.current?.focus()
    }
  }

  return (
    <article
      aria-labelledby={`platform-${p.id}`}
      className={`rounded-xl border bg-surface-alt p-4 sm:p-5 ${
        status.tone === 'waiting' ? 'border-amber-400/40' : 'border-edge/10'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2 flex-wrap">
          <h2 id={`platform-${p.id}`} className="font-display font-bold text-[16px] text-fg">
            {p.name}
          </h2>
          <span
            className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${CHIP[status.tone]}`}
          >
            {status.label}
          </span>
          {p.source === 'built-in' && (
            <span className="text-[13px] text-ink/70">Always on, cannot be changed</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canReject(p) && (
            <button
              ref={rejectButton}
              type="button"
              disabled={busy}
              aria-describedby={`platform-${p.id}`}
              onClick={() => void reject()}
              className="px-4 py-2 rounded-lg border border-red-400/30 text-[13px] font-semibold text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-light"
            >
              Reject
            </button>
          )}
          {canToggle(p) && (
            <button
              ref={button}
              type="button"
              disabled={busy}
              aria-describedby={`platform-${p.id}`}
              onClick={() => void toggle()}
              className={`px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-light ${
                p.enabled
                  ? 'border border-edge/15 text-ink/70 hover:text-ink hover:border-edge/30'
                  : 'bg-green hover:bg-green-light text-on-primary'
              }`}
            >
              {busy ? 'Saving…' : p.enabled ? 'Disable' : 'Enable'}
            </button>
          )}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-[12px]">
        <Row label="Issuer" value={p.issuer} mono />
        <Row label="Client id" value={p.clientId} mono />
        <Row label="Deployment id" value={p.deploymentId} mono />
        {p.source === 'registered' && <Row label="Registered" value={formatDate(p.createdAt)} />}
      </dl>

      {error && (
        <p role="alert" className="mt-3 text-[12px] text-red-400">
          {error}
        </p>
      )}

      <History platform={p} />
    </article>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value) return null
  return (
    <>
      <dt className="text-slate-mid sm:py-0.5">{label}</dt>
      <dd className={`text-ink/80 break-all mb-1 sm:mb-0 sm:py-0.5 ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </>
  )
}

function History({ platform }: { platform: LtiPlatform }) {
  const [open, setOpen] = useState(false)
  const [changes, setChanges] = useState<PlatformChange[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const panelId = useId()

  const load = useCallback(async () => {
    setError(null)
    try {
      setChanges(await listPlatformHistory(platform.id))
    } catch (e) {
      setError(message(e, 'Could not load the history.'))
    }
  }, [platform.id])

  // Fetch when opened, and again whenever the platform is switched while it is open.
  useEffect(() => {
    if (open) void load()
  }, [open, load, platform.enabled])

  return (
    <div className="mt-3 border-t border-edge/10 pt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="text-[12px] font-semibold text-green-light hover:text-green transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-light rounded"
      >
        {open ? 'Hide history' : 'Show history'}
      </button>
      <div id={panelId} hidden={!open} className="mt-2">
        {open &&
          (error ? (
            <div role="alert" className="text-[12px] text-red-400">
              {error}{' '}
              <button type="button" onClick={() => void load()} className="underline font-semibold">
                Retry
              </button>
            </div>
          ) : !changes ? (
            <p role="status" className="text-[12px] text-slate-mid">
              Loading history…
            </p>
          ) : changes.length === 0 ? (
            <p className="text-[12px] text-slate-mid">Nothing has changed yet.</p>
          ) : (
            <ul className="space-y-1">
              {changes.map((c) => (
                <li key={c.id} className="text-[12px] text-ink/70">
                  {describeChange(c)}
                  <span className="text-slate-mid"> · {formatDate(c.createdAt)}</span>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  )
}
