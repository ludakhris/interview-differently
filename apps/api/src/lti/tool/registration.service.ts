import { Inject, Injectable } from '@nestjs/common'
import { LtiError, newId, readCapped } from '../lti-spec'
import { LTI_STORE, type LtiStore } from '../lti-store'
import { publicHttpsUrl } from '../public-url'
import {
  parsePlatformConfiguration,
  parseRegistrationResponse,
  registrationRequest,
} from './dynamic-registration'
import { PlatformRegistryService } from './platform-registry.service'

const PER_MINUTE_PER_IP = 10
const MAX_QUERY_CHARS = 2048
const MAX_RESPONSE_BYTES = 64 * 1024
const FETCH_TIMEOUT_MS = 10_000
/** Registrations nobody has approved yet: past this, new ones are refused so the list cannot be flooded. */
export const MAX_PENDING = 50

/**
 * LTI Dynamic Registration 1.0, tool side. The endpoint is public by design (the platform's admin
 * opens it from their own browser), so nothing here trusts what it is given: the configuration URL
 * must be public https and so must every address in the configuration, all on one site. The result
 * is a platform that is switched off until an administrator of this tool approves it.
 */
@Injectable()
export class ToolRegistrationService {
  /** Injectable for tests. */
  fetchImpl: typeof fetch = (...args) => fetch(...args)
  /** Injectable for tests. */
  timeoutMs = FETCH_TIMEOUT_MS

  constructor(
    private readonly platforms: PlatformRegistryService,
    @Inject(LTI_STORE) private readonly store: LtiStore
  ) {}

  async register(
    query: { openid_configuration?: string; registration_token?: string },
    ip = 'unknown'
  ): Promise<{ name: string; created: boolean }> {
    if ((await this.store.count('rl:tool-register', ip, 60)) > PER_MINUTE_PER_IP)
      throw new LtiError('Too many requests. Wait a minute and try again.', 429)
    const { openid_configuration: configUrl, registration_token: token } = query
    if (!configUrl || !token) throw new LtiError('The registration link is missing its parameters')
    if (configUrl.length > MAX_QUERY_CHARS || token.length > MAX_QUERY_CHARS)
      throw new LtiError('The registration link is too long')
    // the token goes into a header: printable characters only, so it cannot carry anything else
    if (!/^[\x21-\x7e]+$/.test(token)) throw new LtiError('The registration token is not valid')
    let cleanUrl: string
    try {
      cleanUrl = publicHttpsUrl(configUrl, 'openid_configuration')
    } catch (err) {
      throw new LtiError(err instanceof Error ? err.message : 'openid_configuration is not valid')
    }
    if ((await this.platforms.pendingCount()) >= MAX_PENDING)
      throw new LtiError('Too many registrations are waiting for approval. Try again later.', 429)

    const config = parsePlatformConfiguration(
      cleanUrl,
      await this.exchange(cleanUrl, { headers: { Accept: 'application/json' } }, 'configuration')
    )
    const answer = parseRegistrationResponse(
      await this.exchange(
        config.registrationUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(registrationRequest()),
        },
        'registration'
      )
    )
    const host = new URL(config.issuer).host
    const { platform, created } = await this.platforms.addRegistered(
      {
        name: config.name,
        issuer: config.issuer,
        clientId: answer.clientId,
        deploymentId: answer.deploymentId,
        authUrl: config.authUrl,
        tokenUrl: config.tokenUrl,
        jwksUrl: config.jwksUrl,
      },
      newId(),
      { userId: null, userName: `Dynamic registration (${host})` }
    )
    return { name: platform.name, created }
  }

  /**
   * One request to a platform: no redirects (one could lead inside the network), a timeout, and a
   * size cap. What the platform says is never put in an error: only the status.
   */
  private async exchange(url: string, init: RequestInit, what: string): Promise<unknown> {
    let text: string
    try {
      const res = await this.fetchImpl(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (!res.ok)
        throw new LtiError(`The platform refused the ${what} (status ${res.status})`, 502)
      text = await readCapped(res, MAX_RESPONSE_BYTES)
    } catch (err) {
      if (err instanceof LtiError) throw err
      throw new LtiError(`Could not read the platform's ${what}`, 502)
    }
    try {
      return JSON.parse(text)
    } catch {
      throw new LtiError(`The platform's ${what} is not JSON`, 502)
    }
  }
}
