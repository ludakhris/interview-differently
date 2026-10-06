/**
 * LTI launch session (LearnDifferently -> Interview Differently).
 * The API redirects the learner to `/lti/play/<scenarioId>#session=<token>`.
 * The token rides in the URL fragment (never sent to a server or logged), is
 * moved into sessionStorage for this tab, and is stripped from the address
 * bar. It is sent as `Authorization: Bearer lti.<token>` — but only while the
 * browser is on an `/lti/play/` or `/lti/assessment/` route, so Clerk-gated pages are unaffected.
 */
import { registerLtiTokenGetter } from './authToken'

const STORAGE_KEY = 'lti-session-token'
const LTI_PATH = /^\/lti\/(?:play|assessment)\/[^/]+/
// Opaque token characters only (JWT / base64url style); rejects garbage.
const TOKEN_SHAPE = /^[A-Za-z0-9._~+/=-]{8,4096}$/

let memoryToken: string | null = null

export function isLtiPath(pathname: string): boolean {
  return LTI_PATH.test(pathname)
}

/** Pulls the `session` value out of a location.hash string; null when absent or garbled. */
export function parseSessionFromHash(hash: string): string | null {
  const params = (hash.startsWith('#') ? hash.slice(1) : hash).split('&')
  for (const part of params) {
    const eq = part.indexOf('=')
    if (eq < 0 || part.slice(0, eq) !== 'session') continue
    let value: string
    try {
      value = decodeURIComponent(part.slice(eq + 1))
    } catch {
      return null
    }
    return TOKEN_SHAPE.test(value) ? value : null
  }
  return null
}

function readStored(): string | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY)
    return v && TOKEN_SHAPE.test(v) ? v : null
  } catch {
    return null
  }
}

/**
 * Call once when the LTI route renders. Takes a fresh token from the URL
 * fragment (storing it for this tab and stripping the fragment), else falls
 * back to one already stored. Returns the token, or null if there is none.
 */
export function captureLtiSession(): string | null {
  const fromHash = parseSessionFromHash(window.location.hash)
  if (fromHash) {
    memoryToken = fromHash
    try {
      sessionStorage.setItem(STORAGE_KEY, fromHash)
    } catch {
      // storage blocked — the in-memory copy still covers this page load
    }
  }
  if (window.location.hash) {
    // Strip the fragment (token or junk) so it is not left in the address bar.
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
  registerLtiTokenGetter(() => (isLtiSession() ? `lti.${getLtiToken()}` : null))
  return getLtiToken()
}

export function getLtiToken(): string | null {
  return memoryToken ?? readStored()
}

/** True only on an /lti/play/ or /lti/assessment/ route with a token present for this tab. */
export function isLtiSession(pathname: string = window.location.pathname): boolean {
  return isLtiPath(pathname) && getLtiToken() !== null
}

/**
 * For services that take an explicit Clerk `getToken`: while on an LTI play route the LTI session
 * (`lti.<token>`) is used instead, otherwise `getToken` is called untouched. Decided per call.
 */
export function preferLtiToken(
  getToken: () => Promise<string | null>
): () => Promise<string | null> {
  return () => {
    const lti = isLtiSession() ? getLtiToken() : null
    return lti ? Promise.resolve(`lti.${lti}`) : getToken()
  }
}

/** Test hook: forget the cached token. */
export function clearLtiSession(): void {
  memoryToken = null
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
