import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ClerkService } from '../auth/clerk.service'

/**
 * Endpoints scoped to the calling user.
 *
 * The User mirror table caches each Clerk user's email + displayName so
 * analytics / cohort views don't have to round-trip to Clerk for every
 * lookup. The frontend calls /me/sync once on sign-in to make sure the
 * row exists and is fresh.
 *
 * Self-join (Phase 6b) endpoints let a freshly-signed-up student look up
 * their institution by email domain and create a Membership for themselves
 * — either via that suggestion or by entering a cohort joinKey.
 *
 * Domain matching is suffix-based (#14): an institution registered for
 * "harvard.edu" matches both "me@harvard.edu" and "me@cs.harvard.edu",
 * with longest match winning. Cohort joinKeys are unique per-institution,
 * so two schools can both have a "fall2026" cohort.
 */
@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name)

  constructor(
    private prisma: PrismaService,
    private clerk: ClerkService,
  ) {}

  /**
   * Upserts the calling user's row in the User mirror with the latest
   * email + display name from Clerk. Idempotent — safe to call on every
   * sign-in.
   */
  async sync(userId: string) {
    const profile = await this.clerk.getUserProfile(userId)
    const data = {
      email: profile?.email ?? null,
      displayName: profile?.displayName ?? null,
    }
    const row = await this.prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, ...data },
      update: data,
    })
    return { id: row.id, email: row.email, displayName: row.displayName }
  }

  /**
   * Returns the Institution that best matches the caller's email domain,
   * or null. Match rules:
   *   - "Best" = longest emailDomain that is a suffix of the caller's
   *     domain (so "law.harvard.edu" beats "harvard.edu" for that user)
   *   - Tie-break: most recently created institution wins
   *   - We never match the bare TLD ("edu" alone is excluded)
   *
   * We fetch the email straight from Clerk rather than relying on the User
   * mirror — the welcome page may run before /me/sync completes on first
   * login, and the mirror's email is allowed to be stale.
   */
  async getInstitutionSuggestion(userId: string) {
    const profile = await this.clerk.getUserProfile(userId)
    const domain = extractDomain(profile?.email)
    if (!domain) return { institution: null, email: profile?.email ?? null }

    const candidates = candidateDomains(domain)
    if (candidates.length === 0) return { institution: null, email: profile?.email ?? null }

    const matches = await this.prisma.institution.findMany({
      where: { emailDomain: { in: candidates } },
      select: { id: true, name: true, emailDomain: true, createdAt: true },
    })

    const best = pickBestDomainMatch(matches)
    return {
      institution: best ? { id: best.id, name: best.name, emailDomain: best.emailDomain } : null,
      email: profile?.email ?? null,
    }
  }

  /**
   * Returns all memberships for the caller, with institution + cohort
   * details — used by the welcome page to short-circuit if the user
   * already joined, and by the dashboard CTA to know whether to show.
   */
  async listMemberships(userId: string) {
    const rows = await this.prisma.membership.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: {
        institution: { select: { id: true, name: true } },
        cohort: { select: { id: true, name: true } },
      },
    })
    return rows.map((m) => ({
      membershipId: m.id,
      institution: m.institution,
      cohort: m.cohort,
      joinedAt: m.createdAt,
    }))
  }

  /**
   * Creates a Membership for the caller. Two modes:
   *   - { joinKey } — find the cohort with that key, join its institution + cohort
   *   - { institutionId } — join the institution with no cohort (used when the
   *                        student matches by email domain but has no key)
   *
   * Always upserts the User mirror first so the FK is satisfied — the user
   * may not have hit /me/sync yet on a brand-new signup.
   *
   * joinKey is per-institution unique now (#14), so a key may match cohorts
   * in multiple institutions. We disambiguate by preferring the cohort whose
   * institution matches the caller's email domain. If still ambiguous, we
   * 409 with the candidate institution names so the UI can ask the user.
   */
  async join(userId: string, input: { joinKey?: string; institutionId?: string }) {
    await this.sync(userId)

    let institutionId: string
    let cohortId: string | null = null

    if (input.joinKey?.trim()) {
      const key = input.joinKey.trim()
      const matches = await this.prisma.cohort.findMany({
        where: { joinKey: key },
        include: { institution: { select: { id: true, name: true, emailDomain: true } } },
      })
      if (matches.length === 0) {
        throw new NotFoundException(`No cohort found for join key "${key}"`)
      }
      const chosen = matches.length === 1 ? matches[0] : await this.disambiguateCohorts(userId, matches)
      institutionId = chosen.institutionId
      cohortId = chosen.id
    } else if (input.institutionId) {
      const inst = await this.prisma.institution.findUnique({
        where: { id: input.institutionId },
        select: { id: true },
      })
      if (!inst) throw new NotFoundException(`Institution ${input.institutionId} not found`)
      institutionId = inst.id
    } else {
      throw new BadRequestException('Provide either joinKey or institutionId')
    }

    try {
      const membership = await this.prisma.membership.create({
        data: { userId, institutionId, cohortId },
      })
      return { membershipId: membership.id, institutionId, cohortId }
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('You are already a member of this cohort')
      }
      throw err
    }
  }

  /**
   * Lets the calling user remove their own Membership row. Verifies
   * ownership before deleting — a user can't delete someone else's
   * membership from this endpoint (admins use the cohort endpoint).
   */
  async leave(userId: string, membershipId: string): Promise<void> {
    const m = await this.prisma.membership.findUnique({ where: { id: membershipId } })
    if (!m || m.userId !== userId) {
      throw new NotFoundException(`Membership ${membershipId} not found`)
    }
    await this.prisma.membership.delete({ where: { id: membershipId } })
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  /**
   * Picks one cohort from a set of joinKey-collisions: prefers the cohort
   * whose institution matches the caller's email domain. If no domain match
   * exists (or the user has no email on record), we 409 with the candidate
   * institution names so the UI can ask the user to specify.
   */
  private async disambiguateCohorts(
    userId: string,
    matches: Array<{
      id: string
      institutionId: string
      institution: { id: string; name: string; emailDomain: string | null }
    }>,
  ) {
    const profile = await this.clerk.getUserProfile(userId)
    const domain = extractDomain(profile?.email)
    if (domain) {
      const candidates = candidateDomains(domain)
      const domainMatch = matches.find(
        (c) => c.institution.emailDomain && candidates.includes(c.institution.emailDomain),
      )
      if (domainMatch) return domainMatch
    }
    const names = matches.map((c) => c.institution.name).join(', ')
    throw new ConflictException(
      `That join key is used by multiple institutions (${names}). Ask your admin which to join.`,
    )
  }
}

