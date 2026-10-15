/** Tests for scripts/betterstack-sync.ts with Better Stack's API stubbed. Run: npm run test:scripts */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Monitoring } from '../ops/monitoring.ts'
import {
  desiredMonitors,
  planMonitorGroup,
  planMonitors,
  planResources,
  planSections,
  planStatusPage,
  rowName,
  sync,
  type MonitorAttrs,
  type Remote,
} from './betterstack-sync.ts'

const config: Monitoring = {
  platform: 'Example',
  monitorPrefix: 'EX',
  monitorGroup: 'Example group',
  apiBase: 'https://api.example.test',
  checkFrequency: 300,
  statusPage: { name: 'Example status', subdomain: 'example-status' },
  sections: [
    {
      emoji: '🏛️',
      name: 'LMS',
      short: 'LMS',
      checks: [{ name: 'API', path: '/api/health', explanation: 'The API answers.' }],
    },
    {
      emoji: '🕹️',
      name: 'Simulator',
      short: 'Sim',
      checks: [
        {
          name: 'Grading can run',
          path: '/api/health/grading/self-test',
          explanation: 'Scoring works.',
        },
        {
          name: 'Grading for learners',
          path: '/api/health/grading/recent-failures',
          explanation: 'Down on any scoring failure in 15 minutes.',
        },
      ],
    },
  ],
}

const monitor = (
  id: string,
  url: string,
  name: string,
  extra: Partial<MonitorAttrs> = {}
): Remote<MonitorAttrs> => ({
  id,
  attributes: {
    url,
    pronounceable_name: name,
    monitor_type: 'status',
    email: true,
    check_frequency: 300,
    monitor_group_id: 40,
    ...extra,
  },
})

test('monitor group: created when missing, matched by name', () => {
  assert.deepEqual(planMonitorGroup(config, [{ id: '1', attributes: { name: 'Other' } }]).changes, [
    {
      action: 'create',
      label: 'monitor group "Example group"',
      key: 'Example group',
      path: '/monitor-groups',
      body: { name: 'Example group' },
    },
  ])
  const found = planMonitorGroup(config, [{ id: '40', attributes: { name: 'Example group' } }])
  assert.equal(found.changes.length, 0)
  assert.equal(found.unchanged.get('Example group'), '40')
})

test('monitors: creates what is missing, named with the platform, in our group, 2xx, email alerts', () => {
  const plan = planMonitors(config, '40', [])
  assert.equal(plan.changes.length, 3)
  assert.deepEqual(plan.changes[0], {
    action: 'create',
    label: 'monitor "EX · 🏛️ LMS · API" https://api.example.test/api/health',
    key: 'https://api.example.test/api/health',
    path: '/monitors',
    body: {
      url: 'https://api.example.test/api/health',
      pronounceable_name: 'EX · 🏛️ LMS · API',
      monitor_type: 'status',
      email: true,
      check_frequency: 300,
      monitor_group_id: 40,
    },
  })
})

test('monitors: unchanged when they match; a rename or a moved URL updates in place', () => {
  const plan = planMonitors(config, '40', [
    monitor('1', 'https://api.example.test/api/health', 'EX · 🏛️ LMS · API'),
    monitor('2', 'https://api.example.test/api/health/grading/self-test', 'Old name'),
    monitor('3', 'https://api.example.test/api/old-path', 'EX · 🕹️ Sim · Grading for learners'),
  ])
  assert.deepEqual([...plan.unchanged], [['https://api.example.test/api/health', '1']])
  assert.deepEqual(
    plan.changes.map((c) => [c.action, c.id, c.body]),
    [
      ['update', '2', { pronounceable_name: 'EX · 🕹️ Sim · Grading can run' }],
      ['update', '3', { url: 'https://api.example.test/api/health/grading/recent-failures' }],
    ]
  )
  assert.deepEqual(plan.extras, [])
})

