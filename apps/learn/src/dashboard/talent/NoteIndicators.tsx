import { useEffect } from 'react'

/**
 * A quiet "notes exist" hint for staff lists: how many notes and open follow-ups there are for a
 * person. Counts only, never content. Nothing is rendered when both are zero (the caller may show a
 * dash instead); each count links to its section on the person's page.
 */
export function NoteIndicators({
  notes,
  openFollowUps,
  notesHref,
  followUpsHref,
}: {
  notes: number
  openFollowUps: number
  notesHref: string
  followUpsHref: string
}) {
  const notesName = `${notes} ${notes === 1 ? 'note' : 'notes'}`
  const followName = `${openFollowUps} open ${openFollowUps === 1 ? 'follow-up' : 'follow-ups'}`
  return (
    <span className="tl-ind">
      {notes > 0 && (
        <a href={notesHref} className="tl-ind-link" aria-label={notesName} title={notesName}>
          <span aria-hidden="true">📝 {notes}</span>
        </a>
      )}
      {openFollowUps > 0 && (
        <a href={followUpsHref} className="tl-ind-link" aria-label={followName} title={followName}>
          <span aria-hidden="true">🤝 {openFollowUps} open</span>
        </a>
      )}
    </span>
  )
}

/** Once a page has loaded, scroll to the section named in the URL fragment (the content arrives after the browser's own jump). */
export function useScrollToHash(ready: boolean): void {
  useEffect(() => {
    if (!ready) return
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (!id) return
    document.getElementById(id)?.scrollIntoView?.({ block: 'start' })
  }, [ready])
}
