import { runInNewContext } from 'node:vm'
import {
  AGS_SCOPE_SCORE,
  CLAIM,
  LEARNER_ROLE,
  LtiError,
  generateKeyPair,
  jwksOf,
  signJwt,
} from '../lti-spec'
import { MemoryLtiStore } from '../lti-store'
import type { CheckpointPlacement } from '../../core/practice-port'
import { LtiToolService, verifiedLaunchUrl } from './lti-tool.service'
import { fakePlatformDb, registryOf } from './platform-test-helpers'
import { verifySession, type LtiSession } from './lti-session'
import { LtiCheckpointService } from './lti-checkpoint.service'
import { GET_SCRIPT, PUT_SCRIPT, scriptCsp } from './lti-tool.html'

// Platform storage for framed launches, the checkpoint launch, and the checkpoint score (GitHub issue #90).

const BASE = 'http://api.test/api'
const ISS = 'http://api.test'
const OWN_ORIGIN = 'http://api.test'
const LINEITEM = `${BASE}/lti/platform/ags/a1.mac/k1/lineitems/i1`
const platformKeys = generateKeyPair()

const PLACEMENT: CheckpointPlacement = {
  bankSlug: 'bank',
  refs: ['1.1', '1.2'],
  title: 'First morning',
  scenario: 'Your first morning on the data team',
  diagnostic: true,
  practice: null,
}

/** The bank's stored sections: 1.1 and 1.2 are SQL questions, 1.3 is not. */
const SECTIONS = [
  {
    id: 's1',
    questions: [
      { id: '1.1', type: 'sql' },
      { id: '1.2', type: 'sql' },
      { id: '1.3', type: 'mcq' },
    ],
  },
]

/** Another platform, whose OIDC auth endpoint is on its own host. */
const OTHER = {
  name: 'Other LMS',
  issuer: 'https://other.example',
  clientId: 'other-client',
  deploymentId: 'dep-o',
  authUrl: 'https://login.other.example/auth',
  tokenUrl: 'https://other.example/token',
  jwksUrl: 'https://other.example/jwks',
  enabled: true,
}

function setup(platforms: Record<string, unknown>[] = []) {
  const prisma = {
    scenario: { findUnique: jest.fn().mockResolvedValue(null) },
    cohort: { findUnique: jest.fn().mockResolvedValue({ id: 'k1' }) },
    assessment: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'as1', slug: 'bank', datasetId: 'ds1', sections: SECTIONS }),
    },
    assessmentDelivery: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'd1', timeLimitMinutes: null }),
      update: jest.fn().mockResolvedValue({}),
    },
  }
  const store = new MemoryLtiStore()
  const registry = registryOf(fakePlatformDb(platforms))
  const svc = new LtiToolService(prisma as never, {} as never, store, registry)
  const calls: { url: string; body?: string }[] = []
  let scoreStatus = 200
  svc.fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined })
    if (url.endsWith('/jwks')) return new Response(JSON.stringify(jwksOf(platformKeys)))
    if (url.endsWith('/token')) return new Response(JSON.stringify({ access_token: 'AT' }))
    return new Response('{}', { status: scoreStatus })
  }) as never
  return { svc, store, prisma, calls, setScoreStatus: (s: number) => (scoreStatus = s) }
}

const loginParams = (extra: Record<string, string> = {}) => ({
  iss: ISS,
  client_id: 'ld-platform',
  login_hint: 'u1',
  lti_message_hint: 'mh',
  ...extra,
})

function idToken(nonce: string, custom: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      iss: ISS,
      aud: 'ld-platform',
      sub: 'u1',
      nonce,
      iat: now,
      exp: now + 300,
      [CLAIM.messageType]: 'LtiResourceLinkRequest',
      [CLAIM.version]: '1.3.0',
      [CLAIM.deploymentId]: '1',
      [CLAIM.roles]: [LEARNER_ROLE],
      [CLAIM.context]: { id: 'k1' },
      [CLAIM.resourceLink]: { id: 'i1' },
      [CLAIM.custom]: {
        ref: 'bank',
        tool: 'id-checkpoint',
        checkpoint: JSON.stringify(PLACEMENT),
        ...custom,
      },
      [CLAIM.agsEndpoint]: { scope: [AGS_SCOPE_SCORE], lineitem: LINEITEM },
      [CLAIM.launchPresentation]: { document_target: 'iframe' },
    },
    platformKeys
  )
}