test('monitors: adding the platform prefix renames by URL, no duplicates; ungrouped ones join the group', () => {
  const plan = planMonitors(config, '40', [
    monitor('1', 'https://api.example.test/api/health', '🏛️ API', { monitor_group_id: null }),
    monitor('2', 'https://api.example.test/api/health/grading/self-test', '🕹️ Grading can run'),
    monitor(
      '3',
      'https://api.example.test/api/health/grading/recent-failures',
      '🕹️ Grading for learners'
    ),
  ])
  assert.ok(plan.changes.every((c) => c.action === 'update'))
  assert.deepEqual(
    plan.changes.map((c) => [c.id, c.body]),
    [
      ['1', { pronounceable_name: 'EX · 🏛️ LMS · API', monitor_group_id: 40 }],
      ['2', { pronounceable_name: 'EX · 🕹️ Sim · Grading can run' }],
      ['3', { pronounceable_name: 'EX · 🕹️ Sim · Grading for learners' }],
    ]
  )
  assert.deepEqual(plan.extras, [])
})

test('monitors: settings changed by hand are put back', () => {
  const plan = planMonitors(config, '40', [
    monitor('1', 'https://api.example.test/api/health', 'EX · 🏛️ LMS · API', {
      email: false,
      check_frequency: 30,
    }),
  ])
  assert.deepEqual(plan.changes[0].body, { email: true, check_frequency: 300 })
})

test('monitors: ones on our API or in our group not in the list are reported, others ignored, nothing deleted', () => {
  const plan = planMonitors(config, '40', [
    monitor('9', 'https://api.example.test/api/health/removed', 'Removed'),
    monitor('10', 'https://elsewhere.test/', 'Someone else', { monitor_group_id: 41 }),
    monitor('11', 'https://other.test/', 'In our group'),
  ])
  assert.deepEqual(plan.extras, [
    'monitor "Removed" https://api.example.test/api/health/removed (id 9)',
    'monitor "In our group" https://other.test/ (id 11)',
  ])
  assert.ok(plan.changes.every((c) => c.action === 'create'))
})

test('status page: matched by subdomain; created when missing, never renamed (it is shared)', () => {
  assert.deepEqual(planStatusPage(config, []).changes[0].body, {
    company_name: 'Example status',
    subdomain: 'example-status',
  })
  const other = planStatusPage(config, [
    { id: '7', attributes: { company_name: 'Someone else’s title', subdomain: 'example-status' } },
  ])
  assert.equal(other.changes.length, 0)
  assert.equal(other.unchanged.get('example-status'), '7')
})

test('rows are named platform · product · check', () => {
  assert.equal(
    rowName(config.platform, config.sections[1], 'Grading can run'),
    'Example · 🕹️ Simulator · Grading can run'
  )
})

test('sections: one section titled with the platform, created when missing; others (old per-product ones too) are reported', () => {
  const plan = planSections(config, '7', [
    { id: '20', attributes: { name: 'Example · 🕹️ Simulator' } },
    { id: '21', attributes: { name: 'Current status by service' } },
  ])
  assert.deepEqual(
    plan.changes.map((c) => [c.action, c.path, c.body]),
    [['create', '/status-pages/7/sections', { name: 'Example', position: 0 }]]
  )
  assert.equal(plan.unchanged.size, 0)
  assert.deepEqual(plan.extras, [
    'status page section "Example · 🕹️ Simulator" (id 20)',
    'status page section "Current status by service" (id 21)',
  ])
  const found = planSections(config, '7', [
    { id: '10', attributes: { name: 'Example' } },
    { id: '20', attributes: { name: 'Example · 🕹️ Simulator' } },
  ])
  assert.equal(found.changes.length, 0)
  assert.equal(found.unchanged.get('Example'), '10')
  assert.deepEqual(found.extras, ['status page section "Example · 🕹️ Simulator" (id 20)'])
})

test('resources: a check can choose its row display; it is updated when Better Stack reports another', () => {
  const withWidget: Monitoring = {
    ...config,
    sections: config.sections.map((sec) => ({
      ...sec,
      checks: sec.checks.map((c) =>
        c.path.endsWith('recent-failures') ? { ...c, widget: 'intraday_history' as const } : c
      ),
    })),
  }
  const monitorIds = new Map(desiredMonitors(withWidget).map((d, i) => [d.url, String(i + 1)]))
  const sectionIds = new Map([['Example', '10']])
  const created = planResources(withWidget, '7', monitorIds, sectionIds, [])
  assert.deepEqual(
    created.changes.map((c) => (c.body as { widget_type: string }).widget_type),
    ['history', 'history', 'intraday_history']
  )
  assert.ok(desiredMonitors(withWidget).every((d) => d.section === 'Example'))
  const existing = desiredMonitors(withWidget).map((d, i) => ({
    id: String(100 + i),
    attributes: {
      status_page_section_id: 10,
      resource_id: String(i + 1),
      resource_type: 'Monitor',
      public_name: d.publicName,
      widget_type: 'history',
    },
  }))
  const updated = planResources(withWidget, '7', monitorIds, sectionIds, existing)
  assert.deepEqual(
    updated.changes.map((c) => [c.id, c.body]),
    [['102', { widget_type: 'intraday_history' }]]
  )
})

