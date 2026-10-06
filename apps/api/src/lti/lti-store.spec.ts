import { LtiStore, MemoryLtiStore } from './lti-store'
import { PrismaLtiStore } from './lti-store.prisma'
import { assertLtiProductionConfig, loadSigningKeys } from './lti-env'
import { generateKeyPair } from './lti-spec'

/** The behavior every LtiStore must have; run against each implementation. */
function storeContract(
  name: string,
  make: () => { store: LtiStore; advance: (s: number) => void }
) {
  describe(`LtiStore contract: ${name}`, () => {
    let store: LtiStore
    let advance: (s: number) => void
    beforeEach(() => ({ store, advance } = make()))

    it('put then peek returns the value without consuming it', async () => {
      await store.put('s', 'k', { nonce: 'n' }, 60)
      expect(await store.peek('s', 'k')).toEqual({ nonce: 'n' })
      expect(await store.peek('s', 'k')).toEqual({ nonce: 'n' })
    })

    it('keeps scopes and keys apart', async () => {
      await store.put('a', 'k', 1, 60)
      expect(await store.peek('b', 'k')).toBeNull()
      expect(await store.peek('a', 'other')).toBeNull()
    })

    it('take returns the value once', async () => {
      await store.put('s', 'k', { v: 1 }, 60)
      expect(await store.take('s', 'k')).toEqual({ v: 1 })
      expect(await store.take('s', 'k')).toBeNull()
      expect(await store.peek('s', 'k')).toBeNull()
    })

    it('lets only one of many concurrent takes win', async () => {
      await store.put('s', 'k', { v: 1 }, 60)
      const got = await Promise.all(Array.from({ length: 10 }, () => store.take('s', 'k')))
      expect(got.filter((v) => v !== null)).toHaveLength(1)
    })

    it('forgets an entry once it has expired', async () => {
      await store.put('s', 'k', { v: 1 }, 10)
      advance(9)
      expect(await store.peek('s', 'k')).toEqual({ v: 1 })
      advance(2)
      expect(await store.peek('s', 'k')).toBeNull()
      expect(await store.take('s', 'k')).toBeNull()
    })

    it('put replaces an entry and its expiry', async () => {
      await store.put('s', 'k', 'a', 10)
      await store.put('s', 'k', 'b', 100)
      advance(50)
      expect(await store.peek('s', 'k')).toBe('b')
    })

    it('claim is won once, even concurrently, and lost while the entry lives', async () => {
      const wins = await Promise.all(Array.from({ length: 10 }, () => store.claim('s', 'k', 60)))
      expect(wins.filter(Boolean)).toHaveLength(1)
      expect(await store.claim('s', 'k', 60)).toBe(false)
    })

    it('claim can be won again after expiry or release', async () => {
      expect(await store.claim('s', 'k', 10)).toBe(true)
      advance(11)
      expect(await store.claim('s', 'k', 10)).toBe(true)
      await store.release('s', 'k')
      expect(await store.claim('s', 'k', 10)).toBe(true)
    })

    it('claim loses to a put entry, and put over a claim keeps it claimed', async () => {
      await store.put('s', 'a', true, 60)
      expect(await store.claim('s', 'a', 60)).toBe(false)
      expect(await store.claim('s', 'b', 5)).toBe(true)
      await store.put('s', 'b', true, 60)
      advance(10)
      expect(await store.claim('s', 'b', 5)).toBe(false)
    })

    it('release removes an entry and is harmless when there is none', async () => {
      await store.put('s', 'k', 1, 60)
      await store.release('s', 'k')
      await store.release('s', 'k')
      expect(await store.peek('s', 'k')).toBeNull()
    })

    it('count increments atomically and starts over after the window', async () => {
      const counts = await Promise.all(Array.from({ length: 5 }, () => store.count('r', 'ip', 60)))
      expect([...counts].sort()).toEqual([1, 2, 3, 4, 5])
      advance(30)
      expect(await store.count('r', 'ip', 60)).toBe(6)
      advance(31) // 61s after the first hit: the window is not extended by later hits
      expect(await store.count('r', 'ip', 60)).toBe(1)
      expect(await store.count('r', 'other', 60)).toBe(1)
    })
  })
}

