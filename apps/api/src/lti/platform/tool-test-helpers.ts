import { defaultTools, type StoredTool } from './lti-platform-config'

/** For specs only: the default tools, with the first one's fields changed. */
export const withFirstTool = (over: Partial<StoredTool>): StoredTool[] =>
  defaultTools().map((t, i) => (i === 0 ? { ...t, ...over } : t))
