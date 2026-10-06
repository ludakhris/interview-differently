import type { RubricDimensionInput } from '../config/prompts.config'

export interface InterviewSource {
  role: string
  questions: string[]
  rubric: RubricDimensionInput[]
}

/**
 * The questions, role and rubric of an Interview Differently scenario, read from its
 * stored JSON. A question is any node that asks the candidate an open-ended
 * `responsePrompt`, in node order.
 */
export function interviewOf(data: unknown): InterviewSource {
  const d = (data ?? {}) as {
    briefing?: { role?: unknown }
    nodes?: { responsePrompt?: unknown }[]
    rubric?: { dimensions?: { name?: unknown; description?: unknown }[] }
  }
  const questions = (Array.isArray(d.nodes) ? d.nodes : [])
    .map((n) => (typeof n?.responsePrompt === 'string' ? n.responsePrompt.trim() : ''))
    .filter(Boolean)
  const rubric = (Array.isArray(d.rubric?.dimensions) ? d.rubric.dimensions : [])
    .filter((r) => typeof r?.name === 'string' && r.name)
    .map((r) => ({
      name: r.name as string,
      description: typeof r.description === 'string' ? r.description : '',
    }))
  return {
    role: typeof d.briefing?.role === 'string' ? d.briefing.role : '',
    questions,
    rubric,
  }
}
