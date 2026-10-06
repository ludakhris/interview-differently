import {
  generateKeyPair,
  jwksOf,
  jwksKeyResolver,
  keyPairFromPem,
  LtiError,
  signJwt,
  verifyJwt,
} from './lti-spec'

const now = () => 1_700_000_000
const base = { iss: 'https://p', aud: 'tool', iat: now(), exp: now() + 300, nonce: 'n1' }

describe('lti-spec jwt', () => {
  const pair = generateKeyPair()
  const keyFor = async (kid: string | undefined) => (kid === pair.kid ? pair.publicJwk : undefined)
  const opts = { issuer: 'https://p', audience: 'tool', keyFor, now }

  it('signs and verifies, and checks the nonce', async () => {
    const t = signJwt(base, pair)
    expect((await verifyJwt(t, { ...opts, nonce: 'n1' })).iss).toBe('https://p')
    await expect(verifyJwt(t, { ...opts, nonce: 'other' })).rejects.toThrow('Nonce')
  })

  it('rejects wrong issuer, audience, expiry, unknown key, and tampering', async () => {
    await expect(verifyJwt(signJwt({ ...base, iss: 'x' }, pair), opts)).rejects.toThrow('issuer')
    await expect(verifyJwt(signJwt({ ...base, aud: 'x' }, pair), opts)).rejects.toThrow('audience')
    await expect(verifyJwt(signJwt({ ...base, exp: now() - 500 }, pair), opts)).rejects.toThrow(
      'expired'
    )
    await expect(verifyJwt(signJwt(base, generateKeyPair()), opts)).rejects.toThrow(
      'Unknown signing key'
    )
    const t = signJwt(base, pair).split('.')
    const forged = [
      t[0],
      Buffer.from(JSON.stringify({ ...base, sub: 'admin' })).toString('base64url'),
      t[2],
    ].join('.')
    await expect(verifyJwt(forged, opts)).rejects.toThrow('Bad signature')
    await expect(verifyJwt('a.b', opts)).rejects.toThrow(LtiError)
  })

  it('refuses alg none', async () => {
    const h = Buffer.from(JSON.stringify({ alg: 'none', kid: pair.kid })).toString('base64url')
    const b = Buffer.from(JSON.stringify(base)).toString('base64url')
    await expect(verifyJwt(`${h}.${b}.`, opts)).rejects.toThrow('algorithm')
  })

  it('loads the same key pair from PEM and resolves keys from a JWKS URL, refetching on rotation', async () => {
    expect(keyPairFromPem(pair.privateKeyPem).kid).toBe(pair.kid)
    const second = generateKeyPair()
    let served = jwksOf(pair)
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify(served)))
    const resolve = jwksKeyResolver('https://p/jwks', fetchImpl as unknown as typeof fetch)
    expect((await resolve(pair.kid))?.kid).toBe(pair.kid)
    served = jwksOf(pair, second)
    expect((await resolve(second.kid))?.kid).toBe(second.kid)
  })

  it.each([['null'], ['[]'], ['5'], ['"x"']])(
    'rejects a payload that is not a JSON object (%s) as a 400',
    async (json) => {
      const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid: pair.kid })).toString('base64url')
      const b = Buffer.from(json).toString('base64url')
      await expect(verifyJwt(`${h}.${b}.x`, opts)).rejects.toMatchObject({
        status: 400,
        message: 'Malformed token',
      })
    }
  )

  it('rejects a header that is not a JSON object as a 400', async () => {
    const h = Buffer.from('null').toString('base64url')
    const b = Buffer.from(JSON.stringify(base)).toString('base64url')
    await expect(verifyJwt(`${h}.${b}.x`, opts)).rejects.toMatchObject({ status: 400 })
  })
})

describe('jwksKeyResolver', () => {
  const pair = generateKeyPair()
  const ok = (body: unknown) => new Response(typeof body === 'string' ? body : JSON.stringify(body))
  const resolverOf = (impl: (...a: Parameters<typeof fetch>) => Promise<Response>) => ({
    fetchImpl: jest.fn(impl),
    resolve: (f: jest.Mock) => jwksKeyResolver('https://secret.example/jwks', f as never),
  })

  it('does not refetch for the same unknown kid within a minute', async () => {
    const { fetchImpl, resolve } = resolverOf(async () => ok(jwksOf(pair)))
    const r = resolve(fetchImpl)
    expect(await r('nope')).toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(await r('nope')).toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect((await r(pair.kid))?.kid).toBe(pair.kid)
  })

  it('refetches an unknown kid again after the minute is up', async () => {
    const { fetchImpl, resolve } = resolverOf(async () => ok(jwksOf(pair)))
    const r = resolve(fetchImpl)
    const t = Date.now()
    await r('nope')
    const spy = jest.spyOn(Date, 'now').mockReturnValue(t + 61_000)
    try {
      await r('nope')
    } finally {
      spy.mockRestore()
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('shares one in-flight load between concurrent callers', async () => {
    const { fetchImpl, resolve } = resolverOf(async () => ok(jwksOf(pair)))
    const r = resolve(fetchImpl)
    const out = await Promise.all([r(pair.kid), r(pair.kid), r(pair.kid)])
    expect(out.every((k) => k?.kid === pair.kid)).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('gives the fetch a timeout signal', async () => {
    const { fetchImpl, resolve } = resolverOf(async () => ok(jwksOf(pair)))
    await resolve(fetchImpl)(pair.kid)
    expect(fetchImpl.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('refuses an oversized body, and never puts the URL in the error', async () => {
    const big = { keys: [], pad: 'x'.repeat(100_001) }
    const failures: ((...a: Parameters<typeof fetch>) => Promise<Response>)[] = [
      async () => ok(big),
      async () => new Response('no', { status: 500 }),
      async () => {
        throw new Error('connect ECONNREFUSED https://secret.example/jwks')
      },
      async () => ok('not json'),
    ]
    for (const impl of failures) {
      const { fetchImpl, resolve } = resolverOf(impl)
      const err = await resolve(fetchImpl)('k').catch((e) => e)
      expect(err).toBeInstanceOf(LtiError)
      expect(err.status).toBe(502)
      expect(err.message).toBe('Could not load signing keys')
    }
  })
})
