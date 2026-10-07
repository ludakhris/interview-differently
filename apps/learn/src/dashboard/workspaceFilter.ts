import type { LearnWorkspace } from '@id/types'

export type KindFilter = 'all' | 'agency' | 'provider' | 'organization'

/** The name a person knows a workspace type by; colleges count as organizations. */
export const kindOf = (kind: string): Exclude<KindFilter, 'all'> =>
  kind === 'agency' ? 'agency' : kind === 'provider' ? 'provider' : 'organization'

type Searchable = LearnWorkspace & { parentName?: string | null }

/** Whether the words typed all appear in a workspace's name, address, type or agency. */
export function textMatch(w: Searchable, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = [w.name, w.subdomain, kindOf(w.kind), w.parentName ?? ''].join(' ').toLowerCase()
  return words.every((word) => hay.includes(word))
}

/**
 * What the chooser shows for a search: each agency with the workspaces under it that match, an
 * agency kept for context when something under it matches, and everything under an agency whose
 * own name matches (the type filter still applies). Anything without an agency in the list is
 * returned separately.
 */
export function filterWorkspaces<T extends Searchable>(
  list: T[],
  query: string,
  kind: KindFilter
): { trees: { agency: T; kids: T[] }[]; standalone: T[]; shown: number } {
  const kindOk = (w: T) => kind === 'all' || kindOf(w.kind) === kind
  const agencies = list.filter((w) => w.kind === 'agency')
  const agencyIds = new Set(agencies.map((a) => a.id))
  const trees = agencies
    .map((agency) => {
      const ownHit = textMatch(agency, query)
      const kids = list.filter(
        (w) => w.parentId === agency.id && kindOk(w) && (ownHit || textMatch(w, query))
      )
      return { agency, kids, keep: (kindOk(agency) && ownHit) || kids.length > 0 }
    })
    .filter((t) => t.keep)
    .map(({ agency, kids }) => ({ agency, kids }))
  const standalone = list.filter(
    (w) =>
      w.kind !== 'agency' && !agencyIds.has(w.parentId ?? '') && kindOk(w) && textMatch(w, query)
  )
  const shown =
    trees.reduce((n, t) => n + t.kids.length + (kindOk(t.agency) ? 1 : 0), 0) + standalone.length
  return { trees, standalone, shown }
}
