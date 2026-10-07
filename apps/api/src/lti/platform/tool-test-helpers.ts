import { defaultConnections, defaultTools } from './default-tools'
import { setStoredConnections, setStoredTools, type StoredTool } from './lti-platform-config'

/** For specs only: the default tools, with the first one's fields changed. */
export const withFirstTool = (over: Partial<StoredTool>): StoredTool[] =>
  defaultTools().map((t, i) => (i === 0 ? { ...t, ...over } : t))

/** For specs only: back to the Interview Differently connection and tools every spec starts with. */
export function resetToDefaults(): void {
  setStoredConnections(defaultConnections())
  setStoredTools(defaultTools())
}
