// Copies the shared types in packages/types/src into the API as src/learn/<name>-types.ts.
//
// The Railway build for the API only has the apps/api folder, so it cannot
// import the shared package. packages/types stays the single source (the web
// app imports it); these copies are generated, and a test fails CI if they differ.
//
//   npm run sync:types --workspace @id/api
//
// learn.ts becomes learn-types.ts; outcomes, talent, attendance and activity likewise.
// Their imports of each other (`from './learn'`, `from './talent'`, ...) are pointed at the copies (see copyOf below and learn-types.spec.ts).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export const NAMES = [
  'learn',
  'outcomes',
  'talent',
  'attendance',
  'activity',
  'record',
  'attention',
  'monitor',
]

/** Where each copy goes. The monitor types are the Simulator feed's contract, so they live in core, not in the LMS folder. */
export const dirOf = (name) => (name === 'monitor' ? 'core' : 'learn')

export const header = (
  name
) => `// GENERATED COPY of packages/types/src/${name}.ts. Do not edit here.
// Edit the original, then run: npm run sync:types --workspace @id/api
// (The API build has no access to packages/, so it carries its own copy.)

`

/** The text the copy of `original` must end with. */
export const copyOf = (original) =>
  original.replace(/from '\.\/(learn|outcomes|talent|attendance|activity)'/g, "from './$1-types'")

for (const name of NAMES) {
  const source = resolve(here, `../../../packages/types/src/${name}.ts`)
  const target = resolve(here, `../src/${dirOf(name)}/${name}-types.ts`)
  writeFileSync(target, header(name) + copyOf(readFileSync(source, 'utf8')))
  console.log(`Wrote src/${dirOf(name)}/${name}-types.ts`)
}