async function framedLogin(svc: LtiToolService, parentOrigin = 'http://learn.test') {
  const out = await svc.login(loginParams({ lti_storage_target: '_parent' }), 'ip', parentOrigin)
  const url = new URL(out.url)
  return { ...out, nonce: url.searchParams.get('nonce')!, url }
}

/** The JSON the storage page hands its script. */
const storageConfig = (html: string) =>
  JSON.parse(/<script type="application\/json" id="lti-storage">(.*?)<\/script>/.exec(html)![1])

const sessionOf = (out: unknown): LtiSession => {
  const r = out as { redirect?: string }
  if (!r.redirect) throw new Error('expected a redirect')
  return verifySession(r.redirect.split('#session=')[1])
}

const rejects = async (p: Promise<unknown>, text: string | RegExp, status?: number) => {
  const err = await p.then(
    () => null,
    (e) => e
  )
  expect(err).toBeInstanceOf(LtiError)
  expect(err.message).toMatch(text)
  if (status) expect(err.status).toBe(status)
}

beforeEach(() => {
  process.env.LTI_API_BASE = BASE
  process.env.LTI_LEARN_URL = 'http://learn.test'
  process.env.LTI_ID_WEB_URL = 'http://web.test'
  delete process.env.LTI_PLATFORM_ISSUER
  delete process.env.LTI_TOOL_SECRET
})

describe('platform storage: login', () => {
  it('puts the state in the platform page (put_data) before going to the platform', async () => {
    const { svc } = setup()
    const out = await framedLogin(svc)
    expect(out.page).toBeDefined()
    const cfg = storageConfig(out.page!.html)
    expect(cfg).toMatchObject({
      target: '_parent',
      origin: 'http://learn.test',
      key: `state_${out.state}`,
      value: out.nonce,
      next: out.url.toString(),
    })
    expect(out.page!.html).toContain(`<script nonce="${out.page!.nonce}">`)
    expect(out.page!.html).toContain("subject:'lti.put_data'")
  })

  it('sends storage messages only to an origin this platform may use', async () => {
    const { svc } = setup()
    const tenant = await framedLogin(svc, 'https://acme.learn.test')
    // a tenant host of the LearnDifferently site is the page's own origin
    expect(storageConfig(tenant.page!.html).origin).toBe('https://acme.learn.test')
    const evil = await framedLogin(svc, 'https://evil.test')
    expect(storageConfig(evil.page!.html).origin).toBe('http://learn.test')
    const none = await framedLogin(svc, undefined as never)
    expect(storageConfig(none.page!.html).origin).toBe('http://learn.test')
  })

  it("another platform's storage origin is its OIDC auth endpoint's, whatever the login says", async () => {
    const { svc } = setup([OTHER])
    for (const parent of ['https://other.example', 'https://evil.test', undefined]) {
      const out = await svc.login(
        {
          iss: OTHER.issuer,
          client_id: OTHER.clientId,
          login_hint: 'u1',
          lti_message_hint: 'mh',
          lti_storage_target: '_parent',
        },
        'ip',
        parent
      )
      expect(storageConfig(out.page!.html).origin).toBe('https://login.other.example')
    }
  })

  it('a login without lti_storage_target is a plain redirect, and a bad target is refused', async () => {
    const { svc } = setup()
    const out = await svc.login(loginParams(), 'ip', 'http://learn.test')
    expect(out.page).toBeUndefined()
    await rejects(
      svc.login(loginParams({ lti_storage_target: 'bad target!' }), 'ip'),
      'lti_storage_target'
    )
  })
})

