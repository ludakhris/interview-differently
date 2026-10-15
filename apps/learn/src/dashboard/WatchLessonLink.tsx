import { useApiFetch } from './api'

/**
 * "Watch the lesson", a text link for a reviewer (GitHub issue #90): asks the API for a preview link to an AI-written lesson and
 * opens it in Spark's player in a new tab. The preview records nothing. `path` answers `{ url }`.
 */
export function WatchLessonLink({
  path,
  onError,
  disabled,
}: {
  path: string
  onError: (message: string) => void
  disabled?: boolean
}) {
  const apiFetch = useApiFetch()

  async function watch() {
    // Opened now, inside the click, so a popup blocker lets it through; pointed at the lesson once the link arrives.
    // Cut from this page (as noopener would), which a noopener window.open could not be, since it returns null.
    const tab = window.open('', '_blank')
    if (tab) tab.opener = null
    try {
      const { url } = (await (await apiFetch(path)).json()) as { url: string }
      if (tab) tab.location.href = url
      else window.open(url, '_blank', 'noopener')
    } catch (err) {
      tab?.close()
      onError((err as Error).message)
    }
  }

  return (
    <button
      type="button"
      className="dash-text-link"
      disabled={disabled}
      onClick={() => void watch()}
    >
      <span aria-hidden="true">▶ </span>
      Watch the lesson
    </button>
  )
}
