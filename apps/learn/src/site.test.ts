import { describe, expect, it } from 'vitest'
import { resolveSite } from './site'

describe('resolveSite', () => {
  it('serves the homepage on the root domain', () => {
    expect(resolveSite('learndifferently.online', '')).toBe('home')
    expect(resolveSite('www.learndifferently.online', '')).toBe('home')
  })

  it('serves a tenant on its subdomain', () => {
    expect(resolveSite('delaware.learndifferently.online', '')).toBe('delaware')
    expect(resolveSite('Delaware.learndifferently.online', '')).toBe('delaware')
    expect(resolveSite('delaware.localhost', '')).toBe('delaware')
  })

  it('falls back to the homepage for unknown subdomains and plain localhost', () => {
    expect(resolveSite('cd.learndifferently.online', '')).toBe('home')
    expect(resolveSite('localhost', '')).toBe('home')
  })

  it('honours a ?site= override for known sites only', () => {
    expect(resolveSite('localhost', '?site=delaware')).toBe('delaware')
    expect(resolveSite('delaware.localhost', '?site=home')).toBe('home')
    expect(resolveSite('localhost', '?site=nowhere')).toBe('home')
    expect(resolveSite('localhost', '?site=toString')).toBe('home')
  })
})
