/**
 * Cohort-scoped tools (#25). Add a key here when a new tool ships; the admin
 * cohort page renders one toggle per entry. Mirrored in packages/types as
 * TOOL_KEYS for the frontend.
 */
export const TOOL_KEYS = ['sql-sandbox', 'assessments'] as const
export type ToolKey = (typeof TOOL_KEYS)[number]

export function isToolKey(value: string): value is ToolKey {
  return (TOOL_KEYS as readonly string[]).includes(value)
}
