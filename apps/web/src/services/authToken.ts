/**
 * Process-wide Clerk token getter for services that predate per-call
 * token plumbing (builder, scenario-media, results, immersive, D-ID).
 * `useRegisterToken` (mounted in App) registers Clerk's `getToken` once
 * Clerk has loaded; `authHeader()` waits for that registration so early
 * fetches on first render don't go out unauthenticated. Newer services
 * take `getToken` explicitly — prefer that for new code.
 */
type TokenGetter = () => Promise<string | null>

let getter: TokenGetter | null = null
let markReady: () => void = () => {}
const ready = new Promise<void>((resolve) => {
  markReady = resolve
})
// Never block a request forever if Clerk fails to load (e.g. missing key).
const READY_TIMEOUT_MS = 5000

export function registerTokenGetter(fn: TokenGetter | null): void {
  getter = fn
  markReady()
}

export async function authHeader(): Promise<Record<string, string>> {
  await Promise.race([ready, new Promise<void>((r) => setTimeout(r, READY_TIMEOUT_MS))])
  const token = getter ? await getter().catch(() => null) : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}
