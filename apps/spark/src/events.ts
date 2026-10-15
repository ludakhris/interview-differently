import type { LessonEventInput } from '@id/types'

/**
 * How the player's events reach Spark's server. Scenes are history: a lost one never interrupts the lesson. The
 * finish is what the LMS completes the item on, so it is stored after the scene events before it, and the LMS page is
 * told only once the server has it (the LMS reads the server, so telling it any sooner can miss the finish).
 */
export function eventSender(post: (input: LessonEventInput) => Promise<void>, tell: () => void) {
  const inFlight = new Set<Promise<void>>()
  return {
    send(input: LessonEventInput): void {
      const p = post(input).catch(() => undefined)
      inFlight.add(p)
      void p.then(() => inFlight.delete(p))
    },
    /** Stores the finish, then tells the LMS page; false when it could not be stored. */
    async finish(input: LessonEventInput): Promise<boolean> {
      await Promise.all([...inFlight])
      try {
        await post(input)
      } catch {
        return false
      }
      tell()
      return true
    },
  }
}
