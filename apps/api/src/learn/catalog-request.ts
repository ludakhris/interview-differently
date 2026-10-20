import type { CatalogFunding, CatalogIntake } from './learn-types'

/** #124: the short intake a learner fills in when requesting a program from an agency's public catalog. */

const FUNDING: CatalogFunding[] = ['wioa', 'dvr', 'employer', 'self', 'unsure']
const MAX = 500

function text(v: unknown, max = MAX): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().slice(0, max)
  return t ? t : null
}

/** The intake to store, or a plain-words reason it cannot be accepted. */
export function parseCatalogIntake(
  body: unknown
): { ok: true; intake: CatalogIntake } | { ok: false; reason: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const phone = text(b.phone, 1000)
  if (!phone || !/^[0-9()+.\-\s]{7,40}$/.test(phone)) {
    return { ok: false, reason: 'Enter a phone number staff can call you on.' }
  }
  const education = text(b.education, 80)
  if (!education) return { ok: false, reason: 'Choose your highest education.' }
  if (b.employment !== 'employed' && b.employment !== 'not-employed') {
    return { ok: false, reason: 'Say whether you are working now.' }
  }
  if (!FUNDING.includes(b.funding as CatalogFunding)) {
    return { ok: false, reason: 'Choose how you plan to pay.' }
  }
  return {
    ok: true,
    intake: {
      phone,
      education,
      employment: b.employment,
      employer: b.employment === 'employed' ? text(b.employer, 200) : null,
      funding: b.funding as CatalogFunding,
      language: text(b.language, 60),
      reason: text(b.reason),
    },
  }
}

/** The stored intake as it was saved, or null for a join-code request. Lenient, so a later rule change never hides answers. */
export function readCatalogIntake(value: unknown): CatalogIntake | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  const str = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : null)
  return {
    phone: str('phone') ?? '',
    education: str('education') ?? '',
    employment: v.employment === 'employed' ? 'employed' : 'not-employed',
    employer: str('employer'),
    funding: (FUNDING.includes(v.funding as CatalogFunding)
      ? v.funding
      : 'unsure') as CatalogFunding,
    language: str('language'),
    reason: str('reason'),
  }
}
