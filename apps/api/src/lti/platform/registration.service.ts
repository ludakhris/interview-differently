import { createHash, randomBytes } from 'node:crypto'
import { HttpException, Inject, Injectable } from '@nestjs/common'
import { LTI_STORE, type LtiStore } from '../lti-store'
import {
  openIdConfigurationUrl,
  parseRegistration,
  registrationResponse,
} from './dynamic-registration'
import { publicHttpsUrl } from './tool-config'
import { ToolRegistryService, type Who } from './tool-registry.service'

/** How long a registration link stays good: long enough to fill in the tool's own form. */
const TOKEN_TTL_S = 15 * 60
const SCOPE = 'lti-registration'
const PER_MINUTE_PER_IP = 20

/** What a registration token stands for: the admin who started it, and when it stops working. */
interface Issued extends Who {
  expiresAt: number
}

const hash = (token: string): string => createHash('sha256').update(token).digest('base64url')

/**
 * LTI Dynamic Registration (platform side): a system admin starts it with the tool's registration
 * link, the platform hands the tool a one-time token, and the tool posts its own configuration back.
 * The result is a connection and a switched-off tool in the registry, for the admin to review.
 */
@Injectable()
export class RegistrationService {
  constructor(
    private readonly registry: ToolRegistryService,
    @Inject(LTI_STORE) private readonly store: LtiStore
  ) {}

  /**
   * Starts a registration: the tool's link with the platform's configuration URL and a one-time
   * token added. The token is kept only as a hash, bound to the admin who started it.
   */
  async start(
    role: string | undefined,
    who: Who,
    initiationUrl: unknown
  ): Promise<{ url: string }> {
    this.registry.assertManage(role)
    const link = new URL(publicHttpsUrl(initiationUrl, 'Registration link'))
    const token = randomBytes(32).toString('base64url')
    const issued: Issued = { ...who, expiresAt: Date.now() + TOKEN_TTL_S * 1000 }
    await this.store.put(SCOPE, hash(token), issued, TOKEN_TTL_S)
    link.searchParams.set('openid_configuration', openIdConfigurationUrl())
    link.searchParams.set('registration_token', token)
    return { url: link.toString() }
  }

  /**
   * Registers a tool from its client registration request. The bearer token must be a live one this
   * platform issued; it is used up by a successful registration, so a link works once. A request the
   * platform refuses (bad fields) leaves the token in place so the tool can send a corrected one
   * until it expires.
   */
  async register(
    authorization: string | undefined,
    body: unknown,
    ip = 'unknown'
  ): Promise<Record<string, unknown>> {
    if ((await this.store.count('rl:lti-registration', ip, 60)) > PER_MINUTE_PER_IP)
      throw new HttpException('Too many requests', 429)
    const token = /^Bearer (\S+)$/i.exec(authorization ?? '')?.[1]
    const key = token ? hash(token) : null
    const issued = key ? await this.store.peek<Issued>(SCOPE, key) : null
    if (!key || !issued)
      throw new HttpException('The registration link is missing, used or expired', 401)

    const reg = parseRegistration(body)
    // Use the token up only now that the request is valid, and only if this caller wins it.
    if (!(await this.store.take(SCOPE, key)))
      throw new HttpException('The registration link is missing, used or expired', 401)
    // The admin may have lost their role since they started: a link outlives that for up to 15 minutes.
    if (!(await this.registry.isSystemAdmin(issued.userId as string)))
      throw new HttpException('The administrator who issued this link no longer has access', 401)
    const who: Who = { userId: issued.userId, userName: issued.userName }
    let connection
    try {
      ;({ connection } = await this.registry.registerFromTool(
        { userId: who.userId, userName: `${who.userName} (tool registration link)` },
        reg
      ))
    } catch (err) {
      // Nothing was registered, so the link stays usable, but only for the time it had left.
      const left = Math.floor((issued.expiresAt - Date.now()) / 1000)
      if (left > 0) await this.store.put(SCOPE, key, issued, left)
      throw err
    }
    return registrationResponse(
      reg,
      connection.clientId,
      connection.deploymentId,
      body as Record<string, unknown>
    )
  }
}
