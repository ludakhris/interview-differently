import 'reflect-metadata'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ACCESS_METADATA } from './access.decorator'

/**
 * Every Learn Differently route must say who may call it (@Access, @SelfOnly or @Public). A route added
 * without one fails here, so access is never forgotten by default (GitHub issue #84).
 */

const SRC = join(__dirname, '..', '..')

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return controllerFiles(path)
    return name.endsWith('.controller.ts') ? [path] : []
  })
}

const startsWithLearn = (path: unknown): boolean =>
  (Array.isArray(path) ? path : [path]).some(
    (p) => typeof p === 'string' && p.replace(/^\//, '').split('/')[0] === 'learn'
  )

function learnRoutes(): { where: string; declared: unknown }[] {
  const out: { where: string; declared: unknown }[] = []
  for (const file of controllerFiles(SRC)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>
    for (const [exportName, cls] of Object.entries(mod)) {
      if (typeof cls !== 'function' || !startsWithLearn(Reflect.getMetadata('path', cls))) continue
      const proto = (cls as { prototype: Record<string, unknown> }).prototype
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name]
        if (typeof handler !== 'function' || Reflect.getMetadata('method', handler) === undefined)
          continue
        out.push({
          where: `${exportName}.${name}`,
          declared: Reflect.getMetadata(ACCESS_METADATA, handler),
        })
      }
    }
  }
  return out
}

describe('Learn Differently routes', () => {
  const routes = learnRoutes()

  it('are found (so this test cannot pass by looking at nothing)', () => {
    expect(routes.length).toBeGreaterThan(80)
  })

  it('each declare who may call them', () => {
    const missing = routes.filter((r) => !r.declared).map((r) => r.where)
    expect(missing).toEqual([])
  })
})
