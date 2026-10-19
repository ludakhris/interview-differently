/**
 * Accessibility scan of the built LearnDifferently site with axe-core (WCAG 2.1 A and AA rules). It fails on any
 * serious or critical violation and prints the rest.
 *
 *   npm run build -w @id/learn && npm run a11y:scan
 *
 * It serves apps/learn/dist the way vercel.json does (every page is home.html) and opens each page learners and staff
 * use without signing in. The marketing homepage and product pages are left out (owner's decision, 2026-10-19).
 * Signed-in screens need a sign-in, so they are checked statically instead, by eslint-plugin-jsx-a11y in each app's
 * lint. Animations are turned off (reduced motion), so text is checked in its settled state.
 */
import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'

const DIST = resolve(import.meta.dirname, '../apps/learn/dist')

export const PAGES = [
  '/?site=delaware',
  '/privacy',
  '/accessibility',
  '/sign-in',
  '/lms/dashboard',
  '/release-notes/',
  '/no-such-page',
]

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
}

/** The file vercel.json would serve for a path: real files first, then the page rewrites. */
export function fileFor(pathname: string): string {
  if (pathname === '/') return '/home.html'
  if (pathname.endsWith('/')) pathname += 'index.html'
  if (extname(pathname)) return pathname
  if (/^\/(privacy|accessibility|sign-in|products|lms)(\/|$)/.test(pathname)) return '/home.html'
  return '/404.html'
}

export function serve(): Promise<Server> {
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    const file = normalize(join(DIST, fileFor(pathname)))
    if (!file.startsWith(DIST)) return res.writeHead(403).end()
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)))
}

async function main() {
  const server = await serve()
  const address = server.address()
  const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  const browser = await chromium.launch()
  let failures = 0
  try {
    for (const path of PAGES) {
      const context = await browser.newContext({ reducedMotion: 'reduce' })
      const page = await context.newPage()
      await page.goto(base + path, { waitUntil: 'networkidle' })
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      await context.close()
      for (const v of violations) {
        const blocking = v.impact === 'serious' || v.impact === 'critical'
        if (blocking) failures++
        console.log(`${blocking ? 'FAIL' : 'note'} ${path} ${v.id} (${v.impact}): ${v.help}`)
        for (const node of v.nodes.slice(0, 5)) console.log(`       ${node.target.join(' ')}`)
      }
      if (violations.length === 0) console.log(`ok   ${path}`)
    }
  } finally {
    await browser.close()
    server.close()
  }
  if (failures > 0) {
    console.error(`\n${failures} serious or critical accessibility violation(s).`)
    process.exit(1)
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) await main()
