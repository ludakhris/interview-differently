import { BadRequestException, NotFoundException } from '@nestjs/common'
import { BUILT_IN_ID, PlatformRegistryService } from './platform-registry.service'
import { fakePlatformDb, registryOf } from './platform-test-helpers'

const BASE = 'http://api.test/api'
const ENV = { issuer: 'http://api.test', clientId: 'ld-platform' }
const row = (over: Record<string, unknown> = {}) => ({
  name: 'Moodle',
  issuer: 'https://lms.example',
  clientId: 'c1',
  deploymentId: 'd1',
  authUrl: 'https://lms.example/auth',
  tokenUrl: 'https://lms.example/token',
  jwksUrl: 'https://lms.example/jwks',
  ...over,
})
const who = { userId: 'u1', userName: 'Boss' }

beforeEach(() => {
  process.env.LTI_API_BASE = BASE
  for (const k of ['LTI_PLATFORM_ISSUER', 'LTI_TOOL_CLIENT_ID', 'LTI_DEPLOYMENT_ID'])
    delete process.env[k]
})
afterEach(() => {
  delete process.env.LTI_API_BASE
  jest.restoreAllMocks()
})

describe('PlatformRegistryService', () => {
  describe('fails closed', () => {
    it('knows no platform, not even the built-in one, until a read has succeeded', async () => {
      const db = fakePlatformDb([row({ enabled: true })])
      db.ltiPlatform.findMany = async () => {
        throw new Error('db down')
      }
      const reg = registryOf(db)
      expect(await reg.forLogin('https://lms.example', 'c1')).toBeUndefined()
      expect(await reg.forLogin(ENV.issuer, ENV.clientId)).toBeUndefined()
      expect(await reg.forLaunch(undefined)).toBeUndefined()
      expect(await reg.forLaunch('p1')).toBeUndefined()
    })

    it('keeps the last good read when a refresh fails, so a switched-off platform stays off', async () => {
      const db = fakePlatformDb([row({ enabled: false })])
      const reg = registryOf(db)
      expect((await reg.forLogin('https://lms.example', 'c1'))?.enabled).toBe(false)
      db.ltiPlatform.findMany = async () => {
        throw new Error('db down')
      }
      const now = Date.now()
      jest.spyOn(Date, 'now').mockReturnValue(now + 60_000)
      expect((await reg.forLogin('https://lms.example', 'c1'))?.enabled).toBe(false)
    })

    it('picks up another instance’s change after 15 seconds, not before', async () => {
      const db = fakePlatformDb([row()])
      const reg = registryOf(db)
      expect((await reg.forLogin('https://lms.example', 'c1'))?.enabled).toBe(false)
      db.platforms[0].enabled = true
      expect((await reg.forLogin('https://lms.example', 'c1'))?.enabled).toBe(false)
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 16_000)
      expect((await reg.forLogin('https://lms.example', 'c1'))?.enabled).toBe(true)
    })
  })

  describe('lookup by issuer and client id', () => {
    it('finds the pair, and the same client id under another issuer is another platform', async () => {
      const reg = registryOf(
        fakePlatformDb([
          row({ enabled: true }),
          row({ issuer: 'https://other.example', name: 'Other', enabled: true }),
        ])
      )
      expect((await reg.forLogin('https://lms.example', 'c1'))?.id).toBe('p1')
      expect((await reg.forLogin('https://other.example', 'c1'))?.id).toBe('p2')
      expect(await reg.forLogin('https://third.example', 'c1')).toBeUndefined()
      expect(await reg.forLogin('https://lms.example', 'c2')).toBeUndefined()
      expect(await reg.forLogin('https://lms.example', undefined)).toBeUndefined()
      expect(await reg.forLogin(undefined, 'c1')).toBeUndefined()
    })

    it('falls back to the built-in platform only when no row has its pair', async () => {
      const none = registryOf(fakePlatformDb([row({ enabled: true })]))
      expect(await none.forLogin(ENV.issuer, ENV.clientId)).toMatchObject({
        id: BUILT_IN_ID,
        enabled: true,
        authUrl: `${BASE}/lti/platform/auth`,
        tokenUrl: `${BASE}/lti/platform/token`,
        jwksUrl: `${BASE}/lti/platform/jwks`,
        deploymentId: '1',
      })
      // the pair with a different client id is not the built-in platform
      expect(await none.forLogin(ENV.issuer, 'other')).toBeUndefined()
    })

    it('a switched-off row for the built-in pair really switches it off', async () => {
      const reg = registryOf(
        fakePlatformDb([row({ ...ENV, enabled: false, authUrl: 'http://x/a' })])
      )
      const found = await reg.forLogin(ENV.issuer, ENV.clientId)
      expect(found).toMatchObject({ id: 'p1', enabled: false })
      // and a launch begun with the built-in id is refused the same way
      expect((await reg.forLaunch(BUILT_IN_ID))?.enabled).toBe(false)
      expect((await reg.forLaunch(undefined))?.enabled).toBe(false)
    })

    it('a row for the built-in pair wins over the settings', async () => {
      const reg = registryOf(
        fakePlatformDb([row({ ...ENV, enabled: true, authUrl: 'http://from-table/auth' })])
      )
      expect((await reg.forLogin(ENV.issuer, ENV.clientId))?.authUrl).toBe('http://from-table/auth')
    })
  })

  describe('returning a score', () => {
    it('uses a platform that has since been switched off', async () => {
      const reg = registryOf(fakePlatformDb([row({ enabled: false })]))
      expect(await reg.forScore('p1')).toMatchObject({ id: 'p1', enabled: false })
    })

    it('no id (an older token) is the built-in platform; an unknown id is nothing', async () => {
      const reg = registryOf(fakePlatformDb([row({ enabled: true })]))
      expect((await reg.forScore(undefined))?.id).toBe(BUILT_IN_ID)
      expect((await reg.forScore(BUILT_IN_ID))?.id).toBe(BUILT_IN_ID)
      expect(await reg.forScore('nope')).toBeUndefined()
    })
  })

  describe('for administrators', () => {
    it('lists registered platforms, and the built-in one only while no row stands in for it', async () => {
      const a = registryOf(fakePlatformDb([row()]))
      const list = await a.list()
      expect(list.map((p) => [p.id, p.source])).toEqual([
        [BUILT_IN_ID, 'built-in'],
        ['p1', 'registered'],
      ])
      expect(list[0]).toMatchObject({ enabled: true, createdAt: null, approvedAt: null })
      expect(list[1]).toMatchObject({ enabled: false, approvedAt: null, clientId: 'c1' })
      expect(typeof list[1].createdAt).toBe('string')
      const b = registryOf(fakePlatformDb([row(ENV)]))
      expect((await b.list()).map((p) => p.source)).toEqual(['registered'])
    })

    it('switches a platform on and off, writing the history in the same transaction', async () => {
      const db = fakePlatformDb([row()])
      const reg = registryOf(db)
      const on = await reg.setEnabled(who, 'p1', true)
      expect(on).toMatchObject({ enabled: true })
      expect(on.approvedAt).toEqual(expect.any(String))
      expect((await reg.forLogin('https://lms.example', 'c1'))?.enabled).toBe(true)
      const off = await reg.setEnabled(who, 'p1', false)
      expect(off.enabled).toBe(false)
      expect(off.approvedAt).toBe(on.approvedAt) // kept: it was approved once
      expect(db.changes.map((c) => [c.action, c.userId, c.userName, c.changes])).toEqual([
        ['enabled', 'u1', 'Boss', { enabled: { from: false, to: true } }],
        ['disabled', 'u1', 'Boss', { enabled: { from: true, to: false } }],
      ])
    })

    it('leaves no history when nothing changes, and a failed write leaves none either', async () => {
      const db = fakePlatformDb([row({ enabled: true })])
      const reg = registryOf(db)
      await reg.setEnabled(who, 'p1', true)
      expect(db.changes).toHaveLength(0)
      db.ltiPlatformChange.create = ((a: never) => ({
        then: (_ok: unknown, bad: (e: unknown) => unknown) =>
          Promise.reject(new Error('boom')).then(undefined, bad),
        a,
      })) as never
      await expect(reg.setEnabled(who, 'p1', false)).rejects.toThrow('boom')
      expect(db.platforms[0].enabled).toBe(true) // rolled back with the history
    })

    it('refuses to change the built-in platform (400) or an unknown one (404)', async () => {
      const reg = registryOf(fakePlatformDb([row()]))
      await expect(reg.setEnabled(who, BUILT_IN_ID, false)).rejects.toBeInstanceOf(
        BadRequestException
      )
      await expect(reg.setEnabled(who, 'nope', true)).rejects.toBeInstanceOf(NotFoundException)
    })

    it('reads history newest first, for all or one platform', async () => {
      const db = fakePlatformDb([row(), row({ clientId: 'c2' })])
      const reg = registryOf(db)
      await reg.setEnabled(who, 'p1', true)
      await reg.setEnabled(who, 'p2', true)
      await reg.setEnabled(who, 'p1', false)
      expect((await reg.history()).map((c) => [c.subjectId, c.action])).toEqual([
        ['p1', 'disabled'],
        ['p2', 'enabled'],
        ['p1', 'enabled'],
      ])
      expect((await reg.history('p2')).map((c) => c.action)).toEqual(['enabled'])
      expect(await reg.history('nope')).toEqual([])
      expect(Object.keys((await reg.history())[0]).sort()).toEqual(
        ['action', 'changes', 'createdAt', 'id', 'subjectId', 'subjectName', 'userName'].sort()
      )
    })
  })

  describe('rejecting a registration', () => {
    it('deletes a never-approved platform and writes the history in the same transaction', async () => {
      const db = fakePlatformDb([row()])
      const reg = registryOf(db)
      await reg.reject(who, 'p1')
      expect(db.platforms).toHaveLength(0)
      expect(db.changes).toHaveLength(1)
      expect(db.changes[0]).toMatchObject({
        subjectId: 'p1',
        subjectName: 'Moodle',
        action: 'rejected',
        userId: 'u1',
        userName: 'Boss',
      })
      expect(await reg.forLogin('https://lms.example', 'c1')).toBeUndefined()
    })

    it('refuses an enabled platform and one approved then switched off (400), built-in (400), unknown (404)', async () => {
      const db = fakePlatformDb([row({ enabled: true }), row({ clientId: 'c2' })])
      const reg = registryOf(db)
      await reg.setEnabled(who, 'p2', true)
      await reg.setEnabled(who, 'p2', false)
      for (const id of ['p1', 'p2', BUILT_IN_ID])
        await expect(reg.reject(who, id)).rejects.toBeInstanceOf(BadRequestException)
      await expect(reg.reject(who, 'nope')).rejects.toBeInstanceOf(NotFoundException)
      expect(db.platforms).toHaveLength(2)
      expect(db.changes.map((c) => c.action)).toEqual(['enabled', 'disabled'])
    })

    it('leaves the row when the history write fails', async () => {
      const db = fakePlatformDb([row()])
      db.ltiPlatformChange.create = (() => Promise.reject(new Error('boom'))) as never
      await expect(registryOf(db).reject(who, 'p1')).rejects.toThrow('boom')
      expect(db.platforms).toHaveLength(1)
    })

    it('does not delete a platform approved after the check (guarded delete)', async () => {
      const db = fakePlatformDb([row()])
      const find = db.ltiPlatform.findUnique
      db.ltiPlatform.findUnique = (async (a: never) => {
        const r = await find(a)
        db.platforms[0].enabled = true // an admin approves between the read and the delete
        return r
      }) as never
      await expect(registryOf(db).reject(who, 'p1')).rejects.toBeInstanceOf(BadRequestException)
      expect(db.platforms).toHaveLength(1)
      expect(db.changes).toHaveLength(0)
    })
  })

  describe('pending count', () => {
    const many = (n: number, over: Record<string, unknown>) =>
      Array.from({ length: n }, (_, i) => row({ clientId: `c${i}`, ...over }))

    it('counts 50 never-approved rows, but not 50 approved then switched off', async () => {
      expect(await registryOf(fakePlatformDb(many(50, {}))).pendingCount()).toBe(50)
      const off = registryOf(fakePlatformDb(many(50, { approvedAt: new Date(), enabled: false })))
      expect(await off.pendingCount()).toBe(0)
    })
  })

  it('logs what each of two concurrent toggles really changed', async () => {
    const db = fakePlatformDb([row()])
    const reg = registryOf(db)
    await Promise.all([reg.setEnabled(who, 'p1', true), reg.setEnabled(who, 'p1', false)])
    const froms = db.changes.map((c) => (c.changes as { enabled: { from: boolean } }).enabled.from)
    // every logged "from" matches the state before that change
    let state = false
    for (const c of db.changes) {
      const e = (c.changes as { enabled: { from: boolean; to: boolean } }).enabled
      expect(e.from).toBe(state)
      state = e.to
    }
    expect(froms.length).toBeGreaterThan(0)
  })

  it('is constructed from the database alone', () => {
    expect(new PlatformRegistryService(fakePlatformDb() as never)).toBeDefined()
  })
})
