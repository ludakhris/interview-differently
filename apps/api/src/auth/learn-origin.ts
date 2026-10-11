const LEARN_HOSTED = /^https:\/\/([a-z0-9-]+\.)*learndifferently\.tech$/
const LOCAL = /^http:\/\/([a-z0-9-]+\.)*localhost(:\d+)?$/

/**
 * The origins of preview deployments (for example Vercel branch previews), given as a regular expression in
 * PREVIEW_ORIGIN_PATTERN. Only the shared development API sets it, and it is ignored in production.
 */
function previewOrigin(origin: string): boolean {
  const pattern = process.env.PREVIEW_ORIGIN_PATTERN
  if (!pattern || process.env.NODE_ENV === 'production') return false
  try {
    return new RegExp(pattern).test(origin)
  } catch {
    return false
  }
}

/**
 * True for browser origins that belong to LearnDifferently: learndifferently.tech
 * and any tenant subdomain, plus localhost and configured preview deployments outside production.
 */
export function isLearnOrigin(origin: string): boolean {
  if (LEARN_HOSTED.test(origin)) return true
  return process.env.NODE_ENV !== 'production' && (LOCAL.test(origin) || previewOrigin(origin))
}
