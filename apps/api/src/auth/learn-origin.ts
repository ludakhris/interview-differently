const LEARN_HOSTED = /^https:\/\/([a-z0-9-]+\.)*learndifferently\.tech$/
const LOCAL = /^http:\/\/([a-z0-9-]+\.)*localhost(:\d+)?$/

/**
 * True for browser origins that belong to LearnDifferently: learndifferently.tech
 * and any tenant subdomain, plus localhost outside production.
 */
export function isLearnOrigin(origin: string): boolean {
  if (LEARN_HOSTED.test(origin)) return true
  return process.env.NODE_ENV !== 'production' && LOCAL.test(origin)
}
