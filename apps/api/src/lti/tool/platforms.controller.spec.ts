import { PlatformsController } from './platforms.controller'

describe('PlatformsController endpoints', () => {
  const saved = process.env.LTI_API_BASE
  const savedLaunch = process.env.LTI_TOOL_LAUNCH_URL
  afterEach(() => {
    if (saved === undefined) delete process.env.LTI_API_BASE
    else process.env.LTI_API_BASE = saved
    if (savedLaunch === undefined) delete process.env.LTI_TOOL_LAUNCH_URL
    else process.env.LTI_TOOL_LAUNCH_URL = savedLaunch
  })

  it('lists absolute https addresses derived from LTI_API_BASE', async () => {
    process.env.LTI_API_BASE = 'https://id.example.com/api/'
    delete process.env.LTI_TOOL_LAUNCH_URL
    const c = new PlatformsController({ list: async () => [] } as never, {} as never)
    const { endpoints } = await c.list()
    expect(endpoints).toEqual({
      registrationUrl: 'https://id.example.com/api/lti/tool/register',
      loginUrl: 'https://id.example.com/api/lti/tool/login',
      launchUrl: 'https://id.example.com/api/lti/tool/launch',
      jwksUrl: 'https://id.example.com/api/lti/tool/jwks',
    })
    for (const u of Object.values(endpoints)) expect(new URL(u).protocol).toBe('https:')
  })
})
