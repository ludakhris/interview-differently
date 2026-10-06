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

/** Learner-facing wording for a tool item: an assessment has limited attempts, an interview can be retried. */
export function toolCopy(tool: { name: string; attemptsAllowed: number | null }): {
  intro: string
  start: string
} {
  return tool.attemptsAllowed === null
    ? {
        intro: `This activity runs in ${tool.name}. You will go there, then come back here with your score.`,
        start: `Start in ${tool.name}`,
      }
    : {
        intro:
          'This assessment runs in Interview Differently. You will go there, then come back here with your score.',
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