describe('platform storage: launch', () => {
  it('without the cookie, asks the platform page for the state (get_data) without using it up', async () => {
    const { svc, store } = setup()
    const { state, nonce } = await framedLogin(svc)
    const token = idToken(nonce)
    const out = (await svc.launch(token, state, undefined)) as { page: { html: string } }
    expect(out.page).toBeDefined()
    const cfg = storageConfig(out.page.html)
    expect(cfg).toMatchObject({
      target: '_parent',
      origin: 'http://learn.test',
      key: `state_${state}`,
    })
    expect(cfg.value).toBeUndefined() // the page never carries the value it asks for
    expect(out.page.html).toContain(`action="${verifiedLaunchUrl()}"`)
    expect(out.page.html).toContain(`value="${token}"`)
    expect(await store.peek('lti-login', state)).not.toBeNull()
  })

  it("the page's CSP lets the verified post's redirect reach the web app, and nothing else", async () => {
    const { svc } = setup()
    const { state, nonce } = await framedLogin(svc)
    const out = (await svc.launch(idToken(nonce), state, undefined)) as {
      page: { nonce: string; formAction?: string[] }
    }
    expect(out.page.formAction).toEqual(['http://web.test'])
    expect(scriptCsp(out.page.nonce, out.page.formAction)).toContain(
      "form-action 'self' http://web.test"
    )
    // the login's put page has no form, and keeps the tool-only policy
    const login = await framedLogin(svc)
    expect(login.page!.formAction).toBeUndefined()
    expect(scriptCsp(login.page!.nonce, login.page!.formAction)).toMatch(/form-action 'self'$/)
  })

  it('put, get, then the verified post launches the checkpoint (happy path)', async () => {
    const { svc } = setup()
    const { state, nonce } = await framedLogin(svc)
    const token = idToken(nonce)
    await svc.launch(token, state, undefined)
    const session = sessionOf(await svc.launchVerified(token, state, nonce, OWN_ORIGIN))
    expect(session.checkpoint).toEqual({ deliveryId: 'd1', cohortId: 'k1', itemId: 'i1' })
  })

  it('refuses a stored value that does not match, without using up the state', async () => {
    const { svc } = setup()
    const { state, nonce } = await framedLogin(svc)
    const token = idToken(nonce)
    // someone who saw the state cannot cancel the learner's launch with a wrong value
    await rejects(svc.launchVerified(token, state, 'not-the-nonce', OWN_ORIGIN), 'does not match')
    await expect(svc.launchVerified(token, state, nonce, OWN_ORIGIN)).resolves.toBeDefined()
    await rejects(svc.launchVerified(token, state, nonce, OWN_ORIGIN), 'Unknown or expired state')
  })

  it('refuses a replayed verified post (single use)', async () => {
    const { svc } = setup()
    const { state, nonce } = await framedLogin(svc)
    const token = idToken(nonce)
    await svc.launchVerified(token, state, nonce, OWN_ORIGIN)
    await rejects(svc.launchVerified(token, state, nonce, OWN_ORIGIN), 'Unknown or expired state')
  })

  it('refuses a verified post from another site, without using up the state', async () => {
    const { svc } = setup()
    const { state, nonce } = await framedLogin(svc)
    const token = idToken(nonce)
    await rejects(
      svc.launchVerified(token, state, nonce, 'https://evil.test'),
      'does not match',
      403
    )
    await rejects(svc.launchVerified(token, state, nonce, undefined), 'does not match', 403)
    await expect(svc.launchVerified(token, state, nonce, OWN_ORIGIN)).resolves.toBeDefined()
  })

  it('never accepts a launch with neither the cookie nor platform storage', async () => {
    const { svc } = setup()
    const out = await svc.login(loginParams(), 'ip')
    const state = new URL(out.url).searchParams.get('state')!
    const nonce = new URL(out.url).searchParams.get('nonce')!
    await rejects(svc.launch(idToken(nonce), state, undefined), 'does not match')
    await rejects(svc.launch(idToken(nonce), state, 'other-state'), 'does not match')
    // a cookie login cannot be finished by the storage route either
    await rejects(svc.launchVerified(idToken(nonce), state, nonce, OWN_ORIGIN), 'does not match')
  })

  it('keeps the cookie path unchanged, framed or not', async () => {
    const { svc } = setup()
    const plain = await svc.login(loginParams(), 'ip')
    const s1 = new URL(plain.url).searchParams
    const a = sessionOf(
      await svc.launch(idToken(s1.get('nonce')!), s1.get('state')!, s1.get('state')!)
    )
    expect(a.checkpoint?.deliveryId).toBe('d1')
    const framed = await framedLogin(svc)
    const b = sessionOf(await svc.launch(idToken(framed.nonce), framed.state, framed.state))
    expect(b.checkpoint?.deliveryId).toBe('d1')
    // the cookie path used the state up
    await rejects(
      svc.launchVerified(idToken(framed.nonce), framed.state, framed.nonce, OWN_ORIGIN),
      'Unknown or expired state'
    )
  })
})

