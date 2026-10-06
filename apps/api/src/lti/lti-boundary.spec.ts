import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = __dirname

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return full.endsWith('.ts') && !full.endsWith('.spec.ts') ? [full] : []
  })
}

/** Resolved absolute paths of every relative import in a file. */
function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const found = [...text.matchAll(/from\s+['"](\.[^'"]*)['"]/g)].map((m) => m[1])
  return found.map((rel) => resolve(join(file, '..'), rel))
}

describe('LTI boundary: the platform and a tool talk over HTTP only', () => {
  const platform = join(ROOT, 'platform')
  const tool = join(ROOT, 'tool')

  it('the platform never imports the tool', () => {
    for (const file of sourceFiles(platform))
      for (const target of importsOf(file))
        expect([file, target.startsWith(tool)]).toEqual([file, false])
  })

  it('the tool never imports the platform or any LMS (learn) code', () => {
    const learn = join(ROOT, '..', 'learn')
    for (const file of sourceFiles(tool))
      for (const target of importsOf(file)) {
        expect([file, target.startsWith(platform)]).toEqual([file, false])
        expect([file, target.startsWith(learn)]).toEqual([file, false])
      }
  })

  it('the tool does not import the learner or course services of the LMS', () => {
    for (const file of sourceFiles(tool)) {
      const text = readFileSync(file, 'utf8')
      expect([file, /learner\.service|courses\.service|learn\.service/.test(text)]).toEqual([
        file,
        false,
      ])
    }
  })

  it('the shared protocol layer imports nothing from this project', () => {
    expect(importsOf(join(ROOT, 'lti-spec.ts'))).toEqual([])
  })
})