// ── domain helpers ────────────────────────────────────────────────────────

function extractDomain(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.indexOf('@')
  if (at < 0 || at === email.length - 1) return null
  return email.slice(at + 1).trim().toLowerCase()
}

/**
 * Returns all candidate domain strings to look up for a given email domain,
 * ordered longest (most specific) first. Stops at 2 segments to avoid the
 * bare-TLD case (we'd never want a "edu" institution to match every .edu
 * student).
 *
 *   "cs.law.harvard.edu" → ["cs.law.harvard.edu", "law.harvard.edu", "harvard.edu"]
 *   "harvard.edu"        → ["harvard.edu"]
 *   "edu"                → []
 *   "localhost"          → []
 */
function candidateDomains(domain: string): string[] {
  const parts = domain.split('.').filter(Boolean)
  if (parts.length < 2) return []
  const result: string[] = []
  for (let i = 0; i <= parts.length - 2; i++) {
    result.push(parts.slice(i).join('.'))
  }
  return result
}

/**
 * Picks the best institution match from a candidate set:
 *   1. Longest emailDomain wins (most specific)
 *   2. Among ties on length: most recently created
 */
function pickBestDomainMatch<T extends { emailDomain: string | null; createdAt: Date }>(
  matches: T[],
): T | null {
  if (matches.length === 0) return null
  return [...matches].sort((a, b) => {
    const lenA = a.emailDomain?.length ?? 0
    const lenB = b.emailDomain?.length ?? 0
    if (lenA !== lenB) return lenB - lenA
    return b.createdAt.getTime() - a.createdAt.getTime()
  })[0]
}
