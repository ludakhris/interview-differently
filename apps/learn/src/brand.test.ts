import { describe, expect, it } from 'vitest'
import { resolveContext, withBrand, withContext } from './brand'

describe('resolveContext', () => {
  it('wears the tenant brand on the tenant host', () => {
    expect(resolveContext('delaware.learndifferently.tech', '')).toEqual({
      tenant: 'delaware',
      fixedTenant: true,
      brand: 'delaware',
      query: '',
    })
  })

  it('shows the same tenant in the LearnDifferently skin on the root domain', () => {
    expect(resolveContext('learndifferently.tech', '?site=delaware')).toEqual({
      tenant: 'delaware',
      fixedTenant: false,
      brand: 'learn',
      query: '?site=delaware',
    })
  })

  it('has no tenant on the root domain without ?site=', () => {
    expect(resolveContext('learndifferently.tech', '').tenant).toBeNull()
  })

  it('lets ?brand= switch skins in either direction', () => {
    expect(resolveContext('delaware.learndifferently.tech', '?brand=learn').brand).toBe('learn')
    expect(resolveContext('learndifferently.tech', '?site=delaware&brand=delaware').brand).toBe(
      'delaware'
    )
  })

  it('never applies a tenant brand without that tenant', () => {
    expect(resolveContext('learndifferently.tech', '?brand=delaware').brand).toBe('learn')
  })

  it('ignores unknown brands and keeps only site and brand in links', () => {
    const ctx = resolveContext('learndifferently.tech', '?site=delaware&brand=pink&x=1')
    expect(ctx.brand).toBe('learn')
    expect(withContext(ctx, '/dashboard')).toBe('/dashboard?site=delaware&brand=pink')
  })
})

describe('resolveContext workspaces', () => {
  it('takes any well-formed ?site= slug on the root domain, for the API to authorise', () => {
    const ctx = resolveContext('learndifferently.tech', '?site=ohio-dol')
    expect(ctx).toMatchObject({ tenant: 'ohio-dol', fixedTenant: false, brand: 'learn' })
  })

  it('ignores malformed slugs', () => {
    expect(resolveContext('learndifferently.tech', '?site=../etc').tenant).toBeNull()
    expect(resolveContext('learndifferently.tech', '?site=home').tenant).toBeNull()
  })

  it('lets the host win over ?site= on a tenant host', () => {
    const ctx = resolveContext('delaware.learndifferently.tech', '?site=ohio-dol')
    expect(ctx).toMatchObject({ tenant: 'delaware', fixedTenant: true })
  })
})

describe('withBrand', () => {
  it('keeps other params and sets the brand', () => {
    expect(withBrand('?site=delaware', '/dashboard', 'delaware')).toBe(
      '/dashboard?site=delaware&brand=delaware'
    )
  })
})