describe('checkpoint launch', () => {
  async function launch(h = setup(), custom: Record<string, unknown> = {}) {
    const out = await h.svc.login(loginParams(), 'ip')
    const q = new URL(out.url).searchParams
    return h.svc.launch(idToken(q.get('nonce')!, custom), q.get('state')!, q.get('state')!)
  }

  it('makes the delivery with the placement and sends the learner to the chat page', async () => {
    const h = setup()
    const out = (await launch(h)) as { redirect: string }
    expect(out.redirect).toMatch(/^http:\/\/web\.test\/lti\/checkpoint\/d1#session=/)
    expect(h.prisma.assessmentDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assessmentId: 'as1',
          cohortId: 'k1',
          label: 'lti:i1',
          config: PLACEMENT,
        }),
      })
    )
    const s = sessionOf(out)
    expect(s).toMatchObject({ sub: 'u1', ref: 'bank', lineitem: LINEITEM, datasets: [] })
    expect(s.deliveryId).toBeUndefined() // never an assessment session
  })

  it('reuses the delivery on relaunch and updates its placement when the course changed', async () => {
    const h = setup()
    h.prisma.assessmentDelivery.findFirst.mockResolvedValue({
      id: 'd9',
      timeLimitMinutes: null,
      config: { ...PLACEMENT, refs: ['1.1'] },
    })
    const s = sessionOf(await launch(h))
    expect(s.checkpoint?.deliveryId).toBe('d9')
    expect(h.prisma.assessmentDelivery.create).not.toHaveBeenCalled()
    expect(h.prisma.assessmentDelivery.update).toHaveBeenCalledWith({
      where: { id: 'd9' },
      data: { config: PLACEMENT },
    })
    h.prisma.assessmentDelivery.update.mockClear()
    h.prisma.assessmentDelivery.findFirst.mockResolvedValue({
      id: 'd9',
      timeLimitMinutes: null,
      config: PLACEMENT,
    })
    await launch(h)
    expect(h.prisma.assessmentDelivery.update).not.toHaveBeenCalled()
  })

  it('refuses a bad placement, another bank, and an unknown cohort', async () => {
    await rejects(launch(setup(), { checkpoint: '{"refs":1}' }), 'Invalid checkpoint')
    await rejects(launch(setup(), { ref: 'other' }), 'Invalid checkpoint')
    const h = setup()
    h.prisma.cohort.findUnique.mockResolvedValue(null)
    await rejects(launch(h), 'Cohort not found', 404)
  })

  it('refuses a placement naming a request the bank does not have, or one that is not SQL', async () => {
    for (const refs of [['1.1', '9.9'], ['1.3']]) {
      const h = setup()
      const checkpoint = JSON.stringify({ ...PLACEMENT, refs })
      await rejects(launch(h, { checkpoint }), 'question bank does not have', 409)
      expect(h.prisma.assessmentDelivery.create).not.toHaveBeenCalled()
      expect(h.prisma.assessmentDelivery.update).not.toHaveBeenCalled()
    }
  })

  it('is refused from any platform but LearnDifferently, before anything is looked up', async () => {
    const h = setup([OTHER])
    const out = await h.svc.login(
      { iss: OTHER.issuer, client_id: OTHER.clientId, login_hint: 'u1', lti_message_hint: 'mh' },
      'ip'
    )
    const q = new URL(out.url).searchParams
    const now = Math.floor(Date.now() / 1000)
    const token = signJwt(
      {
        iss: OTHER.issuer,
        aud: OTHER.clientId,
        sub: 'u1',
        nonce: q.get('nonce')!,
        iat: now,
        exp: now + 300,
        [CLAIM.messageType]: 'LtiResourceLinkRequest',
        [CLAIM.version]: '1.3.0',
        [CLAIM.deploymentId]: OTHER.deploymentId,
        [CLAIM.roles]: [LEARNER_ROLE],
        [CLAIM.context]: { id: 'k1' },
        [CLAIM.resourceLink]: { id: 'i1' },
        [CLAIM.custom]: { ref: 'bank', tool: 'id-checkpoint', checkpoint: PLACEMENT },
        [CLAIM.agsEndpoint]: {
          scope: [AGS_SCOPE_SCORE],
          lineitem: 'https://other.example/ags/lineitems/1',
        },
      },
      platformKeys
    )
    await rejects(
      h.svc.launch(token, q.get('state')!, q.get('state')!),
      'only be launched from LearnDifferently',
      403
    )
    expect(h.prisma.cohort.findUnique).not.toHaveBeenCalled()
    expect(h.prisma.assessmentDelivery.create).not.toHaveBeenCalled()
  })
})

