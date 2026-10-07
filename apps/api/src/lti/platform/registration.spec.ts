import { ForbiddenException, HttpException } from '@nestjs/common'
import { MemoryLtiStore } from '../lti-store'
import { TOOL_CONFIG_CLAIM } from './dynamic-registration'
import { RegistrationController } from './registration.controller'
import { RegistrationService } from './registration.service'
import type { ToolRegistryService } from './tool-registry.service'

const admin = { userId: 'u1', userName: 'Boss Person' }
const body = {
  client_name: 'Acme Labs',
  initiate_login_uri: 'https://acme.example/lti/login',
  redirect_uris: ['https://acme.example/lti/launch'],
  jwks_uri: 'https://acme.example/jwks',
  scope: 'openid',
  [TOOL_CONFIG_CLAIM]: { domain: 'acme.example' },
}

describe('RegistrationService', () => {
  let store: MemoryLtiStore
  const registry = {
    assertManage: jest.fn((role?: string) => {
      if (role !== 'system-admin') throw new ForbiddenException('Only a system administrator')
    }),
    registerFromTool: jest.fn(),
    isSystemAdmin: jest.fn(),
  }
  let service: RegistrationService
  const tokenOf = (url: string) => new URL(url).searchParams.get('registration_token') as string
  const start = async () =>
    (await service.start('system-admin', admin, 'https://acme.example/lti/register')).url

  beforeEach(() => {
    jest.resetAllMocks()
    registry.assertManage.mockImplementation((role?: string) => {
      if (role !== 'system-admin') throw new ForbiddenException('Only a system administrator')
    })
    registry.isSystemAdmin.mockResolvedValue(true)
    registry.registerFromTool.mockImplementation(async (_who, reg) => ({
      connection: {
        id: 'acme-labs-1a2b3c',
        name: reg.name,
        clientId: 'ld-made-by-platform',
        deploymentId: 'dep9',
        loginUrl: reg.loginUrl,
        launchUrl: reg.launchUrl,
        jwksUrl: reg.jwksUrl,
      },
      tool: {},
    }))
    store = new MemoryLtiStore()
    service = new RegistrationService(registry as unknown as ToolRegistryService, store)
  })

  describe('starting', () => {
    it("adds the platform configuration URL and a one-time token to the tool's link", async () => {
      const url = new URL(await start())
      expect(url.origin + url.pathname).toBe('https://acme.example/lti/register')
      expect(url.searchParams.get('openid_configuration')).toMatch(
        /\/lti\/platform\/openid-configuration$/
      )
      expect(url.searchParams.get('registration_token')).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    })

    it("keeps the link's own query and issues a different token each time", async () => {
      const a = await service.start('system-admin', admin, 'https://acme.example/register?org=7')
      const b = await service.start('system-admin', admin, 'https://acme.example/register?org=7')
      expect(new URL(a.url).searchParams.get('org')).toBe('7')
      expect(tokenOf(a.url)).not.toBe(tokenOf(b.url))
    })

    it('is for a system administrator only, and takes only a public https link', async () => {
      await expect(service.start('agency-admin', admin, 'https://acme.example/r')).rejects.toThrow(
        ForbiddenException
      )
      await expect(service.start('system-admin', admin, 'http://acme.example/r')).rejects.toThrow(
        /https/
      )
      await expect(service.start('system-admin', admin, 'https://10.0.0.5/r')).rejects.toThrow(
        /public address/
      )
      await expect(service.start('system-admin', admin, undefined)).rejects.toThrow(/required/)
    })
  })

  describe('registering', () => {
    it('registers a tool with a good token, answering with the client id the platform made', async () => {
      const token = tokenOf(await start())
      const out = await service.register(`Bearer ${token}`, body)
      expect(out).toMatchObject({
        client_id: 'ld-made-by-platform',
        client_name: 'Acme Labs',
        jwks_uri: 'https://acme.example/jwks',
      })
      expect((out[TOOL_CONFIG_CLAIM] as Record<string, unknown>).deployment_id).toBe('dep9')
      expect(registry.registerFromTool).toHaveBeenCalledWith(
        { userId: 'u1', userName: 'Boss Person (tool registration link)' },
        expect.objectContaining({ name: 'Acme Labs', launchUrl: 'https://acme.example/lti/launch' })
      )
    })

    it('ignores any client id the tool sends', async () => {
      const token = tokenOf(await start())
      await service.register(`Bearer ${token}`, { ...body, client_id: 'chosen-by-the-tool' })
      expect(JSON.stringify(registry.registerFromTool.mock.calls)).not.toContain(
        'chosen-by-the-tool'
      )
    })

    it('refuses a missing, wrong, or non-bearer token', async () => {
      for (const header of [undefined, '', 'Bearer', 'Bearer nope', 'Basic abc', 'Bearer a b'])
        await expect(service.register(header, body)).rejects.toMatchObject({ status: 401 })
      expect(registry.registerFromTool).not.toHaveBeenCalled()
    })

    it('uses the token up: a link works once', async () => {
      const token = tokenOf(await start())
      await service.register(`Bearer ${token}`, body)
      await expect(service.register(`Bearer ${token}`, body)).rejects.toMatchObject({ status: 401 })
      expect(registry.registerFromTool).toHaveBeenCalledTimes(1)
    })

    it('lets only one of two simultaneous requests with one token win', async () => {
      const token = tokenOf(await start())
      const results = await Promise.allSettled([
        service.register(`Bearer ${token}`, body),
        service.register(`Bearer ${token}`, body),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(registry.registerFromTool).toHaveBeenCalledTimes(1)
    })

    it('expires', async () => {
      const token = tokenOf(await start())
      const t = Date.now()
      store.now = () => t + 16 * 60_000
      await expect(service.register(`Bearer ${token}`, body)).rejects.toMatchObject({ status: 401 })
    })

    it('refuses a bad registration but leaves the link usable for a corrected one', async () => {
      const token = tokenOf(await start())
      await expect(
        service.register(`Bearer ${token}`, { ...body, jwks_uri: 'https://10.0.0.5/jwks' })
      ).rejects.toMatchObject({ status: 400 })
      expect(registry.registerFromTool).not.toHaveBeenCalled()
      await expect(service.register(`Bearer ${token}`, body)).resolves.toMatchObject({
        client_id: 'ld-made-by-platform',
      })
    })

    it('puts the link back when the registry could not save, so the admin need not start over', async () => {
      const token = tokenOf(await start())
      registry.registerFromTool.mockRejectedValueOnce(new Error('db down'))
      await expect(service.register(`Bearer ${token}`, body)).rejects.toThrow('db down')
      await expect(service.register(`Bearer ${token}`, body)).resolves.toBeDefined()
    })

    it('does not renew the link when a failed attempt puts it back: it keeps the time it had left', async () => {
      const t0 = Date.now()
      const token = tokenOf(await start())
      const spy = jest.spyOn(Date, 'now').mockReturnValue(t0 + 10 * 60_000)
      try {
        registry.registerFromTool.mockRejectedValueOnce(new Error('db down'))
        await expect(service.register(`Bearer ${token}`, body)).rejects.toThrow('db down')
        spy.mockReturnValue(t0 + 14 * 60_000)
        await expect(service.register(`Bearer ${token}`, body)).resolves.toBeDefined()
        // a second failure at minute 16 is past the original 15, so nothing is put back
        const again = tokenOf(await start())
        spy.mockReturnValue(t0 + 14 * 60_000 + 14 * 60_000)
        registry.registerFromTool.mockRejectedValueOnce(new Error('db down'))
        await expect(service.register(`Bearer ${again}`, body)).rejects.toThrow('db down')
        spy.mockReturnValue(t0 + 14 * 60_000 + 16 * 60_000)
        await expect(service.register(`Bearer ${again}`, body)).rejects.toMatchObject({
          status: 401,
        })
      } finally {
        spy.mockRestore()
      }
    })

    it('refuses when the admin who issued the link has lost their role since, and the link is spent', async () => {
      const token = tokenOf(await start())
      registry.isSystemAdmin.mockResolvedValue(false)
      await expect(service.register(`Bearer ${token}`, body)).rejects.toMatchObject({ status: 401 })
      expect(registry.registerFromTool).not.toHaveBeenCalled()
      registry.isSystemAdmin.mockResolvedValue(true)
      await expect(service.register(`Bearer ${token}`, body)).rejects.toMatchObject({ status: 401 })
    })

    it('limits how fast one address can try', async () => {
      let status = 0
      for (let i = 0; i < 25; i++)
        await service.register('Bearer nope', body, '203.0.113.9').catch((e: HttpException) => {
          status = e.getStatus()
        })
      expect(status).toBe(429)
    })
  })
})

describe('RegistrationController', () => {
  it('serves the configuration publicly and registers with the Authorization header', async () => {
    const registration = { register: jest.fn(async () => ({ client_id: 'x' })) }
    const c = new RegistrationController(registration as unknown as RegistrationService)
    expect(c.configuration().registration_endpoint).toMatch(/\/lti\/platform\/registration$/)
    await expect(
      c.register({ ip: '1.2.3.4', headers: { authorization: 'Bearer t' } }, body)
    ).resolves.toEqual({ client_id: 'x' })
    expect(registration.register).toHaveBeenCalledWith('Bearer t', body, '1.2.3.4')
  })
})
