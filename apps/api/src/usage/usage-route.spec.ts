import { normalizeRoute, toolForRoute } from './usage-route'

describe('normalizeRoute', () => {
  it.each([
    ['/dashboard', '/dashboard', null],
    ['/', '/', null],
    ['/scenario/biz-case-001/briefing', '/scenario/:id/briefing', 'biz-case-001'],
    ['/scenario/biz-case-001/play?x=1#top', '/scenario/:id/play', 'biz-case-001'],
    ['/scenario/s1/immersive/9f8e-uuid/feedback', '/scenario/:id/feedback', 's1'],
    ['/scenario/s1/feedback/result-123', '/scenario/:id/feedback', 's1'],
    ['/tools/sql?dataset=retail', '/tools/sql', null],
    ['/tools/assessments/attempt/abc-123', '/tools/assessments/attempt', null],
    ['/tools/assessments/attempt/abc-123/result', '/tools/assessments/result', null],
    ['/a/SECRETINVITE', '/a/:code', null],
    ['/admin/institutions/i1/students/user_abc', '/admin', null],
    ['/builder/some-scenario', '/builder', null],
    ['/dashboard/', '/dashboard', null],
    ['/totally/unknown/thing', '/other', null],
  ])('%s → %s', (raw, route, refId) => {
    expect(normalizeRoute(raw)).toEqual({ route, refId })
  })

  it('never lets ids, invite codes or query strings into the stored route', () => {
    for (const raw of [
      '/tools/assessments/attempt/abc-123/result',
      '/a/SECRETINVITE',
      '/admin/institutions/i1/students/user_abc',
      '/tools/sql?dataset=private',
    ]) {
      const { route } = normalizeRoute(raw)!
      expect(route).not.toMatch(/abc-123|SECRETINVITE|user_abc|i1|private|\?/)
    }
  })

  it('decodes and caps the scenario ref, and rejects non-strings and huge paths', () => {
    expect(normalizeRoute('/scenario/a%20b/briefing')?.refId).toBe('a b')
    expect(normalizeRoute(undefined)).toBeNull()
    expect(normalizeRoute('')).toBeNull()
    expect(normalizeRoute(42)).toBeNull()
    expect(normalizeRoute('/' + 'x'.repeat(400))).toBeNull()
  })

  it('maps routes to tools', () => {
    expect(toolForRoute('/tools/sql')).toBe('sql-sandbox')
    expect(toolForRoute('/tools/assessments')).toBe('assessments')
    expect(toolForRoute('/tools/assessments/result')).toBe('assessments')
    expect(toolForRoute('/dashboard')).toBeNull()
  })
})
