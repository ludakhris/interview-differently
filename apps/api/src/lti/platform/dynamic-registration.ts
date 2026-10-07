import { BadRequestException } from '@nestjs/common'
import { AGS_SCOPE_SCORE } from '../lti-spec'
import { apiBase, platformRegistration } from './lti-platform-config'
import { publicHttpsUrl } from './tool-config'

/** IMS LTI Dynamic Registration 1.0: the claims that carry LTI-specific parts of the documents. */
export const TOOL_CONFIG_CLAIM = 'https://purl.imsglobal.org/spec/lti-tool-configuration'
export const PLATFORM_CONFIG_CLAIM = 'https://purl.imsglobal.org/spec/lti-platform-configuration'

/** The scopes the platform can grant: sign-in, and posting a score back. */
const SUPPORTED_SCOPES = ['openid', AGS_SCOPE_SCORE]

const MAX_REDIRECT_URIS = 10
const MAX_NAME = 80

/** Where a tool posts its registration. */
export const registrationEndpoint = (): string => `${apiBase()}/lti/platform/registration`

/** Where a tool reads the platform's configuration. */
export const openIdConfigurationUrl = (): string => `${apiBase()}/lti/platform/openid-configuration`

/** The platform's OpenID configuration, for a tool that is registering itself. */
export function platformConfiguration() {
  const reg = platformRegistration()
  return {
    issuer: reg.issuer,
    authorization_endpoint: reg.authUrl,
    token_endpoint: reg.tokenUrl,
    token_endpoint_auth_methods_supported: ['private_key_jwt'],
    token_endpoint_auth_signing_alg_values_supported: ['RS256'],
    jwks_uri: reg.jwksUrl,
    registration_endpoint: registrationEndpoint(),
    scopes_supported: SUPPORTED_SCOPES,
    response_types_supported: ['id_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    claims_supported: ['iss', 'sub', 'name', 'email', 'given_name', 'family_name'],
    [PLATFORM_CONFIG_CLAIM]: {
      product_family_code: 'learndifferently',
      version: '1',
      messages_supported: [{ type: 'LtiResourceLinkRequest' }],
      variables: [],
    },
  }
}

/** What a tool's registration request says, checked and reduced to what the platform stores. */
export interface ToolRegistration {
  name: string
  loginUrl: string
  /** One of the tool's redirect URIs: the platform sends the learner here. */
  launchUrl: string
  jwksUrl: string
  /** Every redirect URI the tool registered, kept for the response. */
  redirectUris: string[]
  /** The scopes it asked for that the platform grants. */
  scope: string
}

const bad = (message: string): never => {
  throw new BadRequestException(message)
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Control, format and separator characters out (so no bidi override or zero-width trick can make a
 * name read as another), whitespace tidied, length capped to what a tool's name may be: it goes on
 * admin screens next to the switch that turns the tool on.
 */
function cleanName(v: unknown): string {
  if (typeof v !== 'string') return bad('client_name is required')
  const t = v
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return bad('client_name is required')
  return t.length > MAX_NAME ? bad(`client_name is too long (at most ${MAX_NAME} characters)`) : t
}

/**
 * Reads a tool's client registration request (the platform only registers what it can serve):
 * a web tool that signs in by id_token and authenticates with a private key, publishing its keys
 * at a URL. Every URL must be a public https address. The tool's own client id is ignored: the
 * platform makes one.
 */
export function parseRegistration(body: unknown): ToolRegistration {
  if (!isObject(body)) return bad('The registration must be a JSON object')
  if (body.application_type !== undefined && body.application_type !== 'web')
    return bad('application_type must be web')
  if (body.response_types !== undefined) {
    const r = body.response_types
    if (!Array.isArray(r) || r.length !== 1 || r[0] !== 'id_token')
      return bad('response_types must be ["id_token"]')
  }
  if (body.grant_types !== undefined) {
    const g = body.grant_types
    if (
      !Array.isArray(g) ||
      !g.includes('implicit') ||
      !g.every((x) => x === 'implicit' || x === 'client_credentials')
    )
      return bad('grant_types must include implicit, and may include client_credentials')
  }
  if (
    body.token_endpoint_auth_method !== undefined &&
    body.token_endpoint_auth_method !== 'private_key_jwt'
  )
    return bad('token_endpoint_auth_method must be private_key_jwt')
  if (body.jwks !== undefined)
    return bad('Publish the keys at jwks_uri; inline jwks is not accepted')

  const uris = body.redirect_uris
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS)
    return bad(`redirect_uris must list 1 to ${MAX_REDIRECT_URIS} URLs`)
  const redirectUris = uris.map((u) => publicHttpsUrl(u, 'redirect_uris'))

  const toolConfig = body[TOOL_CONFIG_CLAIM]
  const wanted = isObject(toolConfig) ? toolConfig.target_link_uri : undefined
  const launchUrl =
    typeof wanted === 'string' && redirectUris.includes(wanted) ? wanted : redirectUris[0]

  const scopes = typeof body.scope === 'string' ? body.scope.split(/\s+/).filter(Boolean) : []
  return {
    name: cleanName(body.client_name),
    loginUrl: publicHttpsUrl(body.initiate_login_uri, 'initiate_login_uri'),
    launchUrl,
    jwksUrl: publicHttpsUrl(body.jwks_uri, 'jwks_uri'),
    redirectUris,
    scope: SUPPORTED_SCOPES.filter((s) => scopes.includes(s)).join(' ') || 'openid',
  }
}

/** The platform's answer to a registration: what was registered, with the client id it assigned. */
export function registrationResponse(
  reg: ToolRegistration,
  clientId: string,
  deploymentId: string,
  original: Record<string, unknown>
) {
  const toolConfig = isObject(original[TOOL_CONFIG_CLAIM]) ? original[TOOL_CONFIG_CLAIM] : {}
  return {
    client_id: clientId,
    client_name: reg.name,
    application_type: 'web',
    response_types: ['id_token'],
    grant_types: ['implicit', 'client_credentials'],
    token_endpoint_auth_method: 'private_key_jwt',
    initiate_login_uri: reg.loginUrl,
    redirect_uris: reg.redirectUris,
    jwks_uri: reg.jwksUrl,
    scope: reg.scope,
    [TOOL_CONFIG_CLAIM]: {
      ...toolConfig,
      deployment_id: deploymentId,
      target_link_uri: reg.launchUrl,
    },
  }
}