describe('checkpoint score', () => {
  const session = (): LtiSession => ({
    sub: 'u1',
    ref: 'bank',
    lineitem: LINEITEM,
    checkpoint: { deliveryId: 'd1', cohortId: 'k1', itemId: 'i1' },
    jti: 'j',
    iat: 0,
    exp: Math.floor(Date.now() / 1000) + 600,
  })
  const scores = (calls: { url: string; body?: string }[]) =>
    calls.filter((c) => c.url.endsWith('/scores')).map((c) => JSON.parse(c.body!).scoreGiven)

  it('sends the score once when done, again only when it changes, and never while not done', async () => {
    const h = setup()
    await h.svc.syncCheckpointScore(session(), async () => null)
    await h.svc.syncCheckpointScore(session(), async () => 50)
    await h.svc.syncCheckpointScore(session(), async () => 50)
    await h.svc.syncCheckpointScore(session(), async () => 100)
    expect(scores(h.calls)).toEqual([50, 100])
  })

  it('does not throw when the platform refuses, and tries again next time', async () => {
    const h = setup()
    h.setScoreStatus(500)
    await expect(h.svc.syncCheckpointScore(session(), async () => 50)).resolves.toBeUndefined()
    h.setScoreStatus(200)
    await h.svc.syncCheckpointScore(session(), async () => 50)
    expect(scores(h.calls)).toEqual([50, 50])
  })

  it('posts after an answer that completes the checkpoint, not before', async () => {
    const h = setup()
    let done = false
    const chat = {
      contextOf: jest.fn(async () => ({ slot: {}, deliveryId: 'd1', placement: PLACEMENT })),
      answer: jest.fn(async () => ({ view: { done } })),
      score: jest.fn(async () => ({ done, scorePct: done ? 50 : null })),
    }
    const lc = new LtiCheckpointService(chat as never, h.svc, h.store)
    await lc.answer(session(), { ref: '1.1', sql: 'select 1' })
    expect(scores(h.calls)).toEqual([])
    done = true
    await lc.answer(session(), { ref: '1.2', pass: true })
    expect(scores(h.calls)).toEqual([50])
    expect(chat.contextOf).toHaveBeenCalledWith('d1', 'k1', 'u1', 'i1')
  })

  it('a view of a done checkpoint sends a score whose post failed, and never the same one twice', async () => {
    const h = setup()
    let done = false
    const chat = {
      contextOf: jest.fn(async () => ({ slot: {}, deliveryId: 'd1', placement: PLACEMENT })),
      view: jest.fn(async () => ({ done })),
      answer: jest.fn(async () => ({ view: { done } })),
      score: jest.fn(async () => ({ done, scorePct: done ? 50 : null })),
    }
    const lc = new LtiCheckpointService(chat as never, h.svc, h.store)
    await lc.view(session())
    expect(chat.score).not.toHaveBeenCalled() // not done: nothing to send
    done = true
    h.setScoreStatus(500)
    await lc.answer(session(), { ref: '1.2', pass: true }) // the post after the last answer fails
    h.setScoreStatus(200)
    await lc.view(session())
    await lc.view(session())
    expect(scores(h.calls)).toEqual([50, 50]) // the failed post, then the retry; no repeat after it
  })

  it('refuses a session that is not for a checkpoint', async () => {
    const h = setup()
    const lc = new LtiCheckpointService({} as never, h.svc, h.store)
    const s = { ...session(), checkpoint: undefined }
    await rejects(lc.view(s), 'not for a checkpoint', 403)
  })
})