test('resources: one row per monitor in the platform section; rows moved from an old section or renamed are updated', () => {
  const monitorIds = new Map([
    ['https://api.example.test/api/health', '1'],
    ['https://api.example.test/api/health/grading/self-test', '2'],
    ['https://api.example.test/api/health/grading/recent-failures', '3'],
  ])
  const sectionIds = new Map([['Example', '10']])
  const plan = planResources(config, '7', monitorIds, sectionIds, [
    {
      id: '100',
      attributes: {
        resource_type: 'Monitor',
        resource_id: 1,
        public_name: 'Example · 🏛️ LMS · API',
        status_page_section_id: 10,
      },
    },
    {
      id: '101',
      attributes: {
        resource_type: 'Monitor',
        resource_id: 2,
        public_name: 'Grading can run',
        status_page_section_id: 20,
      },
    },
    {
      id: '102',
      attributes: {
        resource_type: 'Monitor',
        resource_id: 99,
        public_name: 'Gone',
        status_page_section_id: 10,
      },
    },
  ])
  assert.equal(plan.unchanged.get('https://api.example.test/api/health'), '100')
  assert.deepEqual(
    plan.changes.map((c) => [c.action, c.path, c.body]),
    [
      [
        'update',
        '/status-pages/7/resources/101',
        {
          public_name: 'Example · 🕹️ Simulator · Grading can run',
          status_page_section_id: 10,
        },
      ],
      [
        'create',
        '/status-pages/7/resources',
        {
          resource_type: 'Monitor',
          resource_id: '3',
          public_name: 'Example · 🕹️ Simulator · Grading for learners',
          status_page_section_id: 10,
          widget_type: 'history',
          explanation: 'Down on any scoring failure in 15 minutes.',
        },
      ],
    ]
  )
  assert.deepEqual(plan.extras, ['status page row "Gone" (Monitor, id 102)'])
})

/** A stubbed Better Stack: answers lists from `state`, records writes, hands out ids. */
function stub(state: Record<string, unknown[]>) {
  const calls: { method: string; url: string; body?: unknown }[] = []
  let nextId = 500
  const fetchImpl = async (url: string, init: RequestInit) => {
    const method = init.method ?? 'GET'
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer fake-token')
    calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined })
    const path = new URL(url).pathname.replace('/api/v2', '')
    const json =
      method === 'GET'
        ? { data: state[path] ?? [], pagination: { next: null } }
        : { data: { id: String(nextId++), attributes: {} } }
    return new Response(JSON.stringify(json), { status: method === 'POST' ? 201 : 200 })
  }
  return { calls, fetchImpl }
}

test('sync --dry-run on an empty account plans everything and writes nothing', async () => {
  const { calls, fetchImpl } = stub({})
  const lines: string[] = []
  const result = await sync({
    token: 'fake-token',
    dryRun: true,
    config,
    fetchImpl,
    log: (l) => lines.push(l),
  })
  assert.ok(calls.every((c) => c.method === 'GET'))
  // A new status page has no sections or rows to read yet.
  assert.deepEqual(
    calls.map((c) => new URL(c.url).pathname),
    ['/api/v2/monitor-groups', '/api/v2/monitors', '/api/v2/status-pages']
  )
  assert.deepEqual(result, { creates: 1 + 3 + 1 + 1 + 3, updates: 0, extras: [] })
  assert.deepEqual(lines, [
    '+ create monitor group "Example group"',
    '+ create monitor "EX · 🏛️ LMS · API" https://api.example.test/api/health',
    '+ create monitor "EX · 🕹️ Sim · Grading can run" https://api.example.test/api/health/grading/self-test',
    '+ create monitor "EX · 🕹️ Sim · Grading for learners" https://api.example.test/api/health/grading/recent-failures',
    '+ create status page "Example status" (example-status)',
    '+ create section "Example"',
    '+ create status page row "Example · 🏛️ LMS · API" in "Example"',
    '+ create status page row "Example · 🕹️ Simulator · Grading can run" in "Example"',
    '+ create status page row "Example · 🕹️ Simulator · Grading for learners" in "Example"',
    'Dry run, nothing changed: would make 9 create(s), 0 update(s), 0 not in the list.',
  ])
})

