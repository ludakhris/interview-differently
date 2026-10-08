import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The API carries generated copies of the shared types (its build cannot reach
// packages/). If this fails, run: npm run sync:types --workspace @id/api
// The copies differ from the originals only by the header and by `from './learn'`
// pointing at the copy of learn.ts (learn-types.ts); keep this rule in step with
// scripts/sync-learn-types.mjs.
const NAMES = ['learn', 'outcomes', 'talent', 'attendance', 'activity', 'record', 'attention']

describe('shared types copies', () => {
  it.each(NAMES)('%s-types.ts matches packages/types/src/%s.ts', (name) => {
    const original = readFileSync(
      resolve(__dirname, `../../../../packages/types/src/${name}.ts`),
      'utf8'
    ).replace(/from '\.\/(learn|outcomes|talent|attendance|activity)'/g, "from './$1-types'")
    const copy = readFileSync(resolve(__dirname, `${name}-types.ts`), 'utf8')
    expect(copy.endsWith(original)).toBe(true)
    expect(copy.startsWith('// GENERATED COPY')).toBe(true)
  })
})
