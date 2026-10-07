import { defaultConnections, defaultTools } from './lti/platform/default-tools'
import { setStoredConnections, setStoredTools } from './lti/platform/lti-platform-config'

// The running API has no tools until the registry loads them from the database. Tests assume the
// Interview Differently connection and its two tools are there, as they are after the seed script.
setStoredConnections(defaultConnections())
setStoredTools(defaultTools())