storeContract('MemoryLtiStore', () => {
  const store = new MemoryLtiStore()
  let t = 1_000_000
  store.now = () => t
  return { store, advance: (s) => (t += s * 1000) }
})

describe('PrismaLtiStore statements', () => {
  const sqlOf = (call: unknown[]) => (call[0] as string[]).join('?').replace(/\s+/g, ' ')
  function make() {
    const prisma = { $executeRaw: jest.fn(async () => 1), $queryRaw: jest.fn(async () => []) }
    return { prisma, store: new PrismaLtiStore(prisma as any) }
  }
  beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0.99)) // no opportunistic cleanup
  afterEach(() => jest.restoreAllMocks())

  it('put is one upsert', async () => {
    const { prisma, store } = make()
    await store.put('s', 'k', { a: 1 }, 30)
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
    const call = prisma.$executeRaw.mock.calls[0] as unknown as unknown[]
    expect(sqlOf(call)).toContain('INSERT INTO "LtiSingleUse"')
    expect(sqlOf(call)).toContain('ON CONFLICT ("scope", "key") DO UPDATE')
    expect(call.slice(1)).toEqual([expect.any(String), 's', 'k', '{"a":1}', 30])
  })

  it('peek reads only live rows and does not delete', async () => {
    const { prisma, store } = make()
    prisma.$queryRaw.mockResolvedValueOnce([{ value: { a: 1 } }] as never)
    expect(await store.peek('s', 'k')).toEqual({ a: 1 })
    const sql = sqlOf(prisma.$queryRaw.mock.calls[0] as unknown as unknown[])
    expect(sql).toContain('SELECT "value"')
    expect(sql).toContain(`"expiresAt" > (NOW() AT TIME ZONE 'UTC')`)
    expect(sql).not.toContain('DELETE')
  })

  it('take is a single DELETE ... RETURNING of a live row', async () => {
    const { prisma, store } = make()
    prisma.$queryRaw.mockResolvedValueOnce([{ value: { a: 1 } }] as never)
    expect(await store.take('s', 'k')).toEqual({ a: 1 })
    expect(await store.take('s', 'k')).toBeNull()
    const sql = sqlOf(prisma.$queryRaw.mock.calls[0] as unknown as unknown[])
    expect(sql).toMatch(/^ DELETE FROM "LtiSingleUse" WHERE .*"expiresAt" > .* RETURNING "value"$/)
  })

  it('claim wins only when the statement returns a row, and only takes over expired rows', async () => {
    const { prisma, store } = make()
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'x' }] as never)
    expect(await store.claim('s', 'k', 30)).toBe(true)
    expect(await store.claim('s', 'k', 30)).toBe(false)
    const sql = sqlOf(prisma.$queryRaw.mock.calls[0] as unknown as unknown[])
    expect(sql).toContain('ON CONFLICT ("scope", "key") DO UPDATE')
    expect(sql).toContain(
      `WHERE "LtiSingleUse"."expiresAt" <= (NOW() AT TIME ZONE 'UTC') RETURNING "id"`
    )
  })

  it('release deletes by scope and key', async () => {
    const { prisma, store } = make()
    await store.release('s', 'k')
    const call = prisma.$executeRaw.mock.calls[0] as unknown as unknown[]
    expect(sqlOf(call)).toContain('DELETE FROM "LtiSingleUse" WHERE "scope" = ? AND "key" = ?')
    expect(call.slice(1)).toEqual(['s', 'k'])
  })

  it('count is one upsert that resets an expired window and returns the count', async () => {
    const { prisma, store } = make()
    prisma.$queryRaw.mockResolvedValueOnce([{ count: 3 }] as never)
    expect(await store.count('r', 'ip', 60)).toBe(3)
    const sql = sqlOf(prisma.$queryRaw.mock.calls[0] as unknown as unknown[])
    expect(sql).toContain('"count" = CASE WHEN "LtiSingleUse"."expiresAt" <=')
    expect(sql).toContain('"LtiSingleUse"."count" + 1')
    expect(sql).toContain('RETURNING "count"')
  })

  it('cleans expired rows in bounded batches: at start, and on a small share of writes', async () => {
    const { prisma, store } = make()
    await store.onModuleInit()
    const sql = sqlOf(prisma.$executeRaw.mock.calls[0] as unknown as unknown[])
    expect(sql).toContain('DELETE FROM "LtiSingleUse" WHERE "id" IN ( SELECT "id"')
    expect(sql).toContain('LIMIT ?')
    expect(prisma.$executeRaw.mock.calls[0].slice(1)).toEqual([500])

    prisma.$executeRaw.mockClear()
    await store.put('s', 'k', 1, 5)
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1) // the 0.99 draw skips cleanup
    jest.spyOn(Math, 'random').mockReturnValue(0.001)
    prisma.$executeRaw.mockClear()
    await store.put('s', 'k', 1, 5)
    await new Promise((r) => setImmediate(r))
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2)
  })

  it('never lets a failed cleanup fail the boot', async () => {
    const { prisma, store } = make()
    prisma.$executeRaw.mockRejectedValue(new Error('no table'))
    await expect(store.onModuleInit()).resolves.toBeUndefined()
  })
})

