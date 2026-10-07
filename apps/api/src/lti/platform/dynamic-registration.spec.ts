import {
  parseRegistration,
  platformConfiguration,
  PLATFORM_CONFIG_CLAIM,
  registrationEndpoint,
  registrationResponse,
  TOOL_CONFIG_CLAIM,
} from './dynamic-registration'

const good = {
  application_type: 'web',
  response_types: ['id_token'],
  grant_types: ['implicit', 'client_credentials'],
  token_endpoint_auth_method: 'private_key_jwt',
  client_name: 'Acme Labs',
  initiate_login_uri: 'https://acme.example/lti/login',
  redirect_uris: ['https://acme.example/lti/launch', 'https://acme.example/lti/other'],
  jwks_uri: 'https://acme.example/.well-known/jwks.json',
  scope: 'openid https://purl.imsglobal.org/spec/lti-ags/scope/score https://example/other',
  [TOOL_CONFIG_CLAIM]: {
    domain: 'acme.example',
    target_link_uri: 'https://acme.example/lti/launch',
    messages: [{ type: 'LtiResourceLinkRequest' }],
  },
}

describe('the platform configuration a tool reads', () => {
  it('names the endpoints and what the platform supports', () => {
    const c = platformConfiguration()
    expect(c.registration_endpoint).toBe(registrationEndpoint())
    expect(c.token_endpoint_auth_methods_supported).toEqual(['private_key_jwt'])
    expect(c.id_token_signing_alg_values_supported).toEqual(['RS256'])
    expect(c.scopes_supported).toContain('openid')
    expect(c[PLATFORM_CONFIG_CLAIM]).toMatchObject({
      product_family_code: 'learndifferently',
      messages_supported: [{ type: 'LtiResourceLinkRequest' }],
    })
    expect(c.issuer).toMatch(/^https?:\/\//)
  })
})

describe('parseRegistration', () => {
  it("reads a complete registration, choosing the tool's own launch link, and keeps only scopes it can grant", () => {
    expect(parseRegistration(good)).toEqual({
      name: 'Acme Labs',
      loginUrl: 'https://acme.example/lti/login',
      launchUrl: 'https://acme.example/lti/launch',
      jwksUrl: 'https://acme.example/.well-known/jwks.json',
      redirectUris: good.redirect_uris,
      scope: 'openid https://purl.imsglobal.org/spec/lti-ags/scope/score',
    })
  })

  it('falls back to the first redirect URI when the target link is not one of them, and to openid scope', () => {
    const r = parseRegistration({
      ...good,
      scope: undefined,
      [TOOL_CONFIG_CLAIM]: { target_link_uri: 'https://elsewhere.example/x' },
    })
    expect(r.launchUrl).toBe('https://acme.example/lti/launch')
    expect(r.scope).toBe('openid')
  })

  it('accepts a minimal registration', () => {
    expect(
      parseRegistration({
        client_name: 'Tiny',
        initiate_login_uri: good.initiate_login_uri,
        redirect_uris: [good.redirect_uris[0]],
        jwks_uri: good.jwks_uri,
      }).name
    ).toBe('Tiny')
  })

  it('refuses what the platform cannot serve', () => {
    const bad = (over: object) => () => parseRegistration({ ...good, ...over })
    expect(() => parseRegistration(null)).toThrow(/JSON object/)
    expect(() => parseRegistration([])).toThrow(/JSON object/)
    expect(bad({ application_type: 'native' })).toThrow(/application_type/)
    expect(bad({ response_types: ['code'] })).toThrow(/response_types/)
    expect(bad({ grant_types: ['authorization_code'] })).toThrow(/grant_types/)
    expect(bad({ grant_types: ['client_credentials'] })).toThrow(/grant_types/)
    expect(bad({ token_endpoint_auth_method: 'client_secret_basic' })).toThrow(/private_key_jwt/)
    expect(bad({ jwks: { keys: [] } })).toThrow(/jwks_uri/)
    expect(bad({ redirect_uris: [] })).toThrow(/redirect_uris/)
    expect(bad({ redirect_uris: undefined })).toThrow(/redirect_uris/)
    expect(
      bad({ redirect_uris: Array.from({ length: 11 }, (_, i) => `https://acme.example/${i}`) })
    ).toThrow(/redirect_uris/)
    expect(bad({ client_name: '  ' })).toThrow(/client_name/)
    expect(bad({ client_name: 'x'.repeat(201) })).toThrow(/too long/)
    expect(bad({ client_name: 5 })).toThrow(/client_name/)
  })

  it('refuses a URL that is not public https, wherever it appears', () => {
    const bad = (over: object) => () => parseRegistration({ ...good, ...over })
    for (const u of [
      'http://acme.example/x',
      'https://10.0.0.5/x',
      'https://[::ffff:7f00:1]/x',
      'javascript:alert(1)',
    ])
      for (const field of ['initiate_login_uri', 'jwks_uri']) expect(bad({ [field]: u })).toThrow()
    expect(bad({ redirect_uris: ['https://169.254.169.254/x'] })).toThrow()
    expect(bad({ initiate_login_uri: undefined })).toThrow()
  })

  it('accepts a name up to the 80 characters a tool may have, and refuses longer before anything is spent', () => {
    expect(parseRegistration({ ...good, client_name: 'x'.repeat(80) }).name).toHaveLength(80)
    expect(() => parseRegistration({ ...good, client_name: 'x'.repeat(81) })).toThrow(/too long/)
  })

  it('strips bidirectional overrides, zero-width and separator characters from the name', () => {
    expect(
      parseRegistration({ ...good, client_name: 'Ac\u202Eme\u200B La\u2066bs\u2028' }).name
    ).toBe('Ac me La bs')
  })

  it('tidies the name: no control characters, no runs of space', () => {
    expect(parseRegistration({ ...good, client_name: '  Acme\u0000\n   Labs\t' }).name).toBe(
      'Acme Labs'
    )
  })
})

describe('registrationResponse', () => {
  it('echoes what was registered with the client and deployment id the platform made', () => {
    const reg = parseRegistration(good)
    const out = registrationResponse(reg, 'ld-abc', 'dep1', good) as Record<string, unknown>
    expect(out).toMatchObject({
      client_id: 'ld-abc',
      client_name: 'Acme Labs',
      token_endpoint_auth_method: 'private_key_jwt',
      jwks_uri: reg.jwksUrl,
      initiate_login_uri: reg.loginUrl,
      redirect_uris: reg.redirectUris,
    })
    expect(out[TOOL_CONFIG_CLAIM]).toMatchObject({
      deployment_id: 'dep1',
      target_link_uri: reg.launchUrl,
      domain: 'acme.example',
    })
  })
})
