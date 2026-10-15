import { ServiceUnavailableException } from '@nestjs/common'
import {
  isPreview,
  PLACEHOLDER_SECRET,
  PLAYER_TTL_S,
  playerSecret,
  playerUrl,
  PREVIEW_TTL_S,
  signPlayerToken,
  signPreviewToken,
  verifyPlayerToken,
  verifyPreviewToken,
  type PlayerToken,
} from './player-token'

const claims = { sub: 'learner-1', cohortId: 'c1', itemId: 'i1', useId: 'u1' }
const NOW = 1_800_000_000
const SECRET = 'test-secret'

describe('player token', () => {
  it('verifies what it signed and carries the slot', () => {
    const token = signPlayerToken(claims, NOW, SECRET)
    expect(verifyPlayerToken(token, NOW + 60, SECRET)).toEqual({
      ...claims,
      exp: NOW + PLAYER_TTL_S,
    })
  })

  it('expires after four hours', () => {
    const token = signPlayerToken(claims, NOW, SECRET)
    expect(PLAYER_TTL_S).toBe(4 * 60 * 60)
    expect(verifyPlayerToken(token, NOW + PLAYER_TTL_S - 1, SECRET)).not.toBeNull()
    expect(verifyPlayerToken(token, NOW + PLAYER_TTL_S + 1, SECRET)).toBeNull()
  })

  it('refuses a token signed with another secret', () => {
    expect(verifyPlayerToken(signPlayerToken(claims, NOW, 'other'), NOW, SECRET)).toBeNull()
  })

  it('refuses a token whose claims were changed', () => {
    const [, sig] = signPlayerToken(claims, NOW, SECRET).split('.')
    const forged: PlayerToken = { ...claims, sub: 'someone-else', exp: NOW + PLAYER_TTL_S }
    const body = Buffer.from(JSON.stringify(forged)).toString('base64url')
    expect(verifyPlayerToken(`${body}.${sig}`, NOW, SECRET)).toBeNull()
  })

  it('refuses malformed tokens and missing claims', () => {
    for (const bad of [undefined, '', 'abc', 'a.b.c', 'a.b'])
      expect(verifyPlayerToken(bad, NOW, SECRET)).toBeNull()
    const missing = signPlayerToken({ ...claims, useId: '' }, NOW, SECRET)
    expect(verifyPlayerToken(missing, NOW, SECRET)).toBeNull()
  })

  describe('a preview link', () => {
    const preview = { sub: 'reviewer-1', lessonId: 'lesson-1' }

    it('verifies what it signed, names the lesson and says it is a preview', () => {
      const token = signPreviewToken(preview, NOW, SECRET)
      const opened = verifyPreviewToken(token, NOW + 60, SECRET)
      expect(opened).toEqual({ preview: true, ...preview, exp: NOW + PREVIEW_TTL_S })
      expect(isPreview(opened!)).toBe(true)
      const learner = verifyPlayerToken(signPlayerToken(claims, NOW, SECRET), NOW, SECRET)
      expect(isPreview(learner!)).toBe(false)
    })

    it('expires after an hour', () => {
      const token = signPreviewToken(preview, NOW, SECRET)
      expect(PREVIEW_TTL_S).toBe(60 * 60)
      expect(verifyPreviewToken(token, NOW + PREVIEW_TTL_S - 1, SECRET)).not.toBeNull()
      expect(verifyPreviewToken(token, NOW + PREVIEW_TTL_S + 1, SECRET)).toBeNull()
    })

    it('never verifies as a learner link, nor a learner link as a preview', () => {
      expect(verifyPlayerToken(signPreviewToken(preview, NOW, SECRET), NOW, SECRET)).toBeNull()
      expect(verifyPreviewToken(signPlayerToken(claims, NOW, SECRET), NOW, SECRET)).toBeNull()
      // Even a learner-signed body that claims to be a preview is refused: the HMAC prefix differs.
      const body = Buffer.from(
        JSON.stringify({ preview: true, ...preview, exp: NOW + PREVIEW_TTL_S })
      ).toString('base64url')
      const [, learnerSig] = signPlayerToken(claims, NOW, SECRET).split('.')
      expect(verifyPreviewToken(`${body}.${learnerSig}`, NOW, SECRET)).toBeNull()
    })

    it('refuses another secret, changed claims and a missing lesson', () => {
      expect(verifyPreviewToken(signPreviewToken(preview, NOW, 'other'), NOW, SECRET)).toBeNull()
      const [, sig] = signPreviewToken(preview, NOW, SECRET).split('.')
      const forged = Buffer.from(
        JSON.stringify({ preview: true, ...preview, lessonId: 'lesson-2', exp: NOW + 60 })
      ).toString('base64url')
      expect(verifyPreviewToken(`${forged}.${sig}`, NOW, SECRET)).toBeNull()
      expect(
        verifyPreviewToken(signPreviewToken({ ...preview, lessonId: '' }, NOW, SECRET), NOW, SECRET)
      ).toBeNull()
    })
  })

  it('puts the token in the fragment of the player link', () => {
    const before = process.env.SPARK_WEB_URL
    process.env.SPARK_WEB_URL = 'https://spark.example.test/'
    expect(playerUrl('tok')).toBe('https://spark.example.test/lesson#token=tok')
    delete process.env.SPARK_WEB_URL
    expect(playerUrl('tok')).toBe('http://localhost:5175/lesson#token=tok')
    if (before !== undefined) process.env.SPARK_WEB_URL = before
  })

  it('in production, refuses to link to localhost when SPARK_WEB_URL is missing', () => {
    const before = { url: process.env.SPARK_WEB_URL, node: process.env.NODE_ENV }
    try {
      process.env.NODE_ENV = 'production'
      delete process.env.SPARK_WEB_URL
      expect(() => playerUrl('tok')).toThrow(ServiceUnavailableException)
      expect(() => playerUrl('tok')).toThrow('Lessons are not set up on this server')
      process.env.SPARK_WEB_URL = 'https://spark.example.test'
      expect(playerUrl('tok')).toBe('https://spark.example.test/lesson#token=tok')
    } finally {
      for (const [k, v] of [
        ['SPARK_WEB_URL', before.url],
        ['NODE_ENV', before.node],
      ] as const)
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
    }
  })

  describe('the secret', () => {
    const env = { secret: process.env.SPARK_SESSION_SECRET, node: process.env.NODE_ENV }
    afterEach(() => {
      for (const [k, v] of [
        ['SPARK_SESSION_SECRET', env.secret],
        ['NODE_ENV', env.node],
      ] as const)
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
    })

    it('uses SPARK_SESSION_SECRET when it is set', () => {
      process.env.SPARK_SESSION_SECRET = 'configured'
      process.env.NODE_ENV = 'production'
      expect(playerSecret()).toBe('configured')
    })

    it('in production, refuses to sign without a real secret instead of making one up', () => {
      process.env.NODE_ENV = 'production'
      for (const unset of [undefined, '', PLACEHOLDER_SECRET]) {
        if (unset === undefined) delete process.env.SPARK_SESSION_SECRET
        else process.env.SPARK_SESSION_SECRET = unset
        expect(() => signPlayerToken(claims)).toThrow(ServiceUnavailableException)
        expect(() => signPlayerToken(claims)).toThrow('Lessons are not set up on this server')
      }
    })

    it('elsewhere, falls back to one random secret per process', () => {
      process.env.NODE_ENV = 'development'
      delete process.env.SPARK_SESSION_SECRET
      const first = playerSecret()
      expect(first).toMatch(/^[0-9a-f]{64}$/)
      expect(playerSecret()).toBe(first)
      process.env.SPARK_SESSION_SECRET = PLACEHOLDER_SECRET
      expect(playerSecret()).toBe(first)
      expect(verifyPlayerToken(signPlayerToken(claims))).toMatchObject(claims)
    })
  })
})
