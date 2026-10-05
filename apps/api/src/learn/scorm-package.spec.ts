import { BadRequestException } from '@nestjs/common'
import { strToU8, zipSync } from 'fflate'
import { contentTypeFor, parseManifest, readScormZip, safePath } from './scorm-package'

const MANIFEST_12 = `<?xml version="1.0"?>
<manifest identifier="m1" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="org1">
    <organization identifier="org1"><title>Safe lifting</title>
      <item identifier="i1" identifierref="r1"><title>Lesson</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="r0" type="webcontent" href="other.html"/>
    <resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="story/index.html?mode=1"/>
  </resources>
</manifest>`

const MANIFEST_2004 = `<manifest xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3">
  <metadata><schemaversion>2004 4th Edition</schemaversion></metadata>
  <organizations default="o"><organization identifier="o"><title>Forklift basics</title>
    <item identifier="a" identifierref="res"/></organization></organizations>
  <resources><resource identifier="res" adlcp:scormType="sco" href="start.html"/></resources>
</manifest>`

describe('parseManifest', () => {
  it('reads a SCORM 1.2 manifest: the launch resource of the first item, and the title', () => {
    expect(parseManifest(MANIFEST_12)).toEqual({
      version: '1.2',
      entry: 'story/index.html?mode=1',
      title: 'Safe lifting',
    })
  })

  it('reads a SCORM 2004 manifest', () => {
    expect(parseManifest(MANIFEST_2004)).toMatchObject({
      version: '2004',
      entry: 'start.html',
      title: 'Forklift basics',
    })
  })

  it('rejects anything that is not SCORM, or has no launch file', () => {
    expect(() => parseManifest('<manifest></manifest>')).toThrow(BadRequestException)
    expect(() =>
      parseManifest('<manifest><metadata><schemaversion>1.2</schemaversion></metadata></manifest>')
    ).toThrow(/launch/)
  })
})

describe('readScormZip', () => {
  const zip = (files: Record<string, string>) =>
    Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))))

  it('reads a package and roots it at the manifest', () => {
    const pkg = readScormZip(
      zip({ 'imsmanifest.xml': MANIFEST_12, 'story/index.html': '<html/>', 'other.html': 'x' })
    )
    expect(pkg.version).toBe('1.2')
    expect([...pkg.files.keys()].sort()).toEqual([
      'imsmanifest.xml',
      'other.html',
      'story/index.html',
    ])
  })

  it('handles a package zipped inside a top-level folder', () => {
    const pkg = readScormZip(
      zip({ 'course/imsmanifest.xml': MANIFEST_2004, 'course/start.html': '<html/>' })
    )
    expect(pkg.files.has('start.html')).toBe(true)
    expect(pkg.files.has('course/start.html')).toBe(false)
  })

  it('rejects a zip without a manifest, a missing launch file, and non-zips', () => {
    expect(() => readScormZip(zip({ 'index.html': 'x' }))).toThrow(/imsmanifest/)
    expect(() => readScormZip(zip({ 'imsmanifest.xml': MANIFEST_12 }))).toThrow(/missing/)
    expect(() => readScormZip(Buffer.from('not a zip'))).toThrow(/valid zip/)
  })

  it('rejects paths that climb out of the package', () => {
    expect(() =>
      readScormZip(
        zip({ 'imsmanifest.xml': MANIFEST_12, 'story/index.html': 'x', '../evil.js': 'x' })
      )
    ).toThrow(BadRequestException)
  })
})

describe('safePath and contentTypeFor', () => {
  it('only allows relative paths inside the package', () => {
    expect(safePath('a/b.js')).toBe('a/b.js')
    expect(safePath('./a.js')).toBe('a.js')
    for (const bad of ['../a', 'a/../b', '/etc/passwd', 'C:\\x', 'a//b', ''])
      expect(safePath(bad)).toBeNull()
  })

  it('maps file types and falls back safely', () => {
    expect(contentTypeFor('index.html')).toContain('text/html')
    expect(contentTypeFor('a/app.JS')).toContain('javascript')
    expect(contentTypeFor('x.unknown')).toBe('application/octet-stream')
    expect(contentTypeFor('page.html?x=1')).toContain('text/html')
  })
})
