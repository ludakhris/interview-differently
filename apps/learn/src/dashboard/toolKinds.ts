/** The connected tools an author can pick (mirrors the API registry; the API is the authority). */
export const TOOL_OPTIONS = [
  { id: 'id-interview', label: 'Interview Differently interview', labelable: false },
  { id: 'id-assessment', label: 'Interview Differently assessment', labelable: true },
] as const

/** Whether a tool's item can be the course's pre or post assessment. */
export const toolLabelable = (toolId: string): boolean =>
  TOOL_OPTIONS.some((t) => t.id === toolId && t.labelable)

/** The label an item is saved with: only a labelable tool keeps pre or post. */
export const toolItemLabel = (toolId: string, label: 'pre' | 'post'): 'pre' | 'post' | null =>
  toolLabelable(toolId) ? label : null

/** What the "ready to start" card says: one wording for a graded assessment, one for a practice lab. */
export interface ReadyCopy {
  heading: string
  intro: string
  points: { icon: string; title: string; body: string }[]
  start: string
}

/** Learner-facing wording before a tool item opens: an assessment has limited attempts, a lab can be retried. */
export function readyCopy(
  tool: { name: string; attemptsAllowed: number | null; timeLimitMinutes: number | null },
  attemptsUsed: number
): ReadyCopy {
  const comeBack = {
    icon: '🏁',
    title: 'Your score comes back here',
    body: 'When you finish, we bring you back to this course with your result.',
  }
  if (tool.attemptsAllowed === null) {
    return {
      heading: 'Ready to try it?',
      intro: `A hands-on practice in ${tool.name}: make the calls, answer the questions and see how you handle it.`,
      points: [
        {
          icon: '🎮',
          title: 'Step into the scenario',
          body: 'Work through a realistic situation, the way you would on the job. Some labs use your microphone; your browser will ask first.',
        },
        {
          icon: '🔁',
          title: 'Retry as often as you like',
          body: 'Your best score counts, so take a few swings.',
        },
        comeBack,
      ],
      start: 'Start the simulation',
    }
  }
  const max = tool.attemptsAllowed
  const limit = tool.timeLimitMinutes
  const resume = 'If you get disconnected, come back and pick up where you left off.'
  return {
    heading: 'Ready to show what you know?',
    intro:
      'This is a graded check, run in Interview Differently. Find a quiet spot, take a breath and give it your best.',
    points: [
      {
        icon: '🎯',
        title: `Attempt ${Math.min(attemptsUsed + 1, max)} of ${max}`,
        body: 'Opening it starts an attempt, so start when you have the time. Your best score counts.',
      },
      {
        icon: '⏱️',
        title: limit === null ? 'No time limit' : `${limit} minutes`,
        body:
          limit === null
            ? `Take the time you need. ${resume}`
            : `The clock starts when you open it. ${resume}`,
      },
      comeBack,
    ],
    start: 'Start the assessment',
  }
}

/** Parses the editor's text field for the attempts (1-5; blank or invalid means 1). */
export function parseAttempts(text: string): number {
  const n = Number(text)
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1
}

/** Parses the editor's optional time limit: whole minutes 5-240, blank or invalid means none. */
export function parseTimeLimit(text: string): number | undefined {
  if (!text.trim()) return undefined
  const n = Number(text)
  return Number.isInteger(n) && n >= 5 && n <= 240 ? n : undefined
}

/** The attempt line for an assessment item: "Attempt 2 of 3" before a start, "Attempts used: 1 of 3" after a score. */
export function attemptLine(used: number, allowed: number, completed: boolean): string {
  return completed
    ? `Attempts used: ${Math.min(used, allowed)} of ${allowed}`
    : `Attempt ${Math.min(used + 1, allowed)} of ${allowed}`
}

/** The time-limit note, or null when there is no limit. */
export const timeLimitNote = (minutes: number | null): string | null =>
  minutes === null ? null : `Time limit: ${minutes} minutes`

/** Reference values the add menu used to save as placeholders; never a real reference. */
const PLACEHOLDER_REFS = ['assessment-slug', 'interview-id']

/** Why a tool reference cannot be saved, or null when it can. */
export function toolRefProblem(ref: string): string | null {
  const r = ref.trim()
  if (!r || PLACEHOLDER_REFS.includes(r)) {
    return 'Enter the reference of the assessment or interview this opens before saving.'
  }
  return null
}

/** The config a tool item is saved with. Attempt rules apply to assessment tools only; the interview flag to others only. */
export function toolConfig(f: {
  toolId: string
  ref: string
  skill: string
  attempts: string
  timeLimit: string
  countsAsInterview: boolean
}): Record<string, unknown> {
  const limit = parseTimeLimit(f.timeLimit)
  return {
    toolId: f.toolId,
    ref: f.ref.trim(),
    ...(f.skill ? { skill: f.skill } : {}),
    ...(toolLabelable(f.toolId)
      ? { maxAttempts: parseAttempts(f.attempts), ...(limit ? { timeLimitMinutes: limit } : {}) }
      : f.countsAsInterview
        ? { countsAsInterview: true }
        : {}),
  }
}

/**
 * Calls `reset` when the browser restores the page from its back/forward cache (`pageshow` with
 * `persisted`), where React state is kept as it was when the learner left. Returns the cleanup.
 */
export function onPageRestore(target: EventTarget, reset: () => void): () => void {
  const handler = (e: Event) => {
    if ((e as PageTransitionEvent).persisted) reset()
  }
  target.addEventListener('pageshow', handler)
  return () => target.removeEventListener('pageshow', handler)
}