describe('assertLtiProductionConfig', () => {
  const all = {
    LTI_PLATFORM_PRIVATE_KEY: 'a',
    LTI_TOOL_PRIVATE_KEY: 'b',
    LTI_TOOL_SECRET: 'c',
    LTI_HINT_SECRET: 'd',
    LTI_LEARN_URL: 'https://learn.test',
    LTI_ID_WEB_URL: 'https://id.test',
  }

  it('does nothing outside production', () => {
    expect(() => assertLtiProductionConfig({ NODE_ENV: 'development' })).not.toThrow()
    expect(() => assertLtiProductionConfig({})).not.toThrow()
  })

  it('names every missing variable in production, blank counts as missing', () => {
    expect(() => assertLtiProductionConfig({ NODE_ENV: 'production' })).toThrow(
      'LTI_PLATFORM_PRIVATE_KEY, LTI_TOOL_PRIVATE_KEY, LTI_TOOL_SECRET, LTI_HINT_SECRET, LTI_LEARN_URL, LTI_ID_WEB_URL'
    )
    expect(() =>
      assertLtiProductionConfig({ NODE_ENV: 'production', ...all, LTI_TOOL_SECRET: '  ' })
    ).toThrow('LTI_TOOL_SECRET')
    const { LTI_LEARN_URL: _omit, ...withoutLearnUrl } = all
    expect(() => assertLtiProductionConfig({ NODE_ENV: 'production', ...withoutLearnUrl })).toThrow(
      'LTI_LEARN_URL'
    )
  })

  it('requires LTI_ID_WEB_URL in production', () => {
    const { LTI_ID_WEB_URL: _omit, ...withoutIdWeb } = all
    expect(() => assertLtiProductionConfig({ NODE_ENV: 'production', ...withoutIdWeb })).toThrow(
      'LTI_ID_WEB_URL'
    )
  })

  it('passes in production when all are set', () => {
    expect(() => assertLtiProductionConfig({ NODE_ENV: 'production', ...all })).not.toThrow()
  })
})

describe('loadSigningKeys', () => {
  it('uses the configured keys, with escaped newlines, and generates one when none is set', () => {
    const cur = generateKeyPair()
    const prev = generateKeyPair()
    const out = loadSigningKeys('CUR', 'PREV', {
      CUR: cur.privateKeyPem.replace(/\n/g, '\\n'),
      PREV: prev.privateKeyPem,
    })
    expect(out.current.kid).toBe(cur.kid)
    expect(out.previous?.kid).toBe(prev.kid)
    expect(loadSigningKeys('CUR', 'PREV', {}).previous).toBeUndefined()
  })

  it('ignores a previous key that is the current key', () => {
    const cur = generateKeyPair()
    expect(
      loadSigningKeys('CUR', 'PREV', { CUR: cur.privateKeyPem, PREV: cur.privateKeyPem }).previous
    ).toBeUndefined()
  })
})
