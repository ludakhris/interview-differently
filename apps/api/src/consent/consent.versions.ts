/**
 * Current version of each legal document users must accept. Bump the string
 * when the document changes materially — every user is then re-prompted
 * (ConsentGate on the web compares against these). Keep in step with the
 * "Last updated" date on the matching web page.
 */
export const CONSENT_VERSIONS = {
  terms: '2026-09-30',
  privacy: '2026-09-30',
  recording: '2026-09-30',
} as const

export type ConsentKind = keyof typeof CONSENT_VERSIONS

export const CONSENT_KINDS = Object.keys(CONSENT_VERSIONS) as ConsentKind[]