test('sync applies creates in order, wiring new ids into later steps', async () => {
  const { calls, fetchImpl } = stub({})
  await sync({ token: 'fake-token', dryRun: false, config, fetchImpl, log: () => {} })
  const writes = calls.filter((c) => c.method !== 'GET')
  // Group 500, monitors 501-503, page 504, section 505, then a row per monitor.
  assert.deepEqual(
    writes.map((w) => new URL(w.url).pathname),
    [
      '/api/v2/monitor-groups',
      '/api/v2/monitors',
      '/api/v2/monitors',
      '/api/v2/monitors',
      '/api/v2/status-pages',
      '/api/v2/status-pages/504/sections',
      '/api/v2/status-pages/504/resources',
      '/api/v2/status-pages/504/resources',
      '/api/v2/status-pages/504/resources',
    ]
  )
  assert.equal((writes[1].body as { monitor_group_id: number }).monitor_group_id, 500)
  assert.deepEqual(writes[5].body, { name: 'Example', position: 0 })
  assert.deepEqual(writes[8].body, {
    resource_type: 'Monitor',
    resource_id: '503',
    public_name: 'Example · 🕹️ Simulator · Grading for learners',
    status_page_section_id: 505,
    widget_type: 'history',
    explanation: 'Down on any scoring failure in 15 minutes.',
  })
})

test('sync is a no-op when the account already matches', async () => {
  const urls = [
    ['https://api.example.test/api/health', 'EX · 🏛️ LMS · API'],
    ['https://api.example.test/api/health/grading/self-test', 'EX · 🕹️ Sim · Grading can run'],
    [
      'https://api.example.test/api/health/grading/recent-failures',
      'EX · 🕹️ Sim · Grading for learners',
    ],
  ]
  const { calls, fetchImpl } = stub({
    '/monitor-groups': [{ id: '40', attributes: { name: 'Example group' } }],
    '/monitors': urls.map(([url, name], i) => monitor(String(i + 1), url, name)),
    '/status-pages': [
      { id: '7', attributes: { company_name: 'Example status', subdomain: 'example-status' } },
    ],
    '/status-pages/7/sections': [{ id: '10', attributes: { name: 'Example' } }],
    '/status-pages/7/resources': [
      ['1', 'Example · 🏛️ LMS · API', 10],
      ['2', 'Example · 🕹️ Simulator · Grading can run', 10],
      ['3', 'Example · 🕹️ Simulator · Grading for learners', 10],
    ].map(([resource_id, public_name, status_page_section_id], i) => ({
      id: String(100 + i),
      attributes: { resource_type: 'Monitor', resource_id, public_name, status_page_section_id },
    })),
  })
  const result = await sync({
    token: 'fake-token',
    dryRun: false,
    config,
    fetchImpl,
    log: () => {},
  })
  assert.deepEqual(result, { creates: 0, updates: 0, extras: [] })
  assert.ok(calls.every((c) => c.method === 'GET'))
})

test('lists follow pagination on the Better Stack host only', async () => {
  const seen: string[] = []
  const fetchImpl = async (url: string) => {
    seen.push(url)
    const second = url.includes('?page=2')
    return new Response(
      JSON.stringify({
        data: [],
        pagination: {
          next: second ? null : 'https://somewhere.else/api/v2/anything?page=2&per_page=250',
        },
      })
    )
  }
  await sync({ token: 'fake-token', dryRun: true, config, fetchImpl, log: () => {} })
  assert.equal(
    seen[1],
    'https://incidents.betterstack.com/api/v2/monitor-groups?page=2&per_page=250'
  )
})

test('an API error stops the sync with its status', async () => {
  const fetchImpl = async () => new Response('{"errors":"nope"}', { status: 401 })
  await assert.rejects(
    sync({ token: 'fake-token', dryRun: true, config, fetchImpl, log: () => {} }),
    /Better Stack GET \/monitor-groups\?per_page=250: 401/
  )
})
