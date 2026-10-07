import { apiBase, type StoredConnection, type StoredTool } from './lti-platform-config'

const env = (name: string): string | undefined => process.env[name]?.trim() || undefined

/** The id of the Interview Differently connection a new environment starts with. */
export const DEFAULT_CONNECTION_ID = 'interview-differently'

/**
 * The Interview Differently connection as a new environment is first set up (each field comes from
 * env, so a dev, staging and production API each point at their own host). Used by the seed script
 * (`npm run seed:lti-tools`) and by tests; the running API never reads it: the registry tables are
 * the only source.
 */
export function defaultConnections(): StoredConnection[] {
  const base = apiBase()
  return [
    {
      id: DEFAULT_CONNECTION_ID,
      name: env('LTI_TOOL_NAME') ?? 'Interview Differently',
      clientId: env('LTI_TOOL_CLIENT_ID') ?? 'ld-platform',
      deploymentId: env('LTI_TOOL_DEPLOYMENT_ID') ?? '1',
      loginUrl: env('LTI_TOOL_LOGIN_URL') ?? `${base}/lti/tool/login`,
      launchUrl: env('LTI_TOOL_LAUNCH_URL') ?? `${base}/lti/tool/launch`,
      jwksUrl: env('LTI_TOOL_JWKS_URL') ?? `${base}/lti/tool/jwks`,
    },
  ]
}

/** The two Interview Differently tools a new environment starts with, on the default connection. */
export function defaultTools(): StoredTool[] {
  const [c] = defaultConnections()
  const shared = {
    connectionId: c.id,
    clientId: c.clientId,
    deploymentId: c.deploymentId,
    loginUrl: c.loginUrl,
    launchUrl: c.launchUrl,
    jwksUrl: c.jwksUrl,
    workspaceIds: [],
    enabled: true,
  }
  return [
    {
      toolId: 'id-interview',
      name: c.name,
      ...shared,
      kind: 'interview',
      retries: true,
      labelable: false,
      referenceLabel: 'Interview scenario id',
      referenceHelp:
        'Which interview this opens. In Interview Differently, open the interview in the builder: its id is the last part of the page address (.../builder/your-interview-id). Check it before saving, since a wrong id only shows up when a learner opens it. The learner goes to the tool in the same window and comes back here with the score.',
    },
    {
      toolId: 'id-assessment',
      name: 'Interview Differently assessment',
      ...shared,
      kind: 'assessment',
      retries: false,
      labelable: true,
      referenceLabel: 'Assessment slug',
      referenceHelp:
        "The assessment's slug, as set when it was imported in Interview Differently (Admin, Assessments). A wrong slug only shows up when a learner opens it.",
    },
  ]
}
