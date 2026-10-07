/**
 * Opens a link that must be fetched first (a short-lived signed URL) without tripping popup
 * blockers: the blank tab is opened synchronously, inside the click, and sent to the link once
 * it arrives. Call it directly from the click handler, before any `await`.
 *
 * `opened` is false when the browser refused the tab; the caller should then show `url` as a real link.
 */
export async function openLinkInNewTab(
  getUrl: () => Promise<string>
): Promise<{ url: string; opened: boolean }> {
  const tab = window.open('', '_blank')
  if (tab) tab.opener = null
  try {
    const url = await getUrl()
    if (!tab) return { url, opened: false }
    tab.location.href = url
    return { url, opened: true }
  } catch (err) {
    tab?.close()
    throw err
  }
}
