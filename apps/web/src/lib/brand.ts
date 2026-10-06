/**
 * White-label brand tokens (schema v1) for LTI launches.
 *
 * The API sends `{ name, logoUrl?, scheme?, primary?, accent?, surface?, surfaceAlt?, text?,
 * textSoft?, border? }`. It is validated again here because the client is the last line of
 * defence: only strict `#rrggbb` colours, a plain-text name and an https (or localhost http)
 * logo URL get through, and the only CSS ever produced is `r g b` channel triplets built from
 * validated hex digits. Anything invalid falls back to the default look, field by field; a
 * missing or invalid name drops the whole brand (same rule as the API).
 *
 * The result is a map of `--ld-*` CSS variables to set on the LTI root element only. With no
 * brand (or a dark brand that sets no colours) the map is empty, so every colour stays at the
 * fallback written in tailwind.config.js and the screens look exactly as they do today.
 */

export type BrandScheme = 'light' | 'dark'

export interface Brand {
  name: string
  logoUrl?: string
  scheme?: BrandScheme
  primary?: string
  accent?: string
  surface?: string
  surfaceAlt?: string
  text?: string
  textSoft?: string
  border?: string
}

export interface AppliedBrand {
  /** `--ld-*` variables for the LTI root element; empty when nothing differs from the defaults. */
  cssVars: Record<string, string>
  /** Validated tenant name, or null when no usable brand was supplied. */
  name: string | null
  /** Validated logo URL; only set together with a name. */
  logoUrl: string | null
  scheme: BrandScheme
  /** The tenant accent as `#rrggbb`, for the places that take a colour prop (track accents). */
  accent: string | null
}

export const NO_BRAND: AppliedBrand = {
  cssVars: {},
  name: null,
  logoUrl: null,
  scheme: 'dark',
  accent: null,
}

const HEX = /^#[0-9a-fA-F]{6}$/
const NAME_MAX = 60
const LOGO_MAX = 300
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

type Rgb = [number, number, number]

function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const name = v.trim()
  if (name.length < 1 || name.length > NAME_MAX || CONTROL.test(name) || /[<>]/.test(name)) {
    return null
  }
  return name
}

function cleanLogoUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > LOGO_MAX || CONTROL.test(v) || /\s/.test(v)) return null
  let u: URL
  try {
    u = new URL(v)
  } catch {
    return null
  }
  if (u.username || u.password) return null
  const ok = u.protocol === 'https:' || (u.protocol === 'http:' && LOCAL_HOSTS.has(u.hostname))
  if (!ok || /["'()<>\\]/.test(v)) return null
  return v
}

function cleanHex(v: unknown): Rgb | null {
  if (typeof v !== 'string' || !HEX.test(v)) return null
  return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)]
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb =>
  [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as Rgb

const channels = (c: Rgb) => c.join(' ')

const toHex = (c: Rgb) => '#' + c.map((n) => n.toString(16).padStart(2, '0')).join('')

function luminance([r, g, b]: Rgb): number {
  const f = (n: number) => {
    const s = n / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** White or near-black, whichever reads better on `bg`. */
function readableOn(bg: Rgb): Rgb {
  const white: Rgb = [255, 255, 255]
  const dark: Rgb = [17, 17, 17]
  return contrast(bg, white) >= contrast(bg, dark) ? white : dark
}

const hex = (s: string): Rgb => cleanHex(s) as Rgb

// Defaults the light scheme needs, since the built-in look assumes a dark page.
const LIGHT = {
  surface: hex('#ffffff'),
  surfaceAlt: hex('#f4f5f7'),
  text: hex('#16181d'),
  textSoft: hex('#4b5563'),
  mint: hex('#2d7a5a'),
}
// Today's dark defaults, only used to derive values when a dark brand overrides part of them.
const DARK = { surface: hex('#0a0a0a'), text: hex('#f5f3ee') }

// Status text colours are tuned for a dark page; on a light page these darker shades take over.
const LIGHT_STATUS: Record<string, string> = {
  'amber-200': '#92400e',
  'amber-300': '#b45309',
  'amber-400': '#b45309',
  'red-300': '#b91c1c',
  'red-400': '#dc2626',
  'emerald-300': '#047857',
  'emerald-400': '#059669',
  'violet-400': '#7c3aed',
  'sky-400': '#0369a1',
}

/** Validates `input` (anything the network returned) and turns it into CSS variables + text. */
export function applyBrand(input: unknown): AppliedBrand {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return NO_BRAND
  const src = input as Record<string, unknown>
  const name = cleanName(src.name)
  if (!name) return NO_BRAND

  const logoUrl = cleanLogoUrl(src.logoUrl)
  const scheme: BrandScheme = src.scheme === 'light' ? 'light' : 'dark'
  const light = scheme === 'light'
  const primary = cleanHex(src.primary)
  const accent = cleanHex(src.accent)
  const vars: Record<string, string> = {}
  const set = (k: string, c: Rgb) => {
    vars[`--ld-${k}`] = channels(c)
  }

  // Surfaces. Derived tints sit between surface and surfaceAlt, as today's near-blacks do.
  const surfaceIn = cleanHex(src.surface)
  const surfaceAltIn = cleanHex(src.surfaceAlt)
  if (light || surfaceIn || surfaceAltIn) {
    const surface = surfaceIn ?? (light ? LIGHT.surface : DARK.surface)
    const alt =
      surfaceAltIn ??
      (light
        ? surfaceIn
          ? mix(surface, LIGHT.text, 0.04)
          : LIGHT.surfaceAlt
        : mix(surface, [255, 255, 255], 0.03))
    set('surface', surface)
    set('surface-alt', alt)
    set('surface-deep', mix(surface, alt, 0.5))
    set('surface-bar', mix(surface, alt, 0.7))
  }

  // Text. `ink` replaces the white used for overlays and rules on the dark page.
  const textIn = cleanHex(src.text)
  const softIn = cleanHex(src.textSoft)
  const text = textIn ?? (light ? LIGHT.text : null)
  if (text) {
    set('text', text)
    set('ink', text)
  }
  const soft = softIn ?? (light ? LIGHT.textSoft : null)
  if (soft) {
    set('soft', soft)
    set('soft-light', mix(soft, text ?? DARK.text, 0.5))
  }

  // Rules: a solid border colour replaces the translucent white lines; the multiplier lifts
  // their faint opacities (5-30%) so the colour still shows.
  const borderIn = cleanHex(src.border)
  if (borderIn) {
    set('edge', borderIn)
    vars['--ld-edge-k'] = '5'
  } else if (text) {
    set('edge', text)
  }

  // Brand colours.
  if (primary) {
    set('primary', primary)
    set('on-primary', readableOn(primary))
  }
  if (accent) {
    set('accent', accent)
    set('on-accent', readableOn(accent))
  }
  const mint = light ? (primary ?? accent ?? LIGHT.mint) : (accent ?? primary)
  if (mint) set('mint', mint)
  const jade = accent ?? (light ? (primary ?? LIGHT.mint) : primary)
  if (jade) set('jade', jade)
  const azure = accent ?? primary
  if (azure) set('azure', azure)

  if (light) {
    for (const [k, v] of Object.entries(LIGHT_STATUS)) set(k, hex(v))
  }

  return { cssVars: vars, name, logoUrl, scheme, accent: accent ? toHex(accent) : null }
}
