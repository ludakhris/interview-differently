/**
 * The signed lesson link: the LMS opens `/lesson#token=<token>`. The token rides in the fragment so it is never sent
 * to this site's host or kept in its logs; the page moves it into sessionStorage (so a reload keeps working) and
 * strips it from the address bar.
 */

const KEY = 'spark.lessonToken'

export interface TokenWindow {
  location: { hash: string; pathname: string; search: string }
  history: { replaceState: (data: unknown, unused: string, url?: string) => void }
  sessionStorage?: Pick<Storage, 'getItem' | 'setItem'>
}

let remembered: string | null = null

/** The token from the fragment (stored, then stripped), else the one stored earlier in this tab, else null. */
export function captureToken(win: TokenWindow): string | null {
  const match = /(?:^#|&)token=([^&]+)/.exec(win.location.hash)
  if (match) {
    let token: string
    try {
      token = decodeURIComponent(match[1])
    } catch {
      return null
    }
    remembered = token
    try {
      win.sessionStorage?.setItem(KEY, token)
    } catch {
      // Storage can be blocked in a cross-site frame; the token is kept in memory for this page.
    }
    win.history.replaceState(null, '', win.location.pathname + win.location.search)
    return token
  }
  if (remembered) return remembered
  try {
    return win.sessionStorage?.getItem(KEY) ?? null
  } catch {
    return null
  }
}

/** For tests: forget the in-memory token. */
export function resetToken(): void {
  remembered = null
}
