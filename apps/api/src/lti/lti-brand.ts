/**
 * Brand tokens v1: how a tenant (the launching platform) tells a tool what to look like.
 * One validator shared by both sides of an LTI launch; it imports nothing from the project.
 * It never throws: anything unusable yields `null` (a missing or invalid name drops the whole
 * brand), and any other invalid or unknown field is dropped.
 */

export interface LtiBrand {
  name: string
  logoUrl?: string
  scheme?: 'light' | 'dark'
  primary?: string
  accent?: string
  surface?: string
  surfaceAlt?: string
  text?: string
  textSoft?: string
  border?: string
}

const COLOR_FIELDS = [
  'primary',
  'accent',
  'surface',
  'surfaceAlt',
  'text',
  'textSoft',
  'border',
] as const

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const NAME_MAX = 60
const LOGO_MAX = 300
// Control characters (including newlines and DEL) never belong in a name or a URL.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

function cleanName(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const name = v.trim()
  if (name.length < 1 || name.length > NAME_MAX || CONTROL.test(name)) return undefined
  // The name is shown as text; refuse markup outright rather than rely on every renderer escaping.
  if (/[<>]/.test(name)) return undefined
  return name
}

function cleanLogoUrl(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.length > LOGO_MAX || CONTROL.test(v) || /\s/.test(v))
    return undefined
  let u: URL
  try {
    u = new URL(v)
  } catch {
    return undefined
  }
  if (u.username || u.password) return undefined
  const ok = u.protocol === 'https:' || (u.protocol === 'http:' && LOCAL_HOSTS.has(u.hostname))
  // Characters that could break out of a CSS url(...) or an HTML attribute stay out of the URL.
  if (!ok || /["'()<>\\]/.test(v)) return undefined
  return v
}

/** The valid brand inside `input`, or null when there is none (no name, or not an object). */
export function sanitizeBrand(input: unknown): LtiBrand | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null
  const src = input as Record<string, unknown>
  const name = cleanName(src.name)
  if (!name) return null
  const brand: LtiBrand = { name }
  const logoUrl = cleanLogoUrl(src.logoUrl)
  if (logoUrl) brand.logoUrl = logoUrl
  if (src.scheme === 'light' || src.scheme === 'dark') brand.scheme = src.scheme
  for (const f of COLOR_FIELDS) {
    const c = src[f]
    if (typeof c === 'string' && HEX_COLOR.test(c)) brand[f] = c.toLowerCase()
  }
  return brand
}
