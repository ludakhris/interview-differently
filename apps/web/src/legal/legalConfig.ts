/**
 * Facts the legal pages state about the company. FILL THESE IN, get counsel
 * to review /terms and /privacy, then set LEGAL_REVIEW_PENDING to false —
 * that removes the "draft" banner from both pages. Placeholders are wrapped in
 * [brackets] so they are impossible to miss on the rendered page.
 */
export const LEGAL_REVIEW_PENDING = true

export const LEGAL = {
  companyName: '[COMPANY LEGAL NAME]',
  companyAddress: '[REGISTERED ADDRESS]',
  contactEmail: '[CONTACT EMAIL]',
  /** e.g. "the State of Delaware" — arbitration seat and governing law. */
  governingLaw: '[GOVERNING STATE / COUNTRY]',
  /** How long recordings are kept — must match RECORDING_RETENTION_DAYS on the API. */
  recordingRetentionDays: 90,
  /** Must match CONSENT_VERSIONS.* on the API (apps/api/src/consent/consent.versions.ts). */
  versions: { terms: '2026-09-30', privacy: '2026-09-30', recording: '2026-09-30' },
} as const
