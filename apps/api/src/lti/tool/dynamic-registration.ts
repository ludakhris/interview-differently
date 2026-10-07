import { AGS_SCOPE_SCORE, LtiError } from '../lti-spec'
import { publicHttpsUrl } from '../public-url'
import { jwksUrl, launchUrl, loginUrl } from './lti-tool.config'

/** IMS LTI Dynamic Registration 1.0: the claims that carry the LTI-specific parts of the documents. */
export const TOOL_CONFIG_CLAIM = 'https://purl.imsglobal.org/spec/lti-tool-configuration'
export const PLATFORM_CONFIG_CLAIM = 'https://purl.imsglobal.org/spec/lti-platform-configuration'

const MAX_NAME = 80
const MAX_ID = 200

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** publicHttpsUrl, but a refusal reads as a page error rather than an API 400. */
function url(v: unknown, field: string): string {
  try {
    return publicHttpsUrl(v, field)
  } catch (err) {
    throw new LtiError(err instanceof Error ? err.message : `${field} is not valid`)
  }
}

/** The platform's configuration, reduced to what this tool stores. */
export interface PlatformConfiguration {
  name: string
  issuer: string
  authUrl: string
  tokenUrl: string
  jwksUrl: string
  registrationUrl: string
}

/**
 * Control, format and separator characters out (no bidi override or zero-width trick can make a
 * name read as another), whitespace tidied, then cut to length: it goes on the admin screen next to
 * the switch that turns the platform on. (The platform side's cleanName, but this one shortens
 * rather than refuses, because the name here is made up from what the platform published.)
 */
export function cleanName(v: string): string {
  return v
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME)
}

/**
 * Reads a platform's OpenID configuration. Every address must be public https on the same site as
 * the configuration itself and as the issuer, so a hostile configuration cannot point this tool at a
 * third party (or the inside of the network) for the registration, the token or the keys.
 */
export function parsePlatformConfiguration(
  configUrl: string,
  config: unknown
): PlatformConfiguration {
  if (!isObject(config)) throw new LtiError('The platform configuration is not a JSON object')
  const origin = new URL(configUrl).origin
  const own = (field: string): string => {
    const u = url(config[field], field)
    if (new URL(u).origin !== origin)
      throw new LtiError(`${field} is not on the same site as the platform configuration`)
    return u
  }
  const issuer = own('issuer')
  const auth = config.token_endpoint_auth_methods_supported
  if (auth !== undefined && !(Array.isArray(auth) && auth.includes('private_key_jwt')))
    throw new LtiError('The platform does not support private_key_jwt')
  const algs = config.id_token_signing_alg_values_supported
  if (algs !== undefined && !(Array.isArray(algs) && algs.includes('RS256')))
    throw new LtiError('The platform does not sign with RS256')
  const family = isObject(config[PLATFORM_CONFIG_CLAIM])
    ? config[PLATFORM_CONFIG_CLAIM].product_family_code
    : undefined
  const host = new URL(issuer).host
  const name =
    cleanName(typeof family === 'string' && family ? `${family} (${host})` : host) || host
  return {
    name,
    issuer,
    authUrl: own('authorization_endpoint'),
    tokenUrl: own('token_endpoint'),
    jwksUrl: own('jwks_uri'),
    registrationUrl: own('registration_endpoint'),
  }
}

/** This tool's client registration request. */
export function registrationRequest(): Record<string, unknown> {
  const launch = launchUrl()
  return {
    application_type: 'web',
    client_name: 'Interview Differently',
    response_types: ['id_token'],
    grant_types: ['implicit', 'client_credentials'],
    token_endpoint_auth_method: 'private_key_jwt',
    initiate_login_uri: loginUrl(),
    redirect_uris: [launch],
    jwks_uri: jwksUrl(),
    scope: `openid ${AGS_SCOPE_SCORE}`,
    [TOOL_CONFIG_CLAIM]: {
      domain: new URL(launch).host,
      target_link_uri: launch,
      claims: ['iss', 'sub'],
      messages: [{ type: 'LtiResourceLinkRequest', target_link_uri: launch }],
    },
  }
}

/** The client id and deployment id the platform made for this tool, or a page error. */
export function parseRegistrationResponse(body: unknown): {
  clientId: string
  deploymentId: string
} {
  const id = (v: unknown, what: string): string => {
    if (typeof v !== 'string' || !v.trim() || v.length > MAX_ID || /[\p{Cc}]/u.test(v))
      throw new LtiError(`The platform's answer has no valid ${what}`, 502)
    return v
  }
  if (!isObject(body)) throw new LtiError("The platform's answer is not a JSON object", 502)
  const cfg = body[TOOL_CONFIG_CLAIM]
  return {
    clientId: id(body.client_id, 'client id'),
    deploymentId: id(isObject(cfg) ? cfg.deployment_id : undefined, 'deployment id'),
  }
}
