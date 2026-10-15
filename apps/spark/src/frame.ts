import type { LessonFrameMessage } from '@id/types'

/**
 * Messages to the LMS page that embeds the player (window.parent). They carry no learner data, only "finished" and
 * the page height, so they are posted to the embedding page's origin when the browser reports it (document.referrer)
 * and otherwise to any origin. The LMS checks the message came from Spark's origin and its own frame.
 */

export interface FrameWindow {
  parent: unknown
  document: { referrer: string }
}

export const isFramed = (win: FrameWindow): boolean => win.parent !== win

function targetOrigin(referrer: string): string {
  try {
    return referrer ? new URL(referrer).origin : '*'
  } catch {
    return '*'
  }
}

/** Posts to the embedding page; does nothing when the player is not in a frame. Returns whether it posted. */
export function postToParent(win: FrameWindow, message: LessonFrameMessage): boolean {
  if (!isFramed(win)) return false
  const parent = win.parent as { postMessage: (m: unknown, origin: string) => void }
  parent.postMessage(message, targetOrigin(win.document.referrer))
  return true
}
