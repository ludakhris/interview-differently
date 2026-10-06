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

/** Learner-facing wording for a tool item: an assessment is taken once, an interview can be retried. */
export function toolCopy(tool: { name: string; retries: boolean }): {
  intro: string
  start: string
} {
  return tool.retries
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
