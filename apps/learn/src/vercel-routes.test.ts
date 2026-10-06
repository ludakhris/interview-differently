import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

type Rule = { source: string; destination: string; has?: { value: string }[] }
const config = JSON.parse(readFileSync(resolve(__dirname, '../vercel.json'), 'utf8')) as {
  rewrites: Rule[]
}

const LEGACY = ['dashboard', 'courses', 'cohorts', 'learning', 'catalog']

describe('LMS routes live under /lms', () => {
  it('serves /lms/* from the Delaware page on its host and the home page elsewhere', () => {
    const lms = config.rewrites.filter((r) => r.source === '/lms/:path*')
    expect(
      lms.find((r) => r.has?.[0]?.value === 'delaware.learndifferently.tech')?.destination
    ).toBe('/delaware.html')
    expect(lms.find((r) => !r.has)?.destination).toBe('/home.html')
  })

  it('has no rewrites or redirects for the old top-level paths', () => {
    for (const p of LEGACY) {
      expect(config.rewrites.some((r) => r.source === `/${p}/:path*`)).toBe(false)
    }
    expect(config).not.toHaveProperty('redirects')
  })
})
