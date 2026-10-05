import { BadRequestException } from '@nestjs/common'
import { strFromU8, unzipSync } from 'fflate'

export const MAX_FILES = 3000
export const MAX_UNZIPPED_BYTES = 250 * 1024 * 1024

export interface ScormPackage {
  version: '1.2' | '2004'
  /** Launch file, relative to the package root (may carry a query string). */
  entry: string
  title: string | null
  /** Package-relative path to file bytes. */
  files: Map<string, Uint8Array>
}

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  xml: 'application/xml',
  txt: 'text/plain; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  pdf: 'application/pdf',
}

export function contentTypeFor(path: string): string {
  const ext = path.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
  return TYPES[ext] ?? 'application/octet-stream'
}

/** A package-relative path that cannot climb out of the package. Null if unsafe. */
export function safePath(raw: string): string | null {
  const p = raw.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!p || p.startsWith('/') || /^[a-z]:/i.test(p) || p.includes('\0')) return null
  const parts = p.split('/')
  if (parts.some((s) => s === '..' || s === '')) return null
  return parts.join('/')
}

/** Reads a tag's attribute, whatever its case or namespace prefix. */
function attr(tag: string, name: string): string | null {
  const m = new RegExp(`(?:^|[\\s:])${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag)
  return m ? (m[2] ?? m[3] ?? '').trim() : null
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

export interface Manifest {
  version: '1.2' | '2004'
  entry: string
  title: string | null
}

/** Pulls the SCORM version, launch file and title out of imsmanifest.xml. */
export function parseManifest(xml: string): Manifest {
  const schema = /<schemaversion>\s*([^<]*?)\s*<\/schemaversion>/i.exec(xml)?.[1] ?? ''
  let version: '1.2' | '2004' | null = null
  if (/^1\.2$/.test(schema) || /adlcp_rootv1p2/i.test(xml)) version = '1.2'
  else if (/2004|CAM 1\.3|^1\.3$/i.test(schema) || /adlcp_v1p3/i.test(xml)) version = '2004'
  if (!version)
    throw new BadRequestException('This does not look like a SCORM 1.2 or SCORM 2004 package.')

  const resources = [...xml.matchAll(/<resource\b[^>]*>/gi)].map((m) => m[0])
  const org = /<organizations\b[^>]*default\s*=\s*["']([^"']+)["']/i.exec(xml)?.[1]
  const orgBlock = org
    ? new RegExp(
        `<organization\\b[^>]*identifier\\s*=\\s*["']${org.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][\\s\\S]*?<\\/organization>`,
        'i'
      ).exec(xml)?.[0]
    : /<organization\b[\s\S]*?<\/organization>/i.exec(xml)?.[0]
  const itemRef = [...(orgBlock ?? '').matchAll(/<item\b[^>]*>/gi)]
    .map((m) => attr(m[0], 'identifierref'))
    .find(Boolean)
  const byRef = itemRef ? resources.find((r) => attr(r, 'identifier') === itemRef) : undefined
  const resource = byRef ?? resources.find((r) => attr(r, 'href'))
  const href = resource ? attr(resource, 'href') : null
  if (!href) throw new BadRequestException('The package has no launch file in its manifest.')

  const rawTitle = /<title>\s*([^<]*?)\s*<\/title>/i.exec(orgBlock ?? xml)?.[1]
  return { version, entry: decodeXml(href), title: rawTitle ? decodeXml(rawTitle) : null }
}

/** Unzips a SCORM package, checks it, and returns its files rooted at the manifest. */
export function readScormZip(buffer: Buffer): ScormPackage {
  let count = 0
  let total = 0
  let raw: Record<string, Uint8Array>
  try {
    raw = unzipSync(new Uint8Array(buffer), {
      filter: (file) => {
        if (file.name.endsWith('/')) return false
        count += 1
        total += file.originalSize
        if (count > MAX_FILES)
          throw new BadRequestException(`The package has too many files (max ${MAX_FILES}).`)
        if (total > MAX_UNZIPPED_BYTES)
          throw new BadRequestException('The package is too large once unzipped.')
        return true
      },
    })
  } catch (err) {
    if (err instanceof BadRequestException) throw err
    throw new BadRequestException('That file is not a valid zip.')
  }

  const names = Object.keys(raw)
  const manifestName = names.find((n) => /(^|\/)imsmanifest\.xml$/i.test(n.replace(/\\/g, '/')))
  if (!manifestName)
    throw new BadRequestException('No imsmanifest.xml found. Upload a SCORM package .zip.')
  const base = manifestName.replace(/\\/g, '/').replace(/imsmanifest\.xml$/i, '')

  const files = new Map<string, Uint8Array>()
  for (const name of names) {
    const norm = name.replace(/\\/g, '/')
    if (!norm.startsWith(base)) continue
    const rel = safePath(norm.slice(base.length))
    if (!rel) throw new BadRequestException(`The package contains an unsafe path: ${name}`)
    files.set(rel, raw[name])
  }

  const manifest = parseManifest(strFromU8(raw[manifestName]))
  const entryPath = safePath(manifest.entry.split('?')[0].split('#')[0])
  if (!entryPath || !files.has(entryPath)) {
    throw new BadRequestException(
      'The launch file named in the manifest is missing from the package.'
    )
  }
  return { version: manifest.version, entry: manifest.entry, title: manifest.title, files }
}