describe('platform storage: the page scripts', () => {
  // The scripts run in a fake frame: only the parent at the trusted origin is talked to and believed.
  function frame(cfg: Record<string, unknown>) {
    const listeners: ((e: unknown) => void)[] = []
    const posted: { m: Record<string, unknown>; o: string }[] = []
    const parent = { postMessage: (m: Record<string, unknown>, o: string) => posted.push({ m, o }) }
    const form = {
      elements: { lti_storage_value: { value: '' } },
      submitted: false,
      submit() {
        this.submitted = true
      },
    }
    const els: Record<string, { textContent?: string; hidden?: boolean }> = {
      'lti-storage': { textContent: JSON.stringify(cfg) },
      wait: { hidden: false },
      fail: { hidden: true },
    }
    let went: string | null = null
    const window = {
      parent,
      addEventListener: (_: string, f: (e: unknown) => void) => listeners.push(f),
      location: { replace: (u: string) => (went = u) },
    }
    const document = { getElementById: (id: string) => els[id], forms: [form] }
    return {
      run: (src: string) =>
        runInNewContext(src, { window, document, setTimeout: () => 0, JSON, Date, Math }),
      send: (e: Record<string, unknown>) => listeners.forEach((f) => f({ source: parent, ...e })),
      posted,
      form,
      els,
      went: () => went,
    }
  }

  it('get_data: asks the parent at the trusted origin and posts only its answer', () => {
    const f = frame({ target: '_parent', origin: 'http://learn.test', key: 'state_s1', waitMs: 1 })
    f.run(GET_SCRIPT)
    expect(f.posted).toHaveLength(1)
    expect(f.posted[0].o).toBe('http://learn.test')
    expect(f.posted[0].m).toMatchObject({ subject: 'lti.get_data', key: 'state_s1' })
    const id = f.posted[0].m.message_id
    const answer = {
      subject: 'lti.get_data.response',
      message_id: id,
      key: 'state_s1',
      value: 'n1',
    }
    f.send({ origin: 'https://evil.test', data: answer })
    f.send({ origin: 'http://learn.test', source: {}, data: answer })
    f.send({ origin: 'http://learn.test', data: { ...answer, message_id: 'other' } })
    expect(f.form.submitted).toBe(false)
    f.send({ origin: 'http://learn.test', data: answer })
    expect(f.form.submitted).toBe(true)
    expect(f.form.elements.lti_storage_value.value).toBe('n1')
  })

  it('get_data: an error answer shows the failure and posts nothing', () => {
    const f = frame({ target: '_parent', origin: 'http://learn.test', key: 'state_s1', waitMs: 1 })
    f.run(GET_SCRIPT)
    const id = f.posted[0].m.message_id
    f.send({
      origin: 'http://learn.test',
      data: {
        subject: 'lti.get_data.response',
        message_id: id,
        key: 'state_s1',
        error: { code: 'x' },
      },
    })
    expect(f.form.submitted).toBe(false)
    expect(f.els.fail.hidden).toBe(false)
  })

  it('put_data: stores the value with the trusted origin, then goes on to the platform', () => {
    const f = frame({
      target: '_parent',
      origin: 'http://learn.test',
      key: 'state_s1',
      value: 'n1',
      next: 'http://api.test/auth',
      waitMs: 1,
    })
    f.run(PUT_SCRIPT)
    expect(f.posted[0]).toMatchObject({
      o: 'http://learn.test',
      m: { subject: 'lti.put_data', key: 'state_s1', value: 'n1' },
    })
    f.send({
      origin: 'https://evil.test',
      data: { subject: 'lti.put_data.response', message_id: f.posted[0].m.message_id },
    })
    expect(f.went()).toBeNull()
    f.send({
      origin: 'http://learn.test',
      data: { subject: 'lti.put_data.response', message_id: f.posted[0].m.message_id },
    })
    expect(f.went()).toBe('http://api.test/auth')
  })
})
