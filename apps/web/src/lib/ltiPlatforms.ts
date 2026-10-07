import type { LtiPlatform, PlatformChange } from '@/services/ltiPlatformsService'

export type StatusTone = 'on' | 'off' | 'waiting' | 'builtin'

/** The status chip for a platform. The built-in platform is always on and not editable. */
export function platformStatus(p: Pick<LtiPlatform, 'enabled' | 'source' | 'approvedAt'>): {
  label: string
  tone: StatusTone
} {
  if (p.source === 'built-in') return { label: 'Built in', tone: 'builtin' }
  if (p.enabled) return { label: 'On', tone: 'on' }
  return p.approvedAt === null
    ? { label: 'Waiting for approval', tone: 'waiting' }
    : { label: 'Off', tone: 'off' }
}

export function canToggle(p: Pick<LtiPlatform, 'source'>): boolean {
  return p.source !== 'built-in'
}

/** A platform can be rejected only while it is waiting for approval. */
export function canReject(p: Pick<LtiPlatform, 'enabled' | 'source' | 'approvedAt'>): boolean {
  return platformStatus(p).tone === 'waiting'
}

export function rejectConfirmCopy(p: Pick<LtiPlatform, 'name'>) {
  return {
    title: `Reject ${p.name}?`,
    body: 'It will be removed and would have to register again.',
    confirmLabel: 'Reject',
  }
}

/** Title and body of the confirm step; enabling states exactly who is being trusted. */
export function enableConfirmCopy(p: Pick<LtiPlatform, 'name' | 'issuer' | 'approvedAt'>) {
  const never = p.approvedAt === null ? `${p.name} has never been approved. ` : ''
  return {
    title: `Switch on ${p.name}?`,
    body: `${never}Learners will be able to launch Interview Differently from ${p.issuer}. Only continue if you trust that address.`,
    confirmLabel: 'Switch on',
  }
}

/** One plain-language line, e.g. "Chow switched it on". */
export function describeChange(c: Pick<PlatformChange, 'action' | 'userName'>): string {
  const who = c.userName?.trim() || null
  switch (c.action) {
    case 'created':
      return who ? `${who} added it` : 'It registered itself'
    case 'enabled':
      return `${who ?? 'Someone'} switched it on`
    case 'disabled':
      return `${who ?? 'Someone'} switched it off`
    case 'rejected':
      return `${who ?? 'Someone'} rejected it`
    case 'updated':
      return `${who ?? 'Someone'} changed its details`
    default:
      return `${who ?? 'Someone'} made a change`
  }
}

/** "7 Oct 2026"; empty for a missing or unparseable date. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Platforms waiting for approval first; otherwise the order the API gave. */
export function sortPlatforms<T extends Pick<LtiPlatform, 'enabled' | 'source' | 'approvedAt'>>(
  list: T[]
): T[] {
  const waiting = (p: T) => platformStatus(p).tone === 'waiting'
  return [...list.filter(waiting), ...list.filter((p) => !waiting(p))]
}
