import type { BeforeSendEvent } from '@vercel/analytics'

// Page views go to Vercel Web Analytics. Strip what could identify a person before they leave the
// browser: the query string and hash (sign-in carries a redirect_url) and the learner id in
// /lms/cohorts/:cohort/learners/:userId and /lms/talent/:userId.
export function scrubUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return raw
  }
  url.search = ''
  url.hash = ''
  url.pathname = url.pathname
    .replace(/(\/learners\/)[^/]+/, '$1:userId')
    .replace(/(\/lms\/talent\/)(?!support(?:\/|$))[^/]+/, '$1:userId')
  return url.toString()
}

export function beforeSend(event: BeforeSendEvent): BeforeSendEvent {
  return { ...event, url: scrubUrl(event.url) }
}
