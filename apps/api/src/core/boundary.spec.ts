import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SRC = resolve(__dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return full.endsWith('.ts') && !full.endsWith('.spec.ts') ? [full] : []
  })
}

/** Resolved absolute paths of every relative import in a file. */
const importsOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/from\s+['"](\.[^'"]*)['"]/g)].map((m) =>
    resolve(join(file, '..'), m[1])
  )

// Simulator-owned code (product-boundaries.md, section 03). The LMS reads what the Simulator
// knows through the feed port in core, never by importing these.
const SIMULATOR = [
  'assessments',
  'tools',
  'scoring',
  'scenarios',
  'results',
  'datasets',
  'sql-runner',
  'interview-engine',
  'immersive-sessions',
  'analytics',
  'simulator-feed',
].map((d) => join(SRC, d))

describe('product boundary: the LMS does not import the Simulator', () => {
  it('nothing under learn/ imports Simulator code', () => {
    for (const file of sourceFiles(join(SRC, 'learn')))
      for (const target of importsOf(file))
        expect([file, SIMULATOR.some((d) => target === d || target.startsWith(d + '/'))]).toEqual([
          file,
          false,
        ])
  })

  it('core/ imports no product code', () => {
    const products = ['learn', 'lti', ...SIMULATOR.map((d) => d.slice(SRC.length + 1))].map((d) =>
      join(SRC, d)
    )
    for (const file of sourceFiles(join(SRC, 'core')))
      for (const target of importsOf(file))
        expect([file, products.some((d) => target === d || target.startsWith(d + '/'))]).toEqual([
          file,
          false,
        ])
  })
})
